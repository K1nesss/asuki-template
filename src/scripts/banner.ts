// The top banner: the pilot patrols the street, the sky takes a shield, and the mech's power cable
// can be pulled. Unplugged, the mech runs on its 5:00 internal battery while the pilot hurries to
// plug it back in. Pull it out three times running and she sulks, and the battery may run dry.
import persona from '@persona';
import { pose } from '../lib/persona';
import { paint, clamp, rand, loopWhileVisible } from './paint';
import { sound, strain } from './sound';
import { mountATField } from './atfield';
import { mountUmbilical } from './umbilical';

/** The pilot's poses; a missing one is drawn as p_idle, and p_idle missing as the sprite itself. */
const PILOT_FRAMES = { p_idle: '', p_walk1: 'p_idle', p_walk2: 'p_idle', p_up: 'p_idle', p_back: 'p_idle' } as const;
type F = keyof typeof PILOT_FRAMES;
const pilot = persona.pilot.sprite;
const PF = Object.fromEntries(Object.keys(PILOT_FRAMES).map((n) => [n, pose(persona.pilot.frames, pilot, n, PILOT_FRAMES as Record<string, string>)])) as Record<F, string[]>;
const WORDS = persona.words;
type Mode = 'idle' | 'walk' | 'look' | 'alarm' | 'toPlug' | 'tug' | 'sulk';
interface WalkInfo { min: number; max: number; home: number; y: number; plug: number; k: number; w: number }

const BATTERY = 300;

