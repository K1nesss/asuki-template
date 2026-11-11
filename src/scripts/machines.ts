// The four pixel machines behind the project screens (glow.ts), as fields of brightness. They are shared
// by the page and the background thread that runs them (canvas-worker.ts), so both run the same machines.
//   0 ripple  - dusk light breathing at the bottom edge, rings rolling outward and slowing as they spread
//   1 angel   - a flat-shaded octahedron turning in the air above its own shadow
//   2 life    - Conway's Game of Life, dead cells cooling as they fade; reseeded when it runs down
//   3 pulse   - a monitor: two traces written left to right by a moving head, the old line fading out

/** Fills a W x H field of brightness (0..1+) for time t; h is how hard it is being driven (0..1). */
export type Machine = (f: Float32Array, dt: number, t: number, h: number) => void;
export const KINDS = ['ripple', 'angel', 'life', 'pulse'] as const;

// ---- 0: ripple
function ripple(W: number, H: number): Machine {
  const R = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) R[y * W + x] = Math.hypot((x + 0.5 - W / 2) / (W * 0.5), (H * 1.08 - y) / (H * 0.9));
  return (f, _dt, t, h) => {
    const breathe = 1 + 0.04 * Math.sin(t * 1.3), rings: [number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const p = ((t / 3.6 + k / 3) % 1 + 1) % 1;
      rings.push([1.25 * (1 - Math.pow(1 - p, 2.2)), Math.pow(1 - p, 1.6) * (0.42 + 0.35 * h) * Math.min(1, p * 8)]);
    }
    for (let i = 0; i < f.length; i++) {
      const r = R[i] / breathe;
      let v = r < 1 ? (1 - r) * (1 - r) * (1.25 + 0.3 * h) : 0;
      for (const [rr, a] of rings) { const d = (r - rr) / 0.075; if (d > -3 && d < 3) v += a * Math.exp(-d * d); }
      f[i] = v;
    }
  };
}

// ---- 1: angel (an octahedron)
const OCT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACES: [number, number, number][] = [];
for (const a of [0, 1]) for (const b of [2, 3]) for (const c of [4, 5]) FACES.push([a, b, c]);
function angel(W: number, H: number): Machine {
  let spin = 0;
  const s = Math.min(H * 0.31, W * 0.24);
  return (f, dt, t, h) => {
    f.fill(0);
    spin += dt * (0.55 + 1.6 * h);
    const cx = W / 2, cy = H * 0.42 + Math.sin(t * 1.4) * H * 0.03;
    const ca = Math.cos(spin), sa = Math.sin(spin), tilt = 0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = OCT.map(([x, y, z]) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; // turn about the vertical
      const y2 = y * 1.35 * ct - z1 * st; // tip toward us (and stretch it tall)
      return [cx + x1 * s, cy - y2 * s];
    });
    // its shadow on the floor, breathing with its height
    const sy = Math.round(H * 0.9), sw = s * 0.84 - (cy - H * 0.44) * 0.6;
    for (let y = sy - 3; y <= sy + 3; y++)
      for (let x = Math.floor(cx - sw * 1.4); x <= cx + sw * 1.4; x++) {
        const d = Math.hypot((x - cx) / (sw * 1.4), (y - sy) / 3);
        if (d < 1 && y >= 0 && y < H && x >= 0 && x < W) f[y * W + x] = (1 - d) * 0.5;
      }
    const L = [-0.45, 0.65, 0.62];
    for (const [a, b, c] of FACES) {
      const A = P[a], B = P[b], C = P[c];
      const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const n = [OCT[a][0] + OCT[b][0] + OCT[c][0], OCT[a][1] + OCT[b][1] + OCT[c][1], OCT[a][2] + OCT[b][2] + OCT[c][2]];
      const nx = n[0] * ca + n[2] * sa, nz1 = -n[0] * sa + n[2] * ca;
      const ny = n[1] * ct - nz1 * st, nz = n[1] * st + nz1 * ct;
      if (nz <= 0) continue; // facing away
      const len = Math.hypot(nx, ny, nz);
      const v = 0.3 + 0.7 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / len) + 0.15 * h;
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = (B[0] - A[0]) * (py - A[1]) - (B[1] - A[1]) * (px - A[0]);
          const w1 = (C[0] - B[0]) * (py - B[1]) - (C[1] - B[1]) * (px - B[0]);
          const w2 = (A[0] - C[0]) * (py - C[1]) - (A[1] - C[1]) * (px - C[0]);
          if (area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) f[y * W + x] = v;
        }
      // its edges, cut sharp
      for (const [p, q] of [[A, B], [B, C], [C, A]]) {
        const m = Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])));
        for (let k = 0; k <= m; k++) {
          const x = Math.round(p[0] + ((q[0] - p[0]) * k) / m), y = Math.round(p[1] + ((q[1] - p[1]) * k) / m);
          if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = Math.max(f[y * W + x], 0.97);
        }
      }
    }
  };
}

