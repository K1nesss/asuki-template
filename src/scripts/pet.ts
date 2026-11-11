// The footer pet: a small state machine stepped every frame.
// She wanders the caution tape, turns to the cursor, likes being stroked (left-right over her),
// and has limits: overdo it and she shouts, stomps off and sulks with her back to you.
// Hand her the prop (prop.ts) and she winds up and throws it down the tape.
import persona from '@persona';
import { pose, spriteSize } from '../lib/persona';
import { paint, clamp, rand, loopWhileVisible } from './paint';
import { sound } from './sound';

/** Every pose the pet uses. A persona may draw fewer: a missing pose is drawn as the next one in this chain,
 *  and in the end as the sprite itself (idle). */
export const PET_FRAMES = {
  idle: '', blink: 'idle', happy: 'idle', angry: 'idle', surprised: 'idle', lookUp: 'idle', back: 'idle',
  side: 'idle', sideA: 'side', sideB: 'side', sideC: 'sideA', stompA: 'sideA', stompC: 'sideC',
  throwA: 'side', throwB: 'throwA', throwC: 'throwA',
} as const;
type FrameName = keyof typeof PET_FRAMES;
const P = persona.pet;
const SIZE = spriteSize(P.sprite);
const L = P.lines;
const FR = Object.fromEntries(Object.keys(PET_FRAMES).map((n) => [n, pose(P.frames, P.sprite, n, PET_FRAMES as Record<string, string>)])) as Record<FrameName, string[]>;
type Mode = 'idle' | 'turn' | 'walk' | 'arrive' | 'pet' | 'angry' | 'stomp' | 'sulk' | 'doze' | 'startle' | 'hold' | 'windup' | 'throw' | 'cheer' | 'pull';

/** What the prop needs from her. Positions are in yard pixels, y from the top of the yard. */
export interface PetApi {
  /** her box: left edge, width, height */
  box(): { x: number; w: number; h: number };
  /** one sprite cell in pixels (the prop is drawn in the same cells) */
  cell(): number;
  /** can she take it now? */
  mood(): 'ok' | 'cross' | 'asleep' | 'busy';
  /** the prop is being carried past her: she looks at it */
  watch(): void;
  /** she takes the prop; `release(dir)` is called when she lets go */
  take(release: (dir: -1 | 1) => void): void;
  /** her throwing hand this frame, and the angle she holds the prop at */
  grip(): { x: number; y: number; a: number };
  /** she won't take it (cross) or it woke her up (asleep) */
  refuse(): void;
  /** it stuck where she aimed */
  cheer(): void;
  /** is she just standing about? */
  idle(): boolean;
  /** walk over to x (the prop's tip in the tape), pull it out, then call `got` */
  fetch(x: number, got: () => void): void;
}

const BUSY: Mode[] = ['angry', 'stomp', 'sulk', 'startle', 'hold', 'windup', 'throw', 'pull'];

const WALK: FrameName[] = ['sideA', 'sideB', 'sideC', 'sideB'];
const STOMP: FrameName[] = ['stompA', 'sideB', 'stompC', 'sideB'];
const SIDE = new Set<FrameName>(['side', 'sideA', 'sideB', 'sideC', 'stompA', 'stompC', 'throwA', 'throwB', 'throwC']);
// where her throwing hand is in each throwing frame (cells, facing left as drawn); without one, near the top
const HAND: Partial<Record<FrameName, [number, number]>> = { throwA: [Math.round(SIZE.w * 0.7), Math.round(SIZE.h * 0.45)], ...P.hands };

const PET_LIMIT = 25; // strokes in one go before she has had enough
const DOZE_AFTER = 60;

