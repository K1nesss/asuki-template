// Turns a pixel frame (rows of palette letters) into SVG paths, one per colour, cached per frame.
const cache = new WeakMap<string[], string>();

export function paint(rows: string[], map: Record<string, string>): string {
  const hit = cache.get(rows);
  if (hit) return hit;
  const by = new Map<string, string[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const c = map[ch];
      if (c) {
        let list = by.get(c);
        if (!list) by.set(c, (list = []));
        list.push(`M${x} ${y}h${end - x}v1h${x - end}z`);
      }
      x = end;
    }
  });
  const html = [...by].map(([c, d]) => `<path fill="${c}" d="${d.join('')}"/>`).join('');
  cache.set(rows, html);
  return html;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** True while one of the full pages (Projects, Contributions…) or the Easter egg covers the homepage. */
export const paged = () => document.documentElement.dataset.paged !== undefined || document.documentElement.dataset.egg !== undefined;

/** Runs `step(dt)` every frame, but only while `el` is on screen, the tab is visible and no page covers it.
 * `busy` keeps it running off screen while something is mid-motion (a thrown spear keeps flying while you
 * scroll away, rather than hanging in the air until you come back). */
export function loopWhileVisible(el: Element, step: (dt: number, now: number) => void, busy: () => boolean = () => false) {
  let raf = 0, last = 0, seen = false;
  const want = () => (seen || busy()) && !document.hidden && !paged();
  const frame = (t: number) => {
    // cap the step so a stalled tab doesn't teleport anyone
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    step(dt, t / 1000);
    raf = want() ? requestAnimationFrame(frame) : 0;
  };
  const sync = () => {
    const run = want();
    if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }, { rootMargin: '80px' }).observe(el);
  document.addEventListener('visibilitychange', sync);
  addEventListener('site:paged', sync);
}


// ---------- the theme switch: a circle of the new theme grows from the switch over THEME_MS (main.ts runs
// it as a View Transition). The page under it is a still picture until the circle arrives, so whatever moves
// is lifted out of that picture and stays live; the canvases among them draw the same circle themselves.
export const THEME_MS = 600; // keep in step with the theme-circle animation in site.css
const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
/** cubic-bezier(.65,0,.35,1): the share of its full size the circle has at a share of the time (0-1) */
export function wipeAt(time: number) {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bez(0.65, 0.35, m) < time) lo = m; else hi = m; }
  return bez(0, 1, (lo + hi) / 2);
}
/** the inverse: the share of the time at which the circle reaches a share of its full size */
export function wipeTimeAt(p: number) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (bez(0, 1, m) < p) lo = m; else hi = m; }
  return bez(0.65, 0.35, (lo + hi) / 2);
}
/** Where the circle grows from (viewport px), how big it ends, and the browser's own animation of it
 * once the switch is under way (its clock is the compositor's, so the canvases' circles stay on its edge). */
export interface Wipe { x: number; y: number; end: number; anim: Animation | null; t0: number }
let wipe: Wipe | null = null;
/** Called just before the theme flips: listeners of site:theme-wipe keep their old colours from here. */
export function startWipe(w: Wipe) { wipe = w; dispatchEvent(new CustomEvent<Wipe>('site:theme-wipe', { detail: w })); }
export function endWipe() { wipe = null; }
/** The circle's radius now (viewport px): -1 with no switch running, Infinity once it covers everything. */
export function wipeRadius() {
  if (!wipe) return -1;
  const a = wipe.anim;
  if (!a && !wipe.t0) return 0;
  if (a?.playState === 'finished') return Infinity;
  const k = a ? Number(a.currentTime ?? 0) / THEME_MS : (performance.now() - wipe.t0) / THEME_MS;
  return k >= 1 ? Infinity : wipeAt(k) * wipe.end;
}
/** True if this element was lifted out of the switch's still picture (main.ts names it). */
export const isLive = (el: HTMLElement) => !!el.style.getPropertyValue('view-transition-name');
