// The sea's shading, shared by the page (its first frame, and any browser without workers) and the
// background thread that shades every later frame (canvas-worker.ts), so both draw exactly the same water.
// A camera hangs over a 3D ocean surface (a sum of Gerstner waves, so crests come out sharp and troughs
// broad) and each 4px cell of the two gutters is one ray onto it: the water is shaded by the sky it
// reflects, a low light glinting off it, light coming through the thin tops of the swells, and foam where
// the surface folds over on a crest. waves.ts cuts the result to five tones with an ordered (Bayer) dither.

export const B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
export const CS = 4;
export const CONTENT = 1120;
export const RAIL = 24;

// the camera: 45 m over the water, looking 35° down, 55° tall field of view
const CAM_H = 45;
const PITCH = (35 * Math.PI) / 180;
const FOVY = (55 * Math.PI) / 180;

// the swells: wavelength (m), heading away from straight-at-the-camera (deg), height as a share of
// the wavelength, and steepness. Long swells roll in almost head-on; the short chop comes from all sides.
const SPEC: [number, number, number, number][] = [
  [70, 6, 0.07, 1], [47, -9, 0.06, 1], [29, 15, 0.05, 0.9], [17, -24, 0.045, 0.8],
  [10, 40, 0.04, 0.7], [6, -55, 0.035, 0.6], [3.5, 75, 0.03, 0.5],
];
const WAVES = SPEC.map(([L, deg, ar, Q]) => {
  const k = (2 * Math.PI) / L, A = L * ar, a = ((-90 + deg) * Math.PI) / 180;
  return { k, w: Math.sqrt(9.81 * k), A, dx: Math.cos(a), dz: Math.sin(a), q: Q / (k * A * SPEC.length), kA: k * A };
});
const A_MAX = WAVES.reduce((s, w) => s + w.A, 0);
const NW = WAVES.length;
const WK = Float64Array.from(WAVES, (w) => w.k), WW = Float64Array.from(WAVES, (w) => w.w), WA = Float64Array.from(WAVES, (w) => w.A);
const WDX = Float64Array.from(WAVES, (w) => w.dx), WDZ = Float64Array.from(WAVES, (w) => w.dz);
const WKA = Float64Array.from(WAVES, (w) => w.kA), WQKA = Float64Array.from(WAVES, (w) => w.q * w.kA);

// a sine table: a frame takes tens of thousands of rays and a lookup is far cheaper than Math.sin
const TN = 4096, TM = TN - 1, TK = TN / (2 * Math.PI);
const SIN = Float32Array.from({ length: TN }, (_, i) => Math.sin((i / TN) * 2 * Math.PI));
const sin = (a: number) => SIN[(a * TK) & TM];
const cos = (a: number) => SIN[(a * TK + TN / 4) & TM];
const TY = Math.tan(FOVY / 2), CP = Math.cos(PITCH), SP = Math.sin(PITCH);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// light: a low, hazy sun out ahead
const LX = 0, LY = 0.33, LZ = 0.94;
const camZ = 0; // the camera never moves

