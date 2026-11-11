// What a project shows until it has a screenshot: one of four small pixel machines, a different one on
// each project, drawn in square cells in the project's status colour with an ordered dither. The home
// cards show them wide (128x50 cells of 3px); the cases on the Projects page show them square.
// The machines themselves are in machines.ts: ripple, angel, life and pulse.
// Hovering a card drives its machine harder (eased by a spring). They run only while on screen; with
// reduced motion each card keeps one still frame of its own machine.
// A moving screen's machine runs on a background thread (offthread.ts); the page only dithers and colours
// what comes back, one frame behind, so the screens cost the page almost nothing.
import { loopWhileVisible, wipeRadius, isLive, type Wipe } from './paint';
import { Spring } from './spring';
import { machine, KINDS, type Machine } from './machines';
import { offthread, whenDown, glowMake, glowJob } from './offthread';

export { machine, KINDS, type Machine };

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lit = (x: number, y: number, v: number) => (B4[(y & 3) * 4 + (x & 3)] + 1) / 17 < v;

const rgbOf = (el: Element) => {
  const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [200, 40, 40];
  return (255 << 24) | (m[2] << 16) | (m[1] << 8) | m[0]; // little-endian RGBA
};

/** A canvas showing one machine in the canvas's own CSS colour. */
export interface Screen {
  cv: HTMLCanvasElement; t: number; draw(dt: number, h: number): void; recolour(): void;
  /** a theme switch starts: keep the old colour outside its circle until the circle has passed */
  wipe(w: Wipe): void;
}
type F32 = Float32Array<ArrayBuffer>;
let ids = 0;
/** `moving`: it will run (not one still frame), so its machine can move to the background thread */
export function screen(cv: HTMLCanvasElement, kind: number, W: number, H: number, seed: number, t0 = 0, moving = false): Screen {
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer);
  let f: Float32Array<ArrayBuffer> = new Float32Array(W * H);
  // The machine runs here until the background thread is up, keeping a list of its steps; then the thread
  // replays them, so its machine is exactly where this one was, and takes over. From then on each frame
  // sends this frame's step and shows the field that came back for the one before.
  let m: Machine | null = machine(kind, W, H, seed);
  let past: [number, number, number][] | null = moving ? [] : null;
  const id = ++ids;
  // `spare` is the buffer the thread fills next, `got` a field back from it, `out` a step out with it,
  // `owed` the time it hasn't been told about yet (if it ever falls a frame behind, it catches up)
  let spare: F32 | null = null, got: F32 | null = null, out = false, owed = 0;
  const back = (buf: F32) => { out = false; got = buf; };
  whenDown(() => {
    if (m) return;
    m = machine(kind, W, H, seed); // the thread died: this page runs the machine again (from the start)
    out = false; got = null;
  });
  let rgb = rgbOf(cv);
  // mid-switch: the old colour and each cell's squared distance from the circle's centre, per column and row
  let old: number | null = null;
  const dx2 = new Float32Array(W), dy2 = new Float32Array(H);
  const S: Screen = {
    cv,
    t: t0,
    draw(dt, h) {
      S.t += dt * (1 + 0.9 * h);
      if (m) {
        m(f, dt, S.t, h);
        if (past) {
          past.push([dt, S.t, h]);
          if (offthread()) {
            glowMake(id, kind, W, H, seed, past, back);
            m = past = null;
            spare = new Float32Array(W * H);
          } else if (past.length > 600) past = null; // it never came up: this screen stays on the page
        }
      } else {
        if (got) { spare = f; f = got; got = null; }
        owed += dt;
        if (!out && spare) { out = true; glowJob(id, owed, S.t, h, spare); spare = null; owed = 0; }
      }
      const r = old === null ? -1 : wipeRadius();
      if (r === -1 || r === Infinity) old = null;
      if (old === null) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; px[i] = lit(x, y, f[i]) ? rgb : 0; }
      } else {
        const r2 = r * r;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) { const i = y * W + x; px[i] = lit(x, y, f[i]) ? (dx2[x] + dy2[y] < r2 ? rgb : old) : 0; }
        }
      }
      g.putImageData(img, 0, 0);
    },
    recolour() { rgb = rgbOf(cv); },
    wipe(w) {
      const b = cv.getBoundingClientRect();
      if (!b.width) return;
      old = rgb;
      for (let x = 0; x < W; x++) dx2[x] = (b.left + ((x + 0.5) * b.width) / W - w.x) ** 2;
      for (let y = 0; y < H; y++) dy2[y] = (b.top + ((y + 0.5) * b.height) / H - w.y) ** 2;
    },
  };
  return S;
}

const GW = 128, GH = 50;

export function mountGlows(section: HTMLElement, reduce: boolean) {
  const cards: { s: Screen; heat: Spring }[] = [];
  section.querySelectorAll<HTMLElement>('.card').forEach((el, i) => {
    const shot = el.querySelector('.shot');
    if (!shot?.querySelector('.glow')) return;
    const cv = document.createElement('canvas');
    cv.className = 'glow-fx';
    cv.setAttribute('aria-hidden', 'true');
    shot.appendChild(cv);
    const kind = i % 4;
    const heat = new Spring(0, { stiffness: 60, damping: 11 });
    el.addEventListener('pointerenter', () => { heat.target = 1; });
    el.addEventListener('pointerleave', () => { heat.target = 0; });
    cards.push({ s: screen(cv, kind, GW, GH, i + 1, i * 0.9, !reduce), heat });
    el.classList.add('glow-live', `fx-${KINDS[kind]}`);
  });
  if (!cards.length) return;

  if (reduce) {
    // one still frame each: run the machines a little way in, then stop
    for (const c of cards) { for (let k = 0; k < 40; k++) c.s.draw(1 / 30, 0); }
    addEventListener('site:theme', () => setTimeout(() => cards.forEach((c) => { c.s.recolour(); c.s.draw(0, 0); }), 50));
    return;
  }
  // the theme switch: screens shown live through it draw its circle themselves (main.ts lifts them);
  // the new colour is read as soon as the theme has changed, and again now and then in case it moves
  addEventListener('site:theme-wipe', (e) => {
    for (const c of cards) if (isLive(c.s.cv)) c.s.wipe((e as CustomEvent<Wipe>).detail);
  });
  addEventListener('site:theme', () => cards.forEach((c) => c.s.recolour()));
  let sinceColour = 0;
  loopWhileVisible(section, (dt) => {
    if ((sinceColour += dt) > 0.5) { sinceColour = 0; for (const c of cards) c.s.recolour(); }
    for (const c of cards) {
      c.heat.step(dt);
      c.s.draw(dt, Math.max(0, c.heat.value));
    }
  });
}
