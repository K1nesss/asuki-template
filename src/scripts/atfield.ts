// The shield: where the banner is clicked, a wall of nested octagons flares up. Its size is a
// damped spring (it punches out past its full size and rings back), bright bands run outward through
// the rings like a shock passing through, the inside glows with a thin dither, and it all fades.
// Drawn in 3px pixels on a canvas over the banner art; the loop runs only while a field is up.
import { animate } from './spring';

const PX = 3;
const LIFE = 1.7;
const RINGS = 7;
const HOT = ['#fff4e0', '#ffd27a', '#ff9a4d', '#ff7a3d', '#e1201b'];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

interface Field { x: number; y: number; R: number; age: number; tilt: number }

export function mountATField(hero: HTMLElement, reduce: boolean) {
  const canvas = document.createElement('canvas');
  canvas.className = 'atf';
  canvas.setAttribute('aria-hidden', 'true');
  hero.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  let W = 0, H = 0, running = false;
  const fields: Field[] = [];
  const size = () => {
    W = Math.ceil(hero.clientWidth / PX);
    H = Math.ceil(hero.clientHeight / PX);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * PX}px`;
    canvas.style.height = `${H * PX}px`;
  };
  size();
  new ResizeObserver(size).observe(hero);

  // the size of the field over time: a step response of an underdamped spring (overshoots ~30%)
  const zeta = 0.36, w0 = 15, wd = w0 * Math.sqrt(1 - zeta * zeta);
  const grow = (t: number) => 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  const fade = (t: number) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 2.2));

  function octagon(cx: number, cy: number, r: number, tilt: number, c: string, keep: number) {
    g.fillStyle = c;
    for (let s = 0; s < 8; s++) {
      const a0 = tilt + (s / 8) * Math.PI * 2, a1 = tilt + ((s + 1) / 8) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i < n; i++) {
        const px = Math.round(x0 + ((x1 - x0) * i) / n), py = Math.round(y0 + ((y1 - y0) * i) / n);
        if (keep < 1 && B4[(py & 3) * 4 + (px & 3)] / 16 >= keep) continue; // fainter rings break up like a dither
        g.fillRect(px, py, 1, 1);
      }
    }
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    for (const f of fields) {
      const t = f.age, k = grow(t), e = fade(t), cx = f.x / PX, cy = f.y / PX, R = (f.R / PX) * k;
      // the glow inside: a thin ordered dither, densest at the rim
      const glow = 0.3 * e;
      if (glow > 0.02 && R > 2) {
        g.fillStyle = HOT[3];
        const r2 = R * Math.cos(Math.PI / 8); // inside the octagon's flats
        for (let y = Math.max(0, Math.floor(cy - r2)); y < Math.min(H, cy + r2); y++)
          for (let x = Math.max(0, Math.floor(cx - r2)); x < Math.min(W, cx + r2); x++) {
            const d = Math.hypot(x - cx, y - cy) / r2;
            if (d > 1) continue;
            if (B4[(y & 3) * 4 + (x & 3)] / 16 < glow * (0.35 + 0.65 * d * d)) g.fillRect(x, y, 1, 1);
          }
      }
      // the rings, with bright bands travelling outward through them
      for (let i = 0; i < RINGS; i++) {
        const r = R * ((i + 1) / RINGS);
        if (r < 1.5) continue;
        const band = 0.5 + 0.5 * Math.cos(Math.PI * 2 * ((i / RINGS) * 1.6 - t * 2.6));
        const v = e * (0.35 + 0.65 * band) * (0.55 + 0.45 * (i / (RINGS - 1)));
        if (v < 0.08) continue;
        const c = v > 0.8 ? HOT[0] : v > 0.6 ? HOT[1] : v > 0.4 ? HOT[2] : v > 0.22 ? HOT[3] : HOT[4];
        octagon(cx, cy, r, f.tilt, c, Math.min(1, v * 1.6));
      }
      // the first instant: a white-hot core
      if (t < 0.12) {
        g.fillStyle = HOT[0];
        octagon(cx, cy, Math.max(1, R * 0.18), f.tilt, HOT[0], 1);
        g.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
      }
    }
  }

  return {
    /** raise a field at a point in the page (client coordinates) */
    burst(clientX: number, clientY: number) {
      const r = hero.getBoundingClientRect();
      const R = Math.min(144, Math.max(40, r.width * 0.104)); // about a tenth of the banner
      fields.push({ x: clientX - r.left, y: clientY - r.top, R, age: reduce ? LIFE * 0.6 : 0, tilt: Math.PI / 8 });
      if (fields.length > 4) fields.shift();
      if (running) return;
      running = true;
      animate((dt) => {
        for (let i = fields.length - 1; i >= 0; i--) if ((fields[i].age += dt) > LIFE) fields.splice(i, 1);
        draw();
        if (!fields.length) { g.clearRect(0, 0, W, H); running = false; return false; }
        return true;
      });
    },
  };
}