// one ray: returns brightness 0..1 for the sea under screen point (u, v), both -1..1, at time t
function shade(u: number, v: number, asp: number, t: number): number {
  const rx = u * TY * asp, ry = v * TY * CP - SP, rz = v * TY * SP + CP;
  if (ry > -0.02) return 0.3;
  // find the surface: start on the flat sea, then lift to the wave height once
  let tt = CAM_H / -ry, X = rx * tt, Z = camZ + rz * tt, Y = 0;
  for (let i = 0; i < NW; i++) Y += WA[i] * sin(WK[i] * (WDX[i] * X + WDZ[i] * Z) - WW[i] * t);
  tt = (CAM_H - Y) / -ry;
  X = rx * tt; Z = camZ + rz * tt;
  let nx = 0, ny = 1, nz = 0, jxx = 1, jzz = 1, jxz = 0;
  Y = 0;
  for (let i = 0; i < NW; i++) {
    const ph = WK[i] * (WDX[i] * X + WDZ[i] * Z) - WW[i] * t, c = cos(ph), s = sin(ph);
    const dx = WDX[i], dz = WDZ[i], kac = WKA[i] * c, f = WQKA[i] * s;
    Y += WA[i] * s;
    nx -= dx * kac; nz -= dz * kac; ny -= f;
    jxx -= f * dx * dx; jzz -= f * dz * dz; jxz -= f * dx * dz;
  }
  const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= nl; ny *= nl; nz *= nl;
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz), il = 1 / rl, vx = rx * il, vy = ry * il, vz = rz * il;
  const ndotv = nx * vx + ny * vy + nz * vz;
  const m = 1 - clamp01(-ndotv), m2 = m * m;
  const fres = 0.02 + 0.98 * m2 * m2 * m;
  const Rx = vx - 2 * ndotv * nx, Ry = vy - 2 * ndotv * ny, Rz = vz - 2 * ndotv * nz;
  const up = clamp01(1 - Ry);
  const sky = 0.35 + 0.65 * up * up * up; // the sky is brightest at the horizon
  let sp = clamp01(Rx * LX + Ry * LY + Rz * LZ);
  sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; // ^128: a tight glint
  const diff = clamp01(nx * LX + ny * LY + nz * LZ);
  const top = clamp01(Y / 2.2);
  const through = top * top * 0.35 * clamp01(0.6 - (vx * LX + vy * LY + vz * LZ)); // light through the thin crest
  let val = clamp01(((0.05 + 0.1 * diff) * (1 - fres) + fres * sky * 0.55 + through + sp * 1.2 - 0.06) * 1.8);
  // foam: where a crest is high and the surface folds over (the Jacobian of the waves drops), in streaks along the crest
  const crest = clamp01((Y / A_MAX - 0.14) * 2.6);
  if (crest > 0) {
    const fold = clamp01((1.2 - (jxx * jzz - jxz * jxz)) * 2.2);
    if (fold > 0) {
      const st = 0.5 + 0.5 * sin(X * 0.35 + sin(Z * 0.9) * 2 + t * 0.3) * sin(Z * 2.3 + X * 0.15);
      const st2 = 0.5 + 0.5 * sin(X * 1.9 - Z * 0.7 + t * 0.5) * sin(Z * 3.1 + X * 0.4);
      const foam = crest * fold * 1.6 * (0.4 + 0.9 * st) * (0.6 + 0.6 * st2);
      if (foam > val) val = foam > 1 ? 1 : foam;
    }
  }
  // far water fades into haze
  const haze = clamp01((tt * rl - 60) / 500);
  return val * (1 - haze) + 0.3 * haze;
}

/** Shades every cell of both gutters into `sh` (one value per canvas pixel, `cw` wide and `ch` tall) for
 * time t, and each gutter column's calm (quieter toward the content column) into `calmOf`. */
export function shadeGutters(sh: Float32Array, calmOf: Float32Array, W: number, H: number, GW: number, cw: number, ch: number, t: number) {
  const cols = GW / CS;
  if (cols < 4) return;
  gutter(sh, calmOf, 0, cols, true, cw, ch, W, H, t);
  gutter(sh, calmOf, cw - cols, cols, false, cw, ch, W, H, t);
}
function gutter(sh: Float32Array, calmOf: Float32Array, c0: number, cols: number, outerAtLeft: boolean, stride: number, rows: number, W: number, H: number, t: number) {
  const asp = W / H;
  for (let gx = 0; gx < cols; gx++) {
    const cx = c0 + gx;
    const u = ((cx + 0.5) * CS / W) * 2 - 1;
    const fromOuter = outerAtLeft ? gx / cols : 1 - gx / cols;
    const calm = 1 - 0.4 * fromOuter; // quieter toward the content column
    calmOf[cx] = calm;
    for (let gy = 0; gy < rows; gy++) {
      const v = 1 - (((gy + 0.5) * CS) / H) * 2;
      sh[gy * stride + cx] = shade(u, v, asp, t) * calm;
    }
  }
}
