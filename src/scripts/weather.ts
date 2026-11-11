// The weather over the banner city. The clouds and the dimmed sky are CSS on .hero[data-sky]; this file
// draws what falls and drifts (rain with splashes on the street, snow, a fog bank over the rooftops,
// lightning) on a canvas in the art's own cells, and asks the Worker for fresh weather every 10 minutes.
// ?weather=rain (or clear, partly, overcast, fog, drizzle, storm, snow) previews a look and stops the polling.

import { skyOf, SKIES, SKY_LABEL, type Sky } from '../lib/weather';
import { loopWhileVisible, rand } from './paint';

type View = [number, number, number]; // W, H, street line
interface Drop { x: number; y: number; v: number; len: number; ground: number }
interface Splash { x: number; y: number; t: number }
interface Bolt { d: string; t: number }

const FALL: Record<Sky, { n: number; v: number; len: number; slant: number; mist: number } | null> = {
  clear: null, partly: null, overcast: null,
  fog: { n: 0, v: 0, len: 0, slant: 0, mist: 0.9 },
  drizzle: { n: 70, v: 70, len: 2, slant: 0.15, mist: 0.25 },
  rain: { n: 170, v: 150, len: 4, slant: 0.25, mist: 0.3 },
  storm: { n: 280, v: 210, len: 5, slant: 0.45, mist: 0.35 },
  snow: { n: 110, v: 14, len: 1, slant: 0, mist: 0.2 },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function mountWeather(hero: HTMLElement, opts: { reduce: boolean }) {
  const canvas = hero.querySelector<HTMLCanvasElement>('canvas.wx');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const views = JSON.parse(canvas.dataset.wxViews || '{}') as Record<string, View>;
  const narrowQ = matchMedia('(max-width: 559px)');
  let [W, H, G] = views.wide;
  const fit = () => {
    [W, H, G] = narrowQ.matches ? views.narrow : views.wide;
    canvas.width = W;
    canvas.height = H;
    drops.length = 0;
    fog = null;
  };

  const forced = new URLSearchParams(location.search).get('weather') as Sky | null;
  let sky: Sky = forced && SKIES.includes(forced) ? forced : ((hero.dataset.sky as Sky) || 'clear');
  const setSky = (next: Sky) => {
    sky = next;
    hero.dataset.sky = next;
    hero.querySelectorAll('[data-sky-word]').forEach((el) => (el.textContent = SKY_LABEL[next]));
    nextBolt = rand(2, 6);
    if (opts.reduce) drawStill();
  };

  // colours come from the page's CSS, which changes them with the time of day
  let col = { rain: '#c9a9a4', fog: '#5a3434', snow: '#e8d6d2' };
  const readColours = () => {
    const cs = getComputedStyle(hero);
    col = { rain: cs.getPropertyValue('--rain').trim() || col.rain, fog: cs.getPropertyValue('--fog').trim() || col.fog, snow: cs.getPropertyValue('--snow').trim() || col.snow };
    fog = null;
  };

  const drops: Drop[] = [];
  const splashes: Splash[] = [];
  let bolt: Bolt | null = null;
  let boltPath: SVGPathElement | null = null;
  let nextBolt = rand(2, 6);
  let fog: { img: ImageData; at: number } | null = null;
  let clock = 0;

  const spawn = (anyY: boolean): Drop => {
    const f = FALL[sky]!;
    return {
      x: rand(-H * f.slant, W),
      y: anyY ? rand(-10, H) : rand(-12, -1),
      v: f.v * rand(0.8, 1.2),
      len: f.len,
      // the street has depth: some drops land at the kerb, some nearer the viewer
      ground: rand(G, H - 1),
    };
  };

  // the fog bank: densest just above the rooftops' feet, thinning upward, with slow drifting holes
  function fogImage(t: number, mist: number) {
    const img = ctx!.createImageData(W, H);
    const [r, g, b] = hex(col.fog);
    // it hugs the street and the feet of the blocks, below the title
    const mid = G - 4, spread = G > 100 ? 11 : 8;
    for (let y = 0; y < H; y++) {
      const d = mist * Math.exp(-(((y - mid) / spread) ** 2)) * (y > G ? 0.6 : 1);
      if (d < 0.03) continue;
      for (let x = 0; x < W; x++) {
        const n = 0.55 + 0.45 * Math.sin(x / 19 + t * 0.15 + y / 13) * Math.sin(x / 47 - t * 0.09);
        if (d * n > BAYER[(y % 4) * 4 + (x % 4)]) {
          const i = (y * W + x) * 4;
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 150;
        }
      }
    }
    return img;
  }

  function makeBolt(): Bolt {
    const cells: [number, number][] = [];
    let x = Math.round(rand(W * 0.1, W * 0.9)), y = 0;
    const end = G - Math.round(rand(18, 30));
    let branch = -1;
    while (y < end) {
      cells.push([x, y]);
      y++;
      x += Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      if (branch < 0 && y > end * 0.35 && Math.random() < 0.06) branch = cells.length;
    }
    if (branch > 0) {
      let [bx, by] = cells[branch];
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 12; i++) cells.push([(bx += Math.random() < 0.6 ? dir : 0), ++by]);
    }
    return { d: cells.map(([x, y]) => `M${x} ${y}h2v1h-2z`).join(''), t: 0 };
  }

  function draw() {
    ctx!.clearRect(0, 0, W, H);
    const f = FALL[sky];
    if (!f) return;
    if (f.mist) {
      if (!fog || clock - fog.at > 0.12) fog = { img: fogImage(clock, f.mist), at: clock };
      ctx!.putImageData(fog.img, 0, 0);
    }
    if (sky === 'snow') {
      ctx!.fillStyle = col.snow;
      for (const d of drops) ctx!.fillRect(Math.round(d.x + Math.sin(d.y / 6 + d.v) * 1.5), Math.round(d.y), 1, 1);
    } else if (f.n) {
      ctx!.fillStyle = col.rain;
      ctx!.globalAlpha = 0.55;
      for (const d of drops)
        for (let i = 0; i < d.len; i++) ctx!.fillRect(Math.round(d.x - i * f.slant), Math.round(d.y - i), 1, 1);
      ctx!.globalAlpha = 0.7;
      for (const s of splashes) {
        const k = s.t < 0.07 ? 1 : 2;
        ctx!.fillRect(s.x - k, s.y - 1, 1, 1);
        ctx!.fillRect(s.x + k, s.y - 1, 1, 1);
      }
      ctx!.globalAlpha = 1;
    }
  }

  function step(dt: number) {
    clock += dt;
    const f = FALL[sky];
    if (!f) {
      if (drops.length || bolt) { drops.length = 0; bolt = null; }
      ctx!.clearRect(0, 0, W, H);
      return;
    }
    const target = Math.round((f.n * W) / 373);
    while (drops.length < target) drops.push(spawn(drops.length < target / 2 && clock < 1));
    if (drops.length > target) drops.length = target;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y += d.v * dt;
      d.x += d.v * dt * f.slant + (sky === 'snow' ? Math.sin(clock + d.ground) * 4 * dt : 0);
      if (d.y >= d.ground) {
        if (sky !== 'snow' && d.x >= 0 && d.x < W) splashes.push({ x: Math.round(d.x), y: Math.round(d.ground), t: 0 });
        drops[i] = spawn(false);
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) if ((splashes[i].t += dt) > 0.14) splashes.splice(i, 1);

    if (sky === 'storm') {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        bolt = makeBolt();
        boltPath = hero.querySelector<SVGPathElement>(`svg.art[data-view="${narrowQ.matches ? 'narrow' : 'wide'}"] .bolt`);
        nextBolt = rand(5, 12);
      }
    }
    if (bolt) {
      bolt.t += dt;
      // the bolt is drawn in the art itself, behind the title and the city
      const d = bolt.t < 0.22 ? bolt.d : '';
      if (boltPath && boltPath.getAttribute('d') !== d) boltPath.setAttribute('d', d);
      // two quick flashes, like the real thing
      hero.classList.toggle('flash', bolt.t < 0.06 || (bolt.t > 0.12 && bolt.t < 0.2));
      if (bolt.t > 0.3) { bolt = null; hero.classList.remove('flash'); boltPath?.setAttribute('d', ''); }
    }
    draw();
  }

  // under reduced motion the weather is a still picture: rain hangs as streaks, no lightning
  function drawStill() {
    drops.length = 0;
    const f = FALL[sky];
    if (f) for (let i = 0; i < Math.round((f.n * W) / 373); i++) drops.push(spawn(true));
    clock = 0;
    fog = null;
    draw();
  }

  fit();
  readColours();
  narrowQ.addEventListener('change', () => { fit(); if (opts.reduce) drawStill(); });
  new MutationObserver(() => { readColours(); if (opts.reduce) drawStill(); }).observe(hero, { attributes: true, attributeFilter: ['data-phase'] });
  setSky(sky);
  if (opts.reduce) drawStill();
  else loopWhileVisible(hero, step);

  // fresh weather every 10 minutes (the Worker caches it for 30, and Open-Meteo updates about every 15)
  if (forced && SKIES.includes(forced)) return;
  const poll = async () => {
    try {
      const r = await fetch('/api/weather');
      if (!r.ok) return;
      const j = (await r.json()) as { tempC: number; code: number };
      const box = hero.querySelector<HTMLElement>('[data-wx]');
      if (box) box.hidden = false;
      hero.querySelectorAll('[data-temp]').forEach((el) => (el.textContent = `${j.tempC}°C`));
      const next = skyOf(j.code);
      if (next !== sky) setSky(next);
    } catch {}
  };
  setInterval(poll, 10 * 60_000);
}

function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