export function mountPet(yard: HTMLElement, opts: { reduce: boolean; onPet: () => void }): PetApi {
  const el = yard.querySelector<HTMLElement>('#pet')!;
  const art = el.querySelector<SVGGElement>('.flip')!;
  const bubble = yard.querySelector<HTMLElement>('#bubble')!;
  let lines: string[] = [];
  try { lines = JSON.parse(yard.dataset.lines || '[]'); } catch {}
  if (!lines.length) lines = [L.fallback];

  // ---- state
  let W = yard.clientWidth, sw = el.clientWidth, cell = sw / SIZE.w;
  let x = W / 2 - sw / 2, target = x, dir: -1 | 1 = -1;
  let mode: Mode = 'idle', t = 0, idleFor = rand(2, 5), lastPoke = 0, now = 0;
  let stride = 0, frame: FrameName = 'idle', shown: FrameName | null = null, mirror = false;
  let strokes = 0, session = 0, lastStroke = 0, lineAt = 0, clicks: number[] = [];
  let bubbleUntil = 0, sulkSaid = false, speed = 0;
  let throwDir: -1 | 1 = 1, release: ((dir: -1 | 1) => void) | null = null, watchedAt = 0;
  let fetching: (() => void) | null = null, fetchX = 0;
  const ptr = { in: false, x: 0, y: 0, overDir: 0, overX: 0, down: false, lastMove: 0 };

  const set = (m: Mode) => {
    mode = m;
    t = 0;
    if (m !== 'turn' && m !== 'walk' && m !== 'pull') fetching = null; // anything else and she forgets the prop
  };
  const poke = () => { lastPoke = now; if (mode === 'doze') { say(L.startle); set('startle'); sound('alert'); } };

  function say(text: string, hold = 2.2) {
    bubble.textContent = text;
    bubble.classList.add('show');
    bubbleUntil = now + hold;
  }
  function heart() {
    const h = document.createElement('span');
    h.className = 'pop';
    h.innerHTML = '<svg viewBox="0 0 9 9" width="11" height="11" fill="currentColor" shape-rendering="crispEdges"><path d="M1 1h2v1h-2zM6 1h2v1h-2zM0 2h9v3h-9zM1 5h7v1h-7zM2 6h5v1h-5zM3 7h3v1h-3zM4 8h1v1h-1z"/></svg>';
    h.style.left = `${x + sw / 2 + rand(-10, 10)}px`;
    h.style.bottom = `${sw * 1.3}px`;
    yard.appendChild(h);
    setTimeout(() => h.remove(), 1000);
  }
  function show(f: FrameName, m = false) {
    if (f !== shown) { art.innerHTML = paint(FR[f], P.sprite.map); shown = f; }
    const mm = m && SIDE.has(f);
    if (mm !== mirror) { el.classList.toggle('mirror', mm); mirror = mm; }
  }

  // ---- input
  const local = (e: PointerEvent | MouseEvent) => {
    const r = yard.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onHer = (p: { x: number }) => p.x > x + sw * 0.15 && p.x < x + sw * 0.85;

  // the cursor anywhere near the footer counts as "here"
  const area = yard.parentElement ?? yard;
  area.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (e.pointerType === 'mouse') ptr.in = true;
    // petting: count left-right turns of the pointer while it is over her
    const over = e.target instanceof Node && el.contains(e.target);
    if (over && (e.pointerType === 'mouse' || ptr.down)) {
      const d = Math.sign(p.x - ptr.x);
      if (d && ptr.overDir && d !== ptr.overDir && Math.abs(p.x - ptr.overX) > 6) {
        strokes++;
        ptr.overX = p.x;
      }
      if (d) ptr.overDir = d;
    } else ptr.overDir = 0;
    Object.assign(ptr, { x: p.x, y: p.y, lastMove: now });
    poke();
  });
  area.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ptr.in = false; });
  el.addEventListener('pointerdown', (e) => { ptr.down = true; ptr.overX = local(e).x; poke(); });
  window.addEventListener('pointerup', () => (ptr.down = false));
  yard.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || el.contains(e.target as Node)) return;
    // touch: a tap on the tape calls her over
    poke();
    target = clamp(local(e).x - sw / 2, 0, W - sw);
    if (mode === 'idle' || mode === 'pet' || mode === 'walk' || mode === 'arrive') set('turn');
  });
  el.addEventListener('click', (e) => {
    poke();
    if (BUSY.includes(mode)) return;
    clicks = clicks.filter((c) => now - c < 1.2).concat(now);
    if (clicks.length >= 3) { clicks = []; return blowUp(); }
    if ((e as PointerEvent).pointerType !== 'mouse') strokes += 2;
    else { heart(); opts.onPet(); sound('pet'); set('pet'); lastStroke = now; }
  });
  el.addEventListener('keydown', (e) => {
    poke();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      target = clamp(x + (e.key === 'ArrowLeft' ? -80 : 80), 0, W - sw);
      if (mode !== 'angry' && mode !== 'stomp' && mode !== 'sulk') set('turn');
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      strokes += 2;
    }
  });
  new ResizeObserver(() => {
    W = yard.clientWidth; sw = el.clientWidth; cell = sw / SIZE.w;
    x = clamp(x, 0, W - sw); target = clamp(target, 0, W - sw);
  }).observe(yard);

  function blowUp() {
    session = 0;
    strokes = 0;
    say(L.angry, 1.6);
    sound('angry');
    el.classList.add('shake');
    set('angry');
  }

  // ---- movement: paced by distance, so her feet never slide
  function walkTo(dt: number, top: number, frames: FrameName[]): boolean {
    const d = target - x;
    if (Math.abs(d) < 1) { x = target; return true; }
    dir = d < 0 ? -1 : 1;
    const want = opts.reduce ? 1e5 : Math.min(top, Math.abs(d) * 3 + 20);
    speed += (want - speed) * Math.min(1, dt * 6);
    const step = Math.min(Math.abs(d), speed * dt);
    x += dir * step;
    stride += step;
    const per = 6 * cell; // one frame every 6 cells walked
    show(opts.reduce ? 'side' : frames[Math.floor(stride / per) % frames.length], dir > 0);
    return false;
  }

  // ---- the state machine
  function step(dt: number, n: number) {
    now = n;
    if (!lastPoke) lastPoke = now;
    t += dt;
    if (bubbleUntil && now > bubbleUntil) { bubble.classList.remove('show'); bubbleUntil = 0; }

    // strokes become petting, unless she is busy being cross
    if (strokes > 0 && !BUSY.includes(mode)) {
      if (mode === 'doze') { set('startle'); say(L.startle); }
      else {
        if (mode !== 'pet') set('pet');
        for (; strokes > 0; strokes--) {
          session++;
          opts.onPet();
          if (session % 3 === 0) heart();
          if (session % 3 === 1) sound('pet');
        }
        if (now - lineAt > 2.5) { say(lines[Math.floor(Math.random() * lines.length)]); lineAt = now; }
        lastStroke = now;
        if (session > PET_LIMIT) blowUp();
      }
    }
    strokes = 0;
    if (session && now - lastStroke > 4) session = 0;

    switch (mode) {
      case 'idle': {
        // look at the cursor: up when it is overhead
        const cx = ptr.x - (x + sw / 2);
        const near = ptr.in && now - ptr.lastMove < 3;
        if (now - watchedAt < 0.3) show('lookUp');
        else if (near && Math.abs(cx) < sw && ptr.y < yard.clientHeight - sw * 1.45) show('lookUp');
        else show(now % 3.4 > 3.25 ? 'blink' : 'idle');
        if (now - lastPoke > DOZE_AFTER) { set('doze'); say(L.doze, 4); break; }
        if (t > idleFor) {
          idleFor = rand(3, 7);
          // wander: toward the cursor if it is about, otherwise somewhere along the tape
          if (near && Math.abs(cx) > sw) target = clamp(ptr.x - sw / 2 - Math.sign(cx) * sw * 0.8, 0, W - sw);
          else target = clamp(x + rand(-1, 1) * W * 0.35, 0, W - sw);
          if (Math.abs(target - x) > 12) set('turn');
          else t = 0;
        }
        break;
      }
      case 'turn': // a glance in profile before setting off
        show('side', target > x);
        if (t > 0.18) { speed = 0; set('walk'); }
        break;
      case 'walk':
        if (walkTo(dt, 46 * cell, WALK)) set(fetching ? 'pull' : 'arrive');
        break;
      case 'pull': // at the prop: look down at it, then heave it out of the tape
        show(t < 0.3 ? 'side' : 'throwA', fetchX > x + sw / 2);
        if (t > 0.5) {
          const got = fetching;
          fetching = null;
          got?.();
        }
        break;
      case 'arrive': // and a glance in profile before facing you again
        show('side', dir > 0);
        if (t > 0.2) set('idle');
        break;
      case 'pet':
        show('happy');
        if (now - lastStroke > 0.9) set('idle');
        break;
      case 'angry':
        show('angry');
        if (t > 1) {
          el.classList.remove('shake');
          target = x + sw / 2 < W / 2 ? W - sw : 0; // the far end
          speed = 0;
          set('stomp');
        }
        break;
      case 'stomp':
        if (walkTo(dt, 110 * cell, STOMP)) { sulkSaid = false; set('sulk'); }
        break;
      case 'sulk':
        show('back');
        if (!sulkSaid && t > 0.5) { say(L.sulk); sulkSaid = true; }
        if (t > 6) { say(L.unsulk); set('arrive'); }
        break;
      case 'doze':
        show('blink');
        if (now - bubbleUntil > -0.1) say(L.doze, 4);
        break;
      case 'startle':
        show('surprised');
        if (t > 0.7) set('idle');
        break;
      // the prop: hold it up and look down the tape, lean back, let go, and cheer if it sticks
      case 'hold':
        show('throwA', throwDir > 0);
        if (t > 0.7) set('windup');
        break;
      case 'windup':
        show('throwB', throwDir > 0);
        if (t > 0.38) {
          const r = release;
          release = null;
          sound('whoosh', throwDir * 0.6);
          set('throw');
          r?.(throwDir);
        }
        break;
      case 'throw':
        show(t < 0.5 ? 'throwC' : 'side', throwDir > 0);
        if (t > 2.5) set('idle');
        break;
      case 'cheer':
        show('happy');
        if (t > 1.4) set('idle');
        break;
    }
    el.style.transform = `translateX(${Math.round(x)}px)`;
    const bw = bubble.offsetWidth;
    const right = x + sw + 6;
    bubble.style.left = `${right + bw < W ? right : Math.max(0, x - bw - 6)}px`;
  }

  show('idle');
  const api: PetApi = {
    box: () => ({ x, w: sw, h: (sw * SIZE.h) / SIZE.w }),
    cell: () => cell,
    mood: () => (['angry', 'stomp', 'sulk'].includes(mode) ? 'cross' : mode === 'doze' ? 'asleep' : ['hold', 'windup', 'throw'].includes(mode) ? 'busy' : 'ok'),
    watch: () => { watchedAt = now; poke(); },
    take(r) {
      poke();
      release = r;
      // throw toward the longer stretch of tape
      throwDir = x + sw / 2 < W / 2 ? 1 : -1;
      speed = 0;
      set('hold');
      say(L.take[Math.floor(Math.random() * L.take.length)] ?? '', 1.4);
    },
    grip() {
      const [hx, hy] = HAND[shown ?? 'throwA'] ?? HAND.throwA!;
      const top = yard.clientHeight - 6 - (sw * SIZE.h) / SIZE.w;
      const up = mode === 'windup' ? 0.5 : mode === 'throw' ? 0.05 : 0.22; // tilted up, more so when cocked back
      return {
        x: x + (throwDir > 0 ? SIZE.w - hx : hx) * cell,
        y: top + hy * cell,
        a: throwDir > 0 ? -up : Math.PI + up,
      };
    },
    refuse() {
      if (mode === 'doze') { set('startle'); say(L.startle); sound('alert'); }
      else say(L.refuse);
      poke();
    },
    idle: () => mode === 'idle',
    fetch(fx, got) {
      fetching = got;
      fetchX = fx;
      target = clamp(fx - sw / 2, 0, W - sw);
      speed = 0;
      set(Math.abs(target - x) > 4 ? 'turn' : 'pull');
      fetching = got; // set() clears it for other modes; keep it for this trip
    },
    cheer() {
      if (mode !== 'throw') return;
      set('cheer');
      say(L.cheer, 1.6);
      heart();
    },
  };
  if (opts.reduce) {
    // no wandering for visitors who asked for less motion: she still reacts, she just doesn't walk about
    loopWhileVisible(yard, (dt, n) => { step(dt, n); if (mode === 'idle') t = 0; });
  } else loopWhileVisible(yard, step);
  return api;
}
