// The side gutters: a real open sea seen from above, as if a video of big swells had been pixelated.
// A camera hangs over a 3D ocean surface (a sum of Gerstner waves, so crests come out sharp and troughs
// broad) and each 4px cell of the two gutters is one ray onto it: the water is shaded by the sky it
// reflects, a low light glinting off it, light coming through the thin tops of the swells, and foam where
// the surface folds over on a crest. The result is cut to five tones with an ordered (Bayer) dither.
// The camera is fixed: the sea stays put behind the page while it scrolls, and only the water moves.
// About 12 frames a second; a still frame for visitors who prefer less motion.
// The shading itself is in sea.ts. After the first frame a background thread does it (offthread.ts),
// and this page only inks the result, so the sea costs the page almost nothing.

import { paged, wipeRadius, isLive, type Wipe } from './paint';
import { B8, CS, CONTENT, RAIL, shadeGutters } from './sea';
import { offthread, seaJob, whenDown } from './offthread';

export function mountWaves(canvas: HTMLCanvasElement, page: HTMLElement, { reduce }: { reduce: boolean }) {
  const g = canvas.getContext('2d');
  if (!g) return;
  let W = 0, H = 0, GW = 0, t = 0, last = 0, raf = 0;
  let ramp: RGB[] = [], light = false, img: ImageData | null = null;
  // each cell's last shade, so a theme switch can re-ink the sea every frame without shading it again
  let sh: F32 = new Float32Array(0);
  const calmOf = new Float32Array(1024);
  // during a theme switch: the old inks, kept outside the circle (main.ts lifts the moving sea out of the
  // switch's still picture, so the sea draws the circle itself and never stops)
  let old: { ramp: RGB[]; light: boolean } | null = null;
  // the background thread: `spare` is the buffer it shades the next frame into (it hands it back), `gen`
  // the canvas size it was asked for, `asked` whether a frame is out with it, `got` a frame back from it
  let spare: F32 | null = null, gen = 0, asked = false, got: F32 | null = null;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const [bg, w1, w2, w3] = ['--bg', '--wave-1', '--wave-2', '--wave-3'].map((v) => rgb(cs.getPropertyValue(v)));
    light = lum(bg) > lum(w3);
    // five inks from the page's own wave greys; the brightest, for foam, goes one step past wave-3
    const foam = w3.map((c, i) => c + (w3[i] - w2[i]) * 1.3) as RGB;
    ramp = [w1, mix(w1, w2, 0.5), w2, w3, foam].map((c) => c.map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB);
  };

  // shades to inks; mid-switch, the cells still outside the circle keep the old ones
  function ink(c0: number, cols: number, rows: number, data: Uint8ClampedArray, stride: number) {
    const r = old ? wipeRadius() : -1;
    const w = r >= 0 && r < Infinity ? circle : null;
    for (let gx = 0; gx < cols; gx++) {
      const cx = c0 + gx, calm = calmOf[cx];
      const ddx = w ? ((cx + 0.5) * CS - w.x) ** 2 : 0;
      for (let gy = 0; gy < rows; gy++) {
        const outside = w ? ddx + ((gy + 0.5) * CS - w.y) ** 2 > r * r : false;
        const R = outside ? old!.ramp : ramp, L = outside ? old!.light : light;
        let s = sh[gy * stride + cx];
        if (L) s = (1 - s) * 0.8 * calm; // on paper the foam is the paper and the water is ink
        const lvl = Math.min(5, Math.floor(s * 5 + (B8[(gy % 8) * 8 + (cx % 8)] + 0.5) / 64 - 0.15));
        const i = (gy * stride + cx) * 4;
        if (lvl > 0) {
          const c = R[lvl - 1];
          data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
        } else data[i + 3] = 0;
      }
    }
  }
  let circle: Wipe | null = null;

  /** inks the shades in `sh` (both gutters) and shows them; mid-switch, every frame, so the circle's edge
   * moves smoothly over the sea */
  function reink() {
    if (!img) return;
    const cols = GW / CS;
    if (cols >= 4) {
      ink(0, cols, img.height, img.data, img.width);
      ink(img.width - cols, cols, img.height, img.data, img.width);
    }
    g!.putImageData(img, 0, 0);
  }

  /** shades the sea for time t here on the page, and shows it */
  function draw() {
    if (!img) return;
    shadeGutters(sh, calmOf, W, H, GW, img.width, img.height, t);
    reink();
  }

  /** a frame back from the background thread: it becomes the shades, and the old ones its next buffer */
  function take() {
    if (!got) return false;
    spare = sh;
    sh = got;
    got = null;
    return true;
  }

  function size() {
    W = page.clientWidth;
    H = window.innerHeight;
    GW = Math.max(0, Math.floor(((W - CONTENT) / 2 - RAIL) / CS) * CS);
    const cw = Math.ceil(W / CS), ch = Math.ceil(H / CS);
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = `${cw * CS}px`;
    canvas.style.height = `${ch * CS}px`;
    img = g!.createImageData(cw, ch);
    sh = new Float32Array(cw * ch);
    // a frame being shaded for the old size is thrown away when it comes back
    gen++;
    spare = new Float32Array(cw * ch);
    asked = false;
    got = null;
    draw();
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    // mid-switch every frame is inked again, the last one (the circle has passed) in the new inks only
    const wiping = !!old;
    if (old) {
      const r = wipeRadius();
      if (r === -1 || r === Infinity) { old = null; circle = null; }
    }
    // a frame the background thread finished since the last one is shown now
    let fresh = take();
    // about 12 frames a second (the next waits for the last to come back, then catches up on the time)
    if (now - last >= 80 && !asked) {
      t += Math.min(0.25, (now - last) / 1000);
      last = now;
      if (spare && img && offthread()) {
        asked = true;
        seaJob({ k: 'sea', gen, t, W, H, GW, cw: img.width, ch: img.height, sh: spare }, back);
        spare = null;
      } else {
        shadeGutters(sh, calmOf, W, H, GW, img!.width, img!.height, t);
        fresh = true;
      }
    }
    if (fresh || wiping) reink();
  }
  function back(buf: F32, of: number) {
    if (of !== gen) return; // shaded for a size the canvas no longer has
    asked = false;
    got = buf;
    // with the loop stopped meanwhile (the sea switch, a page opening), show it at once as the last frame
    if (!raf && take()) reink();
  }
  // if the thread ever dies, the page shades the sea itself again (the frame it had is lost)
  whenDown(() => {
    if (!asked || !img) return;
    asked = false;
    spare = new Float32Array(img.width * img.height);
  });

  readColors();
  size();
  window.addEventListener('resize', size);
  // new inks; a moving sea shows them on its next frame, a still one is drawn again now
  window.addEventListener('site:theme', () => { readColors(); if (!raf) draw(); });
  // a moving sea is shown live through the switch and keeps its old inks outside the circle
  window.addEventListener('site:theme-wipe', (e) => {
    if (!raf || !isLive(canvas)) return;
    old = { ramp, light };
    circle = (e as CustomEvent<Wipe>).detail;
  });
  if (reduce) return;
  const still = () => document.documentElement.dataset.waves === 'still';
  const start = () => {
    if (!raf && GW >= CS * 4 && !still() && !paged()) { last = performance.now(); raf = requestAnimationFrame(loop); canvas.dataset.running = ''; offthread(); }
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; delete canvas.dataset.running; old = null; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('resize', () => (GW >= CS * 4 ? start() : stop()));
  window.addEventListener('site:waves', () => (still() ? stop() : start())); // the header switch
  window.addEventListener('site:paged', () => (paged() ? stop() : start())); // a page covers the sea
  start();
}

type RGB = [number, number, number];
type F32 = Float32Array<ArrayBuffer>;
function rgb(c: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const lum = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a: RGB, b: RGB, k: number) => a.map((v, i) => v + (b[i] - v) * k) as RGB;
