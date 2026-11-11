// The mech's power cable as a rope. It is a chain of points held at equal spacing (Verlet integration
// with distance constraints), pinned to the street at its far end and, while plugged in, to the socket
// behind the left shoulder. Pulled out, the plug pops free of the socket and the cable falls under its own
// weight, swings, and comes to rest on the street, where friction stops it sliding. Plugged back in, the
// plug end is drawn up to the socket on an arc and the rest of the cable follows it; once seated it
// swings and settles back into its hanging curve. The rope is drawn in whole cells, like the rest of the
// scene, with the lit upper edge of the drawn cable. It only computes while something is moving.
import { rand } from './paint';
import { sound } from './sound';

interface Geo { ax: number; ay: number; lie: number; T: number; xA: number; xT: number; ca: number; W?: number }
interface Rope {
  geo: Geo; gy: number; sx: number; sy: number; seg: number;
  x: Float64Array; y: Float64Array; px: Float64Array; py: Float64Array;
  body: SVGPathElement; hi: SVGPathElement; hit: SVGPathElement | null;
  pinned: boolean; awake: boolean; still: number; landed: boolean;
}

// A thick armoured power cable, not a string: heavy (it drops fast and lands dead), it doesn't stretch
// (many constraint passes), it resists bending (a second constraint across every pair of links keeps a
// joint from folding past about 40 degrees), and its rubber jacket soaks up swinging (strong damping).
const G = 240;       // gravity, cells/s²
const SUB = 4;       // substeps a frame
const ITER = 36;     // constraint passes a substep
const AIR = 0.988;   // velocity kept per substep: the swing dies away in well under a second
const BEND = 0.35;   // how hard a joint resists folding past BEND_MIN
const BEND_MIN = 1.88; // the shortest a pair of links may span, in links (about 40 degrees of bend)
const PLUG_W = 0.5;  // the plug end is heavier: it gives way half as much

