// The app marks in the bio (src/components/AppMark.astro). On hover, keyboard focus or a first tap on a phone,
// the icon hops and embers rise out of it: a few pop and burn out, the rest are caught by a spring that ramps
// in, so each rise turns into a glide that settles on one cell of the pixel glyph above the icon. When most
// have landed the glyph catches, bottom row first, the embers melt into it and the number rolls up beside it.
// While it stays open an ember now and then rises to feed it, and the glyph breathes as it lands. Leaving
// lets the embers go: they drift off and burn out instead of vanishing.
// Embers are drawn on one small canvas per mark, made on the first open and drawn only while something moves.
import { sound } from './sound';

/** The canvas: a square centred on the icon, big enough for the rise. */
const SIZE = 160;
/** Embers that build the glyph (fewer if the glyph is small). */
const GATHER = 18;
/** Seconds after opening: the latest the glyph catches, even with embers still on the way. */
const LIGHT_AT = 0.8;
/** Seconds the number takes to roll up once the glyph has caught. */
const COUNT = 0.65;
const CLOSE_DELAY = 120;
/** the fade out in the CSS, in ms */
const EXIT = 180;

type Seat = { x: number; y: number };
type Ember = {
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; sway: number; seed: number;
  /** a burst ember: strong drag, no pull */
  pop: boolean;
  /** the glyph cell it settles on, and whether it only feeds the lit glyph */
  seat: Seat | null; feed: boolean;
  held: boolean; fade: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const isLight = () => document.documentElement.dataset.theme === 'light';

export function mountMarks(reduce: boolean) {
  const marks = [...document.querySelectorAll<HTMLAnchorElement>('a.appmark[data-mark]')];
  if (!marks.length) return;
  const touch = matchMedia('(hover: none)');
  const closers: ((now?: boolean) => void)[] = [];

  for (const m of marks) {
    const burstEl = m.querySelector<HTMLElement>('.burst');
    const glyphEl = burstEl?.querySelector<HTMLElement>('.glyph');
    const numEl = burstEl?.querySelector<HTMLElement>('b');
    if (!burstEl || !glyphEl || !numEl) continue;
    const burst = burstEl, glyph = glyphEl, num = numEl;
    const to = Number(num.dataset.to) || 0;
    const final = to.toLocaleString('en-US');
    const cells = [...glyph.querySelectorAll<HTMLElement>('i')].map((p) => ({
      x: Number(p.style.getPropertyValue('--x')), y: Number(p.style.getPropertyValue('--y')),
    }));

    // The cells embers settle on: spread out so no two crowd, the same set every time.
    const seatCells: Seat[] = [];
    for (const c of [...cells].sort(() => Math.random() - 0.5)) {
      if (seatCells.length >= GATHER) break;
      if (seatCells.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 1.5)) continue;
      seatCells.push(c);
    }
    const need = seatCells.length;

    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let embers: Ember[] = [];
    let running = false;
    let last = 0;
    let open = false;
    let lit = false;
    let t = 0, arrived = 0, feedIn = 0;
    let queue: { at: number; seat: Seat }[] = [];
    /** where things are on the canvas: the icon's centre, and the glyph's top left */
    let ox = SIZE / 2, oy = SIZE / 2, gx = 0, gy = 0;
    let colors = { core: '#fff', hot: '#fff', warm: '#fff' };
    let closeT = 0, hideT = 0, countRaf = 0;

    const stage = () => {
      if (canvas) return;
      canvas = document.createElement('canvas');
      canvas.className = 'embers';
      canvas.setAttribute('aria-hidden', 'true');
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = canvas.height = SIZE * dpr;
      canvas.style.width = canvas.style.height = `${SIZE}px`;
      m.appendChild(canvas);
      ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
    };

    // keep the number and glyph 8px inside the window
    const place = () => {
      burst.style.setProperty('--dx', '0px');
      const r = burst.getBoundingClientRect();
      const max = document.documentElement.clientWidth - 8;
      const dx = r.right > max ? max - r.right : r.left < 8 ? 8 - r.left : 0;
      burst.style.setProperty('--dx', `${Math.round(dx)}px`);
    };

    // The glyph's unscaled top left, on the canvas (the glyph itself is scaled down until it catches).
    const measure = () => {
      if (!canvas) return;
      const c = canvas.getBoundingClientRect();
      const b = burst.getBoundingClientRect();
      gx = b.left + glyph.offsetLeft - c.left;
      gy = b.top + glyph.offsetTop - c.top;
      ox = c.width / 2;
      oy = c.height / 2;
      const cs = getComputedStyle(burst);
      colors = {
        core: cs.getPropertyValue('--core').trim(),
        hot: cs.getPropertyValue('--hot').trim(),
        warm: cs.getPropertyValue('--warm').trim(),
      };
    };

    // a filter keyframe for the glyph that keeps its glow on the dark ground (an animated filter replaces the CSS one)
    const lum = (b: number) => (isLight() ? `brightness(${b})` : `brightness(${b}) drop-shadow(0 0 2px ${colors.warm})`);
    const seatAt = (s: Seat) => ({ x: gx + s.x * 2 + 1, y: gy + s.y * 2 + 1 });
    const heat = (k: number) => (k < 0.2 ? colors.core : k < 0.55 ? colors.hot : colors.warm);

    const ember = (pop: boolean, seat: Seat | null = null, feed = false) => {
      const a = -Math.PI / 2 + rand(-0.9, 0.9);
      embers.push({
        x: ox + rand(-5, 5), y: oy - 8,
        vx: pop ? Math.cos(a) * rand(30, 60) : rand(-5, 5),
        vy: pop ? Math.sin(a) * rand(30, 60) : -rand(26, 40),
        age: 0, life: pop ? rand(0.4, 0.6) : rand(0.9, 1.3),
        sway: rand(6, 10), seed: rand(0, 9),
        pop, seat, feed, held: false, fade: 1,
      });
      wake();
    };

    /** A feeding ember lands: the glyph breathes once. */
    const breathe = () => {
      glyph.animate([{ scale: 1, filter: lum(1) }, { scale: 1.12, filter: lum(1.35) }, { scale: 1, filter: lum(1) }], {
        duration: 320, easing: 'cubic-bezier(.34,1.4,.64,1)',
      });
    };

    /** Move and draw one ember. False when it is gone. */
    const step = (p: Ember, dt: number, c: CanvasRenderingContext2D) => {
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      const pulled = p.seat !== null && open && p.age > 0.12;
      if (pulled) {
        // A critically damped spring to the cell. Its stiffness ramps in, so the rise turns into a glide.
        const g = seatAt(p.seat!);
        const w = 19 * Math.min(1, (p.age - 0.12) / 0.26);
        p.vx += (w * w * (g.x - p.x) - 2 * w * p.vx) * dt;
        p.vy += (w * w * (g.y - p.y) - 2 * w * p.vy) * dt;
        if (!p.held && Math.hypot(g.x - p.x, g.y - p.y) < 1.2) {
          p.held = true;
          if (p.feed) { breathe(); p.fade = 0; } else arrived++;
        }
      } else {
        const drag = Math.exp(-(p.pop ? 4 : 0.6) * dt);
        p.vx = p.vx * drag + Math.sin(p.age * p.sway + p.seed) * 6 * dt;
        p.vy = p.vy * drag - (p.pop ? 0 : 6 * dt);
      }
      if (p.held) {
        // sitting in its cell: snap to it, so it lines up with the glyph that takes over
        const g = seatAt(p.seat!);
        p.x = g.x; p.y = g.y; p.vx = p.vy = 0;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      // once the glyph catches, the embers in it melt into the drawn pixels
      if (lit && p.seat && !p.feed) p.fade -= dt / 0.16;
      if (p.fade <= 0 || (!pulled && k >= 1)) return false;

      // square embers, so they read as the same pixels the glyph is made of
      const flicker = 0.7 + 0.3 * Math.sin(p.age * 38 + p.seed);
      const side = pulled ? 2 : Math.max(1, 2.6 * (1 - k * 0.6));
      c.globalAlpha = Math.max(0, (pulled ? 1 : 1 - k) * flicker * p.fade);
      c.fillStyle = p.held ? colors.hot : heat(k * 0.9);
      if (!isLight()) { c.shadowColor = colors.warm; c.shadowBlur = 6; }
      c.fillRect(p.x - side / 2, p.y - side / 2, side, side);
      c.shadowBlur = 0;
      return true;
    };

    const wake = () => {
      if (running || !ctx) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (open) direct(dt);
      const c = ctx!;
      c.clearRect(0, 0, SIZE, SIZE);
      // embers add light on the dark ground; on the light ground they would wash out, so they paint over
      c.globalCompositeOperation = isLight() ? 'source-over' : 'lighter';
      embers = embers.filter((p) => step(p, dt, c));
      if (embers.length || open) requestAnimationFrame(tick);
      else running = false;
    };

    /** One open: the cells fill, the glyph catches, then an ember feeds it now and then. */
    const direct = (dt: number) => {
      t += dt;
      while (queue.length && t >= queue[0].at) ember(false, queue.shift()!.seat);
      if (!lit && (arrived >= need - 2 || t >= LIGHT_AT)) ignite();
      if (lit && (feedIn -= dt) <= 0) {
        ember(false, seatCells[Math.floor(Math.random() * need)], true);
        feedIn = rand(0.55, 0.9);
      }
    };

    const ignite = () => {
      lit = true;
      m.dataset.lit = '';
      glyph.animate([{ filter: lum(1.9) }, { filter: lum(1) }], { duration: 420, easing: 'ease-out' });
      const r = m.getBoundingClientRect();
      sound('data', (((r.left + r.width / 2) / innerWidth) * 2 - 1) * 0.5, 1);
      const t0 = performance.now();
      const roll = (now: number) => {
        if (!open) return;
        const k = Math.max(0, Math.min(1, (now - t0) / (COUNT * 1000)));
        num.textContent = Math.round(to * (1 - (1 - k) ** 3)).toLocaleString('en-US');
        if (k < 1) countRaf = requestAnimationFrame(roll);
      };
      countRaf = requestAnimationFrame(roll);
    };

    const show = () => {
      clearTimeout(closeT);
      if (open) return;
      clearTimeout(hideT);
      for (const c of closers) if (c !== close) c();
      open = true;
      lit = false;
      burst.hidden = false;
      // room for the final number, so the group keeps its place while it counts
      num.textContent = final;
      if (!num.style.minWidth) num.style.minWidth = `${Math.ceil(num.getBoundingClientRect().width)}px`;
      place();
      if (reduce) {
        lit = true;
        m.dataset.open = '';
        m.dataset.lit = '';
        return;
      }
      stage();
      measure();
      num.textContent = '0';
      t = 0; arrived = 0; feedIn = 0.6;
      // shuffled, so the glyph fills from everywhere at once, not row by row
      queue = [...seatCells].sort(() => Math.random() - 0.5).map((seat, i) => ({ at: 0.06 + i * 0.03, seat }));
      requestAnimationFrame(() => { if (open) m.dataset.open = ''; });
      for (let i = 0; i < 3; i++) ember(true);
    };

    const close = (now = false) => {
      clearTimeout(closeT);
      if (!open) return;
      open = false;
      lit = false;
      queue = [];
      cancelAnimationFrame(countRaf);
      delete m.dataset.open;
      delete m.dataset.lit;
      // embers on their way, or sitting in the glyph, let go and burn out instead of vanishing
      for (const p of embers) if (p.seat) Object.assign(p, { seat: null, held: false, pop: true, age: 0, life: 0.35, fade: 1 });
      num.textContent = final;
      const done = () => { burst.hidden = true; };
      if (now) { done(); embers = []; } else hideT = window.setTimeout(done, EXIT);
    };
    closers.push(close);

    const later = () => { clearTimeout(closeT); closeT = window.setTimeout(() => close(), CLOSE_DELAY); };
    m.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    m.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') later(); });
    m.addEventListener('focus', () => { if (m.matches(':focus-visible')) show(); });
    m.addEventListener('blur', () => close());
    // on a phone the first tap shows it; a second tap follows the link
    m.addEventListener('click', (e) => {
      if (!touch.matches || open) return;
      e.preventDefault();
      show();
    });
  }

  const closeAll = () => closers.forEach((c) => c());
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('a.appmark[data-mark]')) closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closers.forEach((c) => c(true)); });
  addEventListener('scroll', () => { if (touch.matches) closeAll(); }, { passive: true });
}