// ---- 2: life, on a coarser board (each cell is 2x2 of the others) so the patterns read
function life(W: number, H: number, seed: number): Machine {
  const LW = W >> 1, LH = H >> 1, N = LW * LH;
  let cells = new Uint8Array(N), next = new Uint8Array(N);
  const heat = new Float32Array(N);
  let rnd = (seed * 2654435761) >>> 0;
  const rand = () => ((rnd = (Math.imul(rnd ^ (rnd >>> 15), 2246822519) + 1) >>> 0) / 4294967296);
  const soup = (x0: number, y0: number, w: number, hh: number, p: number) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) if (rand() < p) cells[((y + LH) % LH) * LW + ((x + LW) % LW)] = 1;
  };
  soup(0, 0, LW, LH, 0.22);
  let acc = 0, quiet = 0;
  return (f, dt, _t, h) => {
    acc += dt;
    const every = 0.16 - 0.09 * h;
    while (acc >= every) {
      acc -= every;
      let pop = 0, changed = 0;
      for (let y = 0; y < LH; y++)
        for (let x = 0; x < LW; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += cells[((y + dy + LH) % LH) * LW + ((x + dx + LW) % LW)];
          const i = y * LW + x, alive = cells[i] ? n === 2 || n === 3 : n === 3;
          next[i] = alive ? 1 : 0;
          pop += next[i];
          if (next[i] !== cells[i]) changed++;
        }
      [cells, next] = [next, cells];
      for (let i = 0; i < N; i++) heat[i] = cells[i] ? 1 : heat[i] * 0.6;
      // when it settles into still lifes and blinkers, drop a fresh handful of soup
      quiet = changed < N * 0.009 || pop < N * 0.031 ? quiet + 1 : 0;
      if (quiet > 10) { quiet = 0; soup(Math.floor(rand() * LW), Math.floor(rand() * LH), Math.round(LW * 0.19), Math.round(LH * 0.32), 0.45); }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = Math.min(LH - 1, y >> 1) * LW + Math.min(LW - 1, x >> 1);
        // a one-cell gutter inside each cell keeps them reading as cells
        f[y * W + x] = (x & 1) && (y & 1) ? 0 : cells[i] ? 1 : heat[i] * 0.45;
      }
  };
}

// ---- 3: pulse (a monitor)
function pulse(W: number, H: number): Machine {
  const a = new Float32Array(W), b = new Float32Array(W), k = H / 50, run = W / 128;
  let head = 0, beat = 0, ph = 0;
  // one heartbeat, u in 0..1: a small P bump, the QRS spike, then the T wave
  const ecg = (u: number) => 2.2 * Math.exp(-(((u - 0.18) / 0.035) ** 2)) - 3 * Math.exp(-(((u - 0.34) / 0.012) ** 2))
    + 15 * Math.exp(-(((u - 0.37) / 0.014) ** 2)) - 5 * Math.exp(-(((u - 0.4) / 0.014) ** 2)) + 3.5 * Math.exp(-(((u - 0.62) / 0.06) ** 2));
  return (f, dt, _t, h) => {
    f.fill(0);
    const speed = (46 + 30 * h) * run, from = head;
    head += dt * speed;
    for (let s = Math.floor(from); s < Math.floor(head); s++) {
      const x = ((s % W) + W) % W;
      beat += (run / speed) / (1 - 0.35 * h);
      a[x] = H * 0.42 - ecg(beat % 1) * k;
      ph += run / speed;
      b[x] = H * 0.8 + (Math.sin(ph * 5.1) * 3.2 * Math.sin(ph * 0.9 + 1) + Math.sin(ph * 13) * 0.8) * k;
    }
    // the screen's dot grid
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) f[y * W + x] = 0.35;
    const hx = ((Math.floor(head) % W) + W) % W;
    for (let x = 0; x < W; x++) {
      const age = (hx - x + W) % W; // columns behind the head
      if (age > W - 8) continue; // the gap the head is about to write into
      const v = Math.max(0, 1 - age / (W - 8)) * (1.05 + 0.2 * h);
      const px = (x - 1 + W) % W;
      for (const [tr, kk] of [[a, 1], [b, 0.6]] as [Float32Array, number][]) {
        if (!tr[x]) continue;
        const y0 = Math.round(tr[x]), y1 = age < W - 9 && tr[px] ? Math.round(tr[px]) : y0;
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (y >= 0 && y < H) f[y * W + x] = Math.max(f[y * W + x], v * kk);
      }
    }
  };
}

export function machine(kind: number, W: number, H: number, seed = 1): Machine {
  kind = ((kind % 4) + 4) % 4;
  return kind === 0 ? ripple(W, H) : kind === 1 ? angel(W, H) : kind === 2 ? life(W, H, seed) : pulse(W, H);
}