export function mountBanner(hero: HTMLElement, opts: { reduce: boolean }) {
  const narrowQ = matchMedia('(max-width: 559px)');
  const view = () => (narrowQ.matches ? 'narrow' : 'wide');

  // one pilot per framing; only the visible one moves, and they share state in "units of street"
  const pilots = new Map<string, { g: SVGGElement; art: SVGGElement; w: WalkInfo; art2: SVGSVGElement }>();
  hero.querySelectorAll<SVGGElement>('[data-pilot]').forEach((g) => {
    const svg = g.ownerSVGElement!;
    pilots.set(svg.dataset.view!, { g, art: g.querySelector('[data-pilot-art]')!, w: JSON.parse(g.dataset.walk!), art2: svg });
  });
  const P = () => pilots.get(view())!;

  const internal = hero.querySelectorAll<HTMLElement>('[data-internal]');
  const umbilical = hero.querySelectorAll<HTMLElement>('[data-umbilical]');
  const unitState = hero.querySelectorAll<HTMLElement>('[data-unit-state]');
  const unitGroups = hero.querySelectorAll<SVGGElement>('.unit');

  // ---- pilot state, as a fraction along her street so it survives a resize between framings
  let pos = 0.92, target = pos, dir: -1 | 1 = -1, mode: Mode = 'idle', t = 0, idleFor = rand(2, 4), stride = 0, shown: string | null = null;
  let plugged = true, battery = BATTERY, pulls: number[] = [], now = 0;

  const rope = mountUmbilical(hero, view, opts.reduce);
  const set = (m: Mode) => { mode = m; t = 0; };
  // the plug: where the cable actually came to rest, or where the drawn loose cable ends
  const span = () => { const w = P().w; return { lo: w.min, hi: w.max - w.w, plug: (rope.plugX() ?? w.plug) - w.w / 2 }; };
  const toX = (p: number) => { const s = span(); return s.lo + p * (s.hi - s.lo); };
  const toP = (x: number) => { const s = span(); return clamp((x - s.lo) / (s.hi - s.lo), 0, 1); };

  function show(f: F, mirror: boolean) {
    const p = P();
    const key = `${view()}:${f}`;
    if (key !== shown) { p.art.innerHTML = paint(PF[f], pilot.map); shown = key; }
    p.g.classList.toggle('mirror', mirror);
  }
  function place() {
    const p = P();
    p.g.setAttribute('transform', `translate(${toX(pos).toFixed(2)} ${p.w.y})`);
  }
  narrowQ.addEventListener('change', () => { shown = null; });

  // ---- HUD
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function hud() {
    internal.forEach((e) => (e.textContent = fmt(battery)));
    umbilical.forEach((e) => {
      e.textContent = plugged ? 'connected' : 'disconnected';
      e.className = plugged ? 'ok' : 'warn';
    });
    const state = plugged ? WORDS.engaged : battery > 0 ? WORDS.internal : WORDS.halted;
    unitState.forEach((e) => (e.textContent = state));
    hero.classList.toggle('unplugged', !plugged);
    hero.classList.toggle('halted', battery <= 0);
  }
  function unplug() {
    plugged = false;
    rope.unplug();
    sound('unplug');
    pulls = pulls.filter((p) => now - p < 30).concat(now);
    if (pulls.length >= 3) { set('sulk'); }
    else { target = toP(span().plug); set('alarm'); }
    hud();
  }
  function replug() {
    plugged = true;
    battery = BATTERY;
    sound('plug');
    hud();
  }

  // ---- input
  hero.querySelectorAll('[data-cable]').forEach((c) =>
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      // pull it out; once it's out only the pilot can put it back, so a click just knocks the loose cable about
      if (plugged) unplug();
      else rope.poke((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    }),
  );
  pilots.forEach(({ g }) =>
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      // cheer her up: she goes and fixes it after all
      if (mode === 'sulk') { pulls = []; target = toP(span().plug); set('toPlug'); }
      else if (plugged) { set('look'); }
    }),
  );
  // the mech's eyes: hover lights them (CSS); a click makes all four flare (CSS, restarted with the class)
  // and throw afterimages up and out to each side. Nothing when its power is out.
  let eyeTimer = 0;
  hero.querySelectorAll('.unit-hit').forEach((u) =>
    u.addEventListener('click', (e) => {
      e.stopPropagation();
      if (justOpened) { justOpened = false; return; } // that press was a hold: the Easter egg has it
      if (longPress) { longPress = false; return; } // held a while and let go: not a click
      if (hero.classList.contains('halted')) return;
      hero.classList.remove('eyes-on', 'eyes-flare');
      void hero.offsetWidth;
      hero.classList.add('eyes-on', 'eyes-flare');
      sound('wake');
      clearTimeout(eyeTimer);
      eyeTimer = window.setTimeout(() => hero.classList.remove('eyes-on', 'eyes-flare'), 1600);
      const fx = u.parentElement?.querySelector<SVGGElement>('.eye-fx');
      if (fx && !opts.reduce) throwGhosts(fx);
    }),
  );

  // Hold the mech for two seconds and the persona's Easter egg opens. While held it shakes,
  // harder and harder (in whole sprite pixels, rocking on its feet; near the end the banner rumbles with it);
  // let go early and it settles. A quick press is still the ordinary click, a long one that lets go is nothing.
  // The Easter egg's code and files load only from here: the code starts coming the moment a hold begins,
  // so it is usually there by the time the two seconds are up.
  const HOLD = 2;
  let holdT = -1, holdAt = 0, holdRaf = 0, holdLast = 0, holdS = 0, holdJit = 0, hum: ReturnType<typeof strain> = null, justOpened = false, eggOpen = false, longPress = false;
  // each view's mech: its sprite pixel (the eye-fx --k) and the point it rocks on (bottom centre of its box)
  const shakers = [...unitGroups].map((g) => {
    const hit = g.querySelector<SVGRectElement>('.unit-hit');
    const k = parseFloat(g.querySelector<SVGGElement>('.eye-fx')?.style.getPropertyValue('--k') || '1') || 1;
    if (hit) {
      const w = hit.width.baseVal.value / 0.7, x = hit.x.baseVal.value - w * 0.15, h = hit.height.baseVal.value / 0.8;
      g.style.setProperty('--sho', `${x + w / 2}px ${hit.y.baseVal.value + h}px`);
    }
    return { g, k };
  });
  const jit = () => Math.random() * 2 - 1;
  const shake = (s: number, dt: number) => {
    if (s <= 0 || opts.reduce) {
      shakers.forEach(({ g }) => ['--shx', '--shy', '--shr'].forEach((p) => g.style.removeProperty(p)));
      hero.style.removeProperty('translate');
      return;
    }
    // a new jolt about 30 times a second, so it reads as a shake and not as noise
    holdJit -= dt;
    if (holdJit > 0) return;
    holdJit = 1 / 30;
    const amp = (s * s * 9 + s * 0.6) * 0.5; // sprite pixels
    shakers.forEach(({ g, k }) => {
      g.style.setProperty('--shx', `${Math.round(jit() * amp) * k}px`);
      g.style.setProperty('--shy', `${Math.round(jit() * amp * 0.5) * k}px`);
      g.style.setProperty('--shr', `${(jit() * s * s * 2.5).toFixed(2)}deg`);
    });
    hum?.set(s); // it sounds as it shakes: the drone climbs with it
    const r = Math.max(0, s - 0.55) * 5;
    hero.style.translate = r >= 0.5 ? `${Math.round(jit() * r)}px ${Math.round(jit() * r * 0.6)}px` : '';
  };
  const egg = persona.egg;
  const eggCode = () => (egg ? egg() : Promise.reject(new Error('no Easter egg')));
  const holdTick = (now: number) => {
    const dt = Math.min(0.05, (now - holdLast) / 1000);
    holdLast = now;
    if (holdT >= 0) {
      holdT = Math.max(0, (now - holdAt) / 1000); // the clock, not frames (a frame stamp can be a hair older than the press)
      holdS = Math.min(1, holdT / HOLD);
      shake(holdS, dt);
      if (holdT >= HOLD) { holdT = -1; holdS = 0; shake(0, dt); hum?.stop(true); hum = null; hero.classList.remove('holding'); holdRaf = 0; openEgg(); return; }
    } else {
      // let go: it settles
      holdS = Math.max(0, holdS - dt * 3);
      shake(holdS, dt);
      if (holdS <= 0) { hero.classList.remove('holding'); holdRaf = 0; return; }
    }
    holdRaf = requestAnimationFrame(holdTick);
  };
  const holdStart = () => {
    longPress = false;
    if (!egg || eggOpen || hero.classList.contains('halted')) return;
    holdT = 0;
    holdAt = performance.now();
    hero.classList.add('holding');
    void eggCode().catch(() => {});
    hum?.stop(); hum = opts.reduce ? null : strain();
    if (!holdRaf) { holdLast = performance.now(); holdJit = 0; holdRaf = requestAnimationFrame(holdTick); }
  };
  const holdEnd = () => {
    if (holdT < 0) return;
    if (holdT > 0.35) longPress = true; // that was a hold, not a click: no flare when it lets go
    holdT = -1;
    hum?.stop(); hum = null;
  };
  function openEgg() {
    justOpened = true;
    eggOpen = true;
    // the card comes out of the avatar; if that is off screen, out of the mech (whichever view is showing)
    const from = [...hero.querySelectorAll<SVGElement>('.unit-hit')].find((u) => u.getBoundingClientRect().width > 0) ?? null;
    eggCode()
      .then((m) => m.open({ from, onClose: () => { eggOpen = false; } }))
      .catch(() => { eggOpen = false; });
    // a touch that ends with no click (it was dragged off) must not swallow the next real click
    window.setTimeout(() => { justOpened = false; }, 800);
  }
  hero.querySelectorAll<SVGElement>('.unit-hit').forEach((u) => {
    u.addEventListener('pointerdown', (e) => { if ((e as PointerEvent).button === 0) holdStart(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => u.addEventListener(t, holdEnd));
    u.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press on a phone is ours, not a menu
  });

  // The afterimages are thrown, not slid along a track. Each is a copy of the eye, launched up and out at
  // its own speed and angle, slowed by air drag, lifted a little like hot air and nudged by turbulence,
  // fading as it goes. The eye throws one every few frames while it flares, each a little slower than the
  // one before, so they string out as separate ghosts that the first ones lead. Positions snap to whole
  // sprite pixels, so it stays pixel art while the timing is physical.
  type Ghost = { el: SVGPathElement; side: number; x: number; y: number; vx: number; vy: number; age: number; life: number; a0: number; seed: number };
  const ghosts: Ghost[] = [];
  let ghostRaf = 0, ghostLast = 0;
  const GHOSTS = 5;
  const throwGhosts = (fx: SVGGElement) => {
    const k = parseFloat(fx.style.getPropertyValue('--k')) || 1;
    const lean = rand(-0.06, 0.06); // the whole volley tilts a little differently each time
    for (const tpl of fx.querySelectorAll<SVGPathElement>('[data-ghost]')) {
      const side = Number(tpl.dataset.ghost);
      const base = 0.86 + lean * side; // about 50 degrees above the horizontal
      for (let i = 0; i < GHOSTS; i++) {
        window.setTimeout(() => {
          const el = tpl.cloneNode() as SVGPathElement;
          el.removeAttribute('data-ghost');
          el.style.opacity = '0';
          fx.appendChild(el);
          const a = base + rand(-0.07, 0.07);
          const v = (33 - i * 2.6) * rand(0.94, 1.06); // sprite pixels per second
          ghosts.push({ el, side, x: 0, y: 0, vx: side * Math.cos(a) * v, vy: -Math.sin(a) * v, age: 0, life: rand(0.72, 0.88) - i * 0.03, a0: 0.95 - i * 0.13, seed: rand(0, 9) });
          el.dataset.k = String(k);
          if (!ghostRaf) { ghostLast = performance.now(); ghostRaf = requestAnimationFrame(ghostTick); }
        }, 30 + i * 62);
      }
    }
  };
  const ghostTick = (now: number) => {
    const dt = Math.min(0.033, (now - ghostLast) / 1000);
    ghostLast = now;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.age += dt;
      const drag = Math.exp(-3.1 * dt);
      g.vx = g.vx * drag + g.side * Math.sin(g.age * 9 + g.seed) * 7 * dt;
      g.vy = g.vy * drag - 5 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      const t = g.age / g.life;
      if (t >= 1) { g.el.remove(); ghosts.splice(i, 1); continue; }
      const k = Number(g.el.dataset.k);
      const px = Math.round(g.x), py = Math.round(g.y);
      // still on the eye: not shown yet, so each ghost appears already apart from it
      // it holds its light while it flies, then fades as it slows
      const fade = t < 0.4 ? 1 : (1 - (t - 0.4) / 0.6) ** 1.3;
      g.el.style.opacity = px === 0 && py === 0 ? '0' : (g.a0 * fade).toFixed(3);
      g.el.setAttribute('transform', `translate(${px * k} ${py * k})`);
    }
    ghostRaf = ghosts.length ? requestAnimationFrame(ghostTick) : 0;
  };
  // the sky: a shield where you click (atfield.ts), and the pilot looks up at it
  const atf = mountATField(hero, opts.reduce);
  hero.addEventListener('click', (e) => {
    const svg = hero.querySelector<SVGSVGElement>(`svg.art.${view()}`);
    const m = svg?.getScreenCTM();
    if (!svg || !m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    atf.burst(e.clientX, e.clientY);
    sound('field', (pt.x / Number(svg.viewBox.baseVal.width)) * 2 - 1);
    if (mode === 'idle' || mode === 'walk' || mode === 'look') {
      dir = pt.x > toX(pos) ? 1 : -1;
      set('look');
    }
  });

  // ---- the mech shifts its weight now and then
  if (!opts.reduce) {
    const shift = () => {
      unitGroups.forEach((g) => g.classList.add('shift'));
      setTimeout(() => unitGroups.forEach((g) => g.classList.remove('shift')), 700);
      setTimeout(shift, rand(7000, 13000));
    };
    setTimeout(shift, rand(4000, 8000));
  }

  // ---- the battery ticks in real time, on screen or not
  setInterval(() => {
    if (plugged || battery <= 0) return;
    battery = Math.max(0, battery - 1);
    hud();
  }, 1000);

  function walk(dt: number, speed: number): boolean {
    const x = toX(pos), tx = toX(target), d = tx - x;
    if (Math.abs(d) < 0.3) { pos = target; return true; }
    dir = d < 0 ? -1 : 1;
    const stepU = Math.min(Math.abs(d), speed * dt);
    pos = toP(x + dir * stepU);
    stride += stepU;
    show(opts.reduce ? 'p_idle' : Math.floor(stride / (P().w.k * 5)) % 2 ? 'p_walk1' : 'p_walk2', dir > 0);
    return false;
  }

  function step(dt: number, n: number) {
    now = n;
    t += dt;
    rope.step(dt);
    const k = P().w.k;
    switch (mode) {
      case 'idle':
        show('p_idle', false);
        if (!plugged && !rope.reeling()) { target = toP(span().plug); set('toPlug'); break; } // back to work
        if (t > idleFor) {
          idleFor = rand(2.5, 6);
          target = clamp(pos + rand(-0.5, 0.5), 0, 1);
          set('walk');
        }
        break;
      case 'walk':
        if (walk(dt, 14 * k)) set('idle');
        break;
      case 'look':
        show('p_up', dir > 0);
        if (t > 1.6) set('idle');
        break;
      case 'alarm': // a startled glance at the loose cable before she runs for it
        show('p_up', target > pos);
        if (t > 0.7) set('toPlug');
        break;
      case 'toPlug':
        target = toP(span().plug); // the plug may still be settling
        if (walk(dt, 40 * k)) set('tug');
        break;
      case 'tug': // heave the plug back in
        show(Math.floor(t * 5) % 2 ? 'p_walk1' : 'p_up', true);
        // she heaves while the plug is drawn back up to the socket; it seats with a clunk
        if (!plugged && !rope.reeling()) rope.reel(2, () => { replug(); set('idle'); });
        break;
      case 'sulk':
        show('p_back', false);
        break;
    }
    place();
  }

  hud();
  show('p_idle', false);
  loopWhileVisible(hero, step);
}