export function mountUmbilical(hero: HTMLElement, view: () => string, reduce: boolean) {
  const ropes = new Map<string, Rope>();
  hero.querySelectorAll<SVGGElement>('g.rope[data-rope]').forEach((g) => {
    const svg = g.ownerSVGElement!;
    const v = svg.dataset.view!;
    const geo: Geo = { ...JSON.parse(g.dataset.rope!), W: svg.viewBox.baseVal.width };
    const [body, hi] = g.querySelectorAll('path');
    const hit = hero.querySelector<SVGPathElement>(`svg.over[data-view='${v}'] [data-cable]`);
    ropes.set(v, build(geo, body, hi, hit));
  });
  let plugged = true;
  let reel: { t: number; dur: number; x0: number; y0: number; done: () => void } | null = null;

  /** the rope at rest, plugged in: equal steps along the street part and the catenary */
  function build(geo: Geo, body: SVGPathElement, hi: SVGPathElement, hit: SVGPathElement | null): Rope {
    const h = geo.T / 2, gy = geo.lie + h;
    const hang = (x: number) => geo.lie - geo.ca * (Math.cosh((x - geo.xT) / geo.ca) - 1) + h;
    const pts: [number, number][] = [];
    for (let x = geo.xA; x < geo.xT; x += 0.5) pts.push([x + h, gy]);
    for (let x = geo.xT; x <= geo.ax; x += 0.1) pts.push([x + h, hang(x)]);
    pts.push([geo.ax + h, geo.ay + h]);
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = acc[acc.length - 1], n = Math.max(16, Math.ceil(L / 4)) + 1, seg = L / (n - 1);
    const x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0, j = 0; i < n; i++) {
      const s = i * seg;
      while (j < pts.length - 2 && acc[j + 1] < s) j++;
      const k = Math.min(1, (s - acc[j]) / (acc[j + 1] - acc[j] || 1));
      x[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k;
      y[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k;
    }
    const r: Rope = { geo, gy, sx: geo.ax + h, sy: geo.ay + h, seg, x, y, px: x.slice(), py: y.slice(), body, hi, hit, pinned: true, awake: false, still: 0, landed: true };
    draw(r);
    return r;
  }

  function simulate(r: Rope, dt: number, quiet = false) {
    const n = r.x.length, last = n - 1, h = dt / SUB;
    let moved = 0;
    for (let s = 0; s < SUB; s++) {
      for (let i = 1; i < n; i++) {
        if (i === last && r.pinned) continue;
        const vx = (r.x[i] - r.px[i]) * AIR, vy = (r.y[i] - r.py[i]) * AIR;
        r.px[i] = r.x[i]; r.py[i] = r.y[i];
        r.x[i] += vx; r.y[i] += vy + G * h * h;
      }
      if (reel && r === ropes.get(view())) {
        // drawn up to the socket on an arc, easing in and out
        const k = Math.min(1, reel.t / reel.dur), e = k * k * (3 - 2 * k);
        const cx = (reel.x0 + r.sx) / 2 - 4, cy = Math.min(reel.y0, r.sy) - 9;
        r.x[last] = (1 - e) ** 2 * reel.x0 + 2 * (1 - e) * e * cx + e * e * r.sx;
        r.y[last] = (1 - e) ** 2 * reel.y0 + 2 * (1 - e) * e * cy + e * e * r.sy;
      } else if (r.pinned) { r.x[last] = r.sx; r.y[last] = r.sy; }
      const endW = r.pinned || reel ? 0 : PLUG_W;
      for (let it = 0; it < ITER; it++) {
        for (let i = 0; i < last; i++) {
          const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i];
          const d = Math.hypot(dx, dy) || 1e-6, diff = (d - r.seg) / d;
          const w0 = i === 0 ? 0 : 1, w1 = i + 1 === last ? endW : 1, wsum = w0 + w1;
          if (!wsum) continue;
          r.x[i] += dx * diff * (w0 / wsum); r.y[i] += dy * diff * (w0 / wsum);
          r.x[i + 1] -= dx * diff * (w1 / wsum); r.y[i + 1] -= dy * diff * (w1 / wsum);
        }
        // stiffness: a joint can't fold tighter than BEND_MIN, so the cable keeps its body
        for (let i = 0; i < last - 1; i++) {
          const dx = r.x[i + 2] - r.x[i], dy = r.y[i + 2] - r.y[i];
          const d = Math.hypot(dx, dy) || 1e-6, min = r.seg * BEND_MIN;
          if (d >= min) continue;
          const w0 = i === 0 ? 0 : 1, w1 = i + 2 === last ? endW : 1, wsum = w0 + w1;
          if (!wsum) continue;
          const k = ((d - min) / d) * BEND;
          r.x[i] += dx * k * (w0 / wsum); r.y[i] += dy * k * (w0 / wsum);
          r.x[i + 2] -= dx * k * (w1 / wsum); r.y[i + 2] -= dy * k * (w1 / wsum);
        }
        // the street: nothing goes through it, and what lies on it drags
        for (let i = 1; i < n; i++) {
          if (r.y[i] < r.gy) continue;
          if (i === last && !r.landed && !quiet) {
            const v = (r.y[i] - r.py[i]) / h;
            if (v > 20) sound('knock', (r.x[i] / (r.geo.W || 373)) * 2 - 1, Math.min(1, v / 140));
            r.landed = true;
          }
          r.y[i] = r.gy;
          r.py[i] = r.gy;
          r.px[i] = r.x[i] - (r.x[i] - r.px[i]) * 0.5;
        }
      }
      for (let i = 1; i < n; i++) moved = Math.max(moved, Math.abs(r.x[i] - r.px[i]) + Math.abs(r.y[i] - r.py[i]));
    }
    r.still = moved < 0.004 ? r.still + 1 : 0;
    if (r.still > 30 && !reel) r.awake = false;
  }

  /** whole cells along the rope, T thick, plus the part that lies still on the street to the left */
  function draw(r: Rope) {
    const T = r.geo.T, h = T / 2, rows = new Map<number, Set<number>>();
    const add = (cx: number, cy: number) => {
      for (let j = 0; j < T; j++) { let row = rows.get(cy + j); if (!row) rows.set(cy + j, (row = new Set())); for (let i = 0; i < T; i++) row.add(cx + i); }
    };
    for (let x = 0; x < r.x[0]; x++) add(x, Math.round(r.gy - h));
    for (let i = 0; i < r.x.length - 1; i++) {
      const steps = Math.ceil(Math.hypot(r.x[i + 1] - r.x[i], r.y[i + 1] - r.y[i]) * 2) || 1;
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        add(Math.round(r.x[i] + (r.x[i + 1] - r.x[i]) * k - h), Math.round(r.y[i] + (r.y[i + 1] - r.y[i]) * k - h));
      }
    }
    let body = '';
    const top = new Map<number, number>();
    for (const [y, set] of rows) {
      const xs = [...set].sort((a, b) => a - b);
      for (let i = 0; i < xs.length;) {
        let j = i;
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
        body += `M${xs[i]} ${y}h${xs[j] - xs[i] + 1}v1h${xs[i] - xs[j] - 1}z`;
        i = j + 1;
      }
      for (const x of xs) if (!top.has(x) || y < top.get(x)!) top.set(x, y);
    }
    let hi = '';
    for (const [x, y] of top) hi += `M${x} ${y}h1v1h-1z`;
    r.body.setAttribute('d', body);
    r.hi.setAttribute('d', hi);
    if (r.hit) {
      let d = `M0 ${r.gy.toFixed(1)}`;
      for (let i = 0; i < r.x.length; i++) d += `L${r.x[i].toFixed(1)} ${r.y[i].toFixed(1)}`;
      r.hit.setAttribute('d', d);
    }
  }

  function release(r: Rope, quiet: boolean) {
    const last = r.x.length - 1, h = 1 / 60 / SUB;
    r.pinned = false;
    r.landed = false;
    r.awake = true;
    r.still = 0;
    // the socket kicks the plug out, up and away from the shoulder
    r.px[last] = r.x[last] - rand(-70, -55) * h;
    r.py[last] = r.y[last] - rand(-70, -55) * h;
    if (quiet) for (let i = 0; i < 400 && r.awake; i++) simulate(r, 1 / 60, true);
  }

  /** a framing that was off screen catches up with the cable's state */
  function sync(r: Rope) {
    if (r.pinned === plugged || reel) return;
    if (plugged) { const fresh = build(r.geo, r.body, r.hi, r.hit); Object.assign(r, fresh); }
    else { release(r, true); draw(r); }
  }

  return {
    unplug() {
      plugged = false;
      if (reduce) return;
      hero.dataset.rope = '';
      ropes.forEach((r) => (r === ropes.get(view()) ? release(r, false) : undefined));
    },
    /** draw the plug back up to the socket over dur seconds, then seat it */
    reel(dur: number, done: () => void) {
      if (reel) return;
      const r = ropes.get(view());
      if (reduce || !r) { window.setTimeout(done, reduce ? dur * 1000 : 0); plugged = true; return; }
      sync(r);
      const last = r.x.length - 1;
      reel = { t: 0, dur, x0: r.x[last], y0: r.y[last], done };
      r.awake = true;
      r.still = 0;
    },
    reeling: () => reel !== null,
    /** a click on the loose cable: the links nearest the click are knocked up and away */
    poke(cx: number, cy: number) {
      const r = ropes.get(view());
      if (reduce || !r || reel) return;
      const m = r.body.ownerSVGElement?.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      let best = 1, bd = Infinity;
      for (let i = 1; i < r.x.length; i++) { const d = Math.hypot(r.x[i] - p.x, r.y[i] - p.y); if (d < bd) { bd = d; best = i; } }
      const h = 1 / 60 / SUB, side = Math.random() < 0.5 ? -1 : 1;
      for (let i = Math.max(1, best - 3); i <= Math.min(r.x.length - 1, best + 3); i++) {
        if (i === r.x.length - 1 && r.pinned) continue;
        const k = 1 - Math.abs(i - best) / 4;
        r.px[i] = r.x[i] - side * 18 * k * h;
        r.py[i] = r.y[i] + 70 * k * h;
      }
      r.landed = false;
      r.awake = true;
      r.still = 0;
    },
    /** where the plug lies, while it is out (cells) */
    plugX(): number | null {
      const r = ropes.get(view());
      return plugged || !r || reduce || !hero.hasAttribute('data-rope') ? null : r.x[r.x.length - 1];
    },
    step(dt: number) {
      if (reduce) return;
      const r = ropes.get(view());
      if (!r) return;
      sync(r);
      if (reel) {
        reel.t += dt;
        if (reel.t >= reel.dur) {
          const done = reel.done;
          reel = null;
          plugged = true;
          r.pinned = true;
          r.awake = true;
          r.still = 0;
          ropes.forEach((o) => { if (o !== r) Object.assign(o, build(o.geo, o.body, o.hi, o.hit)); });
          done();
        }
      }
      if (!r.awake) return;
      simulate(r, Math.min(dt, 1 / 30));
      draw(r);
    },
  };
}
