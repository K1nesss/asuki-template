// Effects for the thrown prop, drawn in 2px pixels on a canvas laid over the yard (and some sky
// above it, since a throw arcs high): a burning trail behind the head in flight, a ring of light where
// the pet lets go, and on impact a flash, debris kicked off the tape, a shock running along the ground and
// a jolt through the yard. Reduced motion keeps only a brief flash where it lands.

const PX = 2;          // one effect pixel, in CSS px
const ABOVE = 160;     // how far the canvas reaches above the yard
const TRAIL_LIFE = 0.15; // short, so it stays with the head and never reaches back past the tail

interface Pt { x: number; y: number; t: number }
interface Bit { x: number; y: number; vx: number; vy: number; life: number; age: number; c: string; s: number; g: number }
interface Ring { x: number; y: number; age: number; life: number; r: number; hex: boolean }
interface Shock { x: number; y: number; age: number; life: number; reach: number }
/** wall: the side of the yard it hit (-1 left, 1 right); the flash then runs along the wall, not up from the tape */
interface Flash { x: number; y: number; age: number; life: number; len: number; wall?: number }

const HOT = ['#fff4e0', '#ffd27a', '#ff7a3d', '#ff3b30', '#d10a29'];

export function mountFx(yard: HTMLElement, reduce: boolean) {
  const canvas = document.createElement('canvas');
  canvas.className = 'prop-fx';
  canvas.setAttribute('aria-hidden', 'true');
  yard.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  let W = 0, H = 0, clock = 0;
  const size = () => {
    W = Math.ceil(yard.clientWidth / PX);
    H = Math.ceil((yard.clientHeight + ABOVE) / PX);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * PX}px`;
    canvas.style.height = `${H * PX}px`;
  };
  size();
  new ResizeObserver(size).observe(yard);

  const trail: Pt[] = [];
  const bits: Bit[] = [];
  const rings: Ring[] = [];
  const shocks: Shock[] = [];
  const flashes: Flash[] = [];
  let lastTrailAt = -1;

  const gx = (x: number) => Math.round(x / PX);
  const gy = (y: number) => Math.round((y + ABOVE) / PX);
  const dot = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  function line(x0: number, y0: number, x1: number, y1: number, c: string, keep = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    g.fillStyle = c;
    for (let i = 0; i <= n; i++) {
      if (keep < 1 && ((i * 7 + x0 * 3) % 10) / 10 >= keep) continue; // thins out like a dither as it cools
      g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    }
  }

  function burst(x: number, y: number, n: number, opts: { dir?: number; up?: number; speed?: number; colors: string[]; life?: number; grav?: number }) {
    for (let i = 0; i < n; i++) {
      const ang = opts.dir !== undefined
        ? Math.atan2(-(opts.up ?? 0.6) - Math.random() * 0.8, -opts.dir * (0.2 + Math.random()))
        : Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 220) * (0.4 + Math.random() * 0.8);
      bits.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0,
        life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        c: opts.colors[Math.floor(Math.random() * opts.colors.length)], s: Math.random() < 0.25 ? 2 : 1, g: opts.grav ?? 900,
      });
    }
  }

  const api = {
    /** the head's path this frame: the trail burns only behind the head, never at the tail */
    trail(tx: number, ty: number) {
      if (reduce) return;
      trail.push({ x: tx, y: ty, t: clock });
      lastTrailAt = clock;
    },
    /** she lets go: a ring of light at her hand and a few streaks thrown back */
    release(x: number, y: number, dir: number) {
      if (reduce) return;
      rings.push({ x, y, age: 0, life: 0.42, r: 26, hex: true });
      rings.push({ x, y, age: -0.06, life: 0.4, r: 16, hex: true });
      burst(x, y, 10, { dir, up: 0.1, speed: 260, colors: HOT, life: 0.3, grav: 0 });
    },
    /** it glances off the end of the yard (wall: -1 left, 1 right): a flash along the wall and sparks
     * thrown back into the yard. The point sits a pixel inside, so none of it is cut off at the edge. */
    spark(x: number, y: number, wall: number, k = 1) {
      x -= wall * PX;
      flashes.push({ x, y, age: 0, life: 0.16, len: 9 * k, wall });
      if (reduce) return;
      rings.push({ x, y, age: 0, life: 0.3, r: 16 * k, hex: true });
      // burst() throws against its dir, so dir = wall sends them away from the wall
      burst(x, y, Math.round(20 * k), { dir: wall, up: 0.5, speed: 340 * k, colors: HOT, life: 0.45 });
    },
    /** it bites into the tape */
    impact(x: number, y: number, dir: number, k = 1) {
      flashes.push({ x, y, age: 0, life: reduce ? 0.16 : 0.16, len: 10 * k });
      if (reduce) return;
      shocks.push({ x, y, age: 0, life: 0.5, reach: 95 * k });
      rings.push({ x, y: y - 2, age: 0, life: 0.36, r: 26 * k, hex: false });
      burst(x, y - 2, Math.round(26 * k), { dir, up: 1.2, speed: 300 * k, colors: ['#ff7a3d', '#ff7a3d', '#2a2426', '#fff4e0', '#d10a29'], life: 0.7 });
      burst(x, y - 1, Math.round(8 * k), { dir: -dir, up: 0.4, speed: 120, colors: ['#5a5052', '#3a3335'], life: 0.9, grav: -60 }); // dust that drifts up
      yard.classList.remove('jolt');
      void yard.offsetWidth;
      yard.classList.add('jolt');
    },
    step(dt: number) {
      clock += dt;
      while (trail.length && clock - trail[0].t > TRAIL_LIFE) trail.shift();
      if (clock - lastTrailAt > TRAIL_LIFE) trail.length = 0;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        if (b.age > b.life) { bits.splice(i, 1); continue; }
        b.vy += b.g * dt;
        b.vx *= 1 - Math.min(1, dt * 2);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      for (const list of [rings, shocks, flashes] as { age: number; life: number }[][])
        for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) > list[i].life) list.splice(i, 1);
      if (!trail.length && !bits.length && !rings.length && !shocks.length && !flashes.length) {
        if (canvas.dataset.dirty) { g.clearRect(0, 0, W, H); delete canvas.dataset.dirty; }
        return;
      }
      canvas.dataset.dirty = '1';
      draw();
    },
  };

  function draw() {
    g.clearRect(0, 0, W, H);
    // the trail: white-hot at the tip, cooling to red and thinning out behind
    for (let i = trail.length - 1; i > 0; i--) {
      const p = trail[i], q = trail[i - 1];
      const age = (clock - p.t) / TRAIL_LIFE;
      const c = HOT[Math.min(HOT.length - 1, Math.floor(age * HOT.length))];
      line(gx(q.x), gy(q.y), gx(p.x), gy(p.y), c, 1 - age * 0.8);
      if (age < 0.35) line(gx(q.x), gy(q.y) + 1, gx(p.x), gy(p.y) + 1, HOT[Math.min(4, Math.floor(age * HOT.length) + 2)], 0.7);
    }
    for (const b of bits) {
      const k = b.age / b.life;
      if (k > 0.6 && ((gx(b.x) + gy(b.y)) & 1)) continue; // flicker out
      g.fillStyle = b.c;
      g.fillRect(gx(b.x), gy(b.y), b.s, b.s);
    }
    // rings: a hexagon (the shield's mark) where she lets go; a plain ring on impact
    for (const r of rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, rad = (r.r * (0.3 + k)) / PX, c = k < 0.4 ? HOT[1] : k < 0.7 ? HOT[2] : HOT[3];
      const sides = r.hex ? 6 : 16, cx = gx(r.x), cy = gy(r.y), squash = r.hex ? 1 : 0.35;
      for (let s = 0; s < sides; s++) {
        const a0 = (s / sides) * Math.PI * 2 + (r.hex ? Math.PI / 6 : 0), a1 = ((s + 1) / sides) * Math.PI * 2 + (r.hex ? Math.PI / 6 : 0);
        line(cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad * squash, cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad * squash, c, 1 - k * 0.7);
      }
    }
    // the shock along the tape: two bright fronts running out each way
    for (const s of shocks) {
      const k = s.age / s.life, d = (s.reach * Math.sqrt(k)) / PX, y = gy(s.y) - 1, x = gx(s.x);
      const c = k < 0.5 ? HOT[1] : HOT[2];
      for (const side of [-1, 1]) {
        const fx = x + side * d;
        line(fx - side * 3, y, fx, y, c, 1 - k);
        dot(Math.round(fx), y - 1, HOT[0]);
      }
    }
    // the flash: a pixel star where the tip went in, or a split along the wall where it glanced off
    for (const f of flashes) {
      const k = f.age / f.life, n = Math.max(1, Math.round(f.len * (1 - k))), x = gx(f.x), y = gy(f.y) - 1;
      g.fillStyle = HOT[0];
      g.fillRect(x - 1, y - 1, 3, 3);
      if (f.wall) {
        const w = -f.wall; // into the yard
        line(x, y - n, x, y + n, HOT[0]);
        line(x, y, x + w * n * 0.9, y, HOT[1]);
        line(x, y, x + w * n * 0.6, y - n * 0.6, HOT[2], 0.7);
        line(x, y, x + w * n * 0.6, y + n * 0.6, HOT[2], 0.7);
        continue;
      }
      line(x - n, y, x + n, y, HOT[0]);
      line(x, y - n, x, y, HOT[1]);
      line(x - n * 0.6, y - n * 0.6, x, y, HOT[2], 0.7);
      line(x + n * 0.6, y - n * 0.6, x, y, HOT[2], 0.7);
    }
  }

  return api;
}
