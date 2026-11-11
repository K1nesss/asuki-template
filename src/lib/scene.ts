// The top banner: a pixel city at dusk with the persona's mech and its pilot.
// Two framings of the same scene: 'wide' (373 x 140 cells, tablets and up) and 'narrow' (120 x 100, phones).
// Colours that change with the time of day (sky bands, sun, lit windows, stars) are emitted as class
// names, and the page's CSS sets them per sky phase.

import persona from '@persona';
import { spriteRects, toLayers, type Layer, type Rect, type Sprite } from './pixels';
import { spriteSize } from './persona';

export const SPRITES = { pet: persona.pet.sprite as Sprite, mech: persona.mech.sprite as Sprite, pilot: persona.pilot.sprite as Sprite };
// The framings were set for a mech 99 cells tall and a pilot 25 cells tall; other sizes are scaled to fill the same space.
const MECH_ROWS = 99, PILOT_ROWS = 25;

export interface Hero {
  W: number;
  H: number;
  /** sky bands and their dithered seams: classes s0..s5 */
  sky: Layer[];
  /** dim and bright stars: classes star, star2 */
  stars: Layer[];
  /** the sun: classes sunA (upper) and sunB (lower) */
  sun: Layer[];
  /** drifting clouds, each drawn twice side by side (0..W and W..2W) so the layer can slide left forever:
   *  a = a few puffs (partly cloudy and worse), b = a cloud deck and big banks (overcast and worse).
   *  Classes cl1 (body), cl2 (top edge), cl3 (underside, lit by the low sun at dawn and dusk) */
  clouds: { a: Layer[]; b: Layer[] };
  /** title position and size */
  title: { x: number; y: number; size: number };
  /** city, poles, wires, street, cable, shadows; lit windows use the class lit */
  scene: Layer[];
  /** the mech and the pilot, on the unclipped top layer; the eyes use the class eye */
  unit: Layer[];
  /** the pilot in her own cells (25 x 25); place with walk.home, walk.y and scale walk.k */
  pilot: Layer[];
  /** the cable plugged into the mech's back, and lying loose on the street when unplugged */
  cable: string;
  cableHi: string;
  cableLoose: string;
  cableLooseHi: string;
  /** a fat invisible stroke along the umbilical cable, for clicks */
  cableHit: string;
  /** the cable as a rope for the physics in umbilical.ts: socket, street line, thickness, the point on the
   *  street where it stops moving (everything left of it just lies there), and the catenary it rests in */
  rope: { ax: number; ay: number; lie: number; T: number; xA: number; xT: number; ca: number };
  /** where the pilot can walk (x range, in cells), where she stands, and the plug */
  walk: { min: number; max: number; home: number; y: number; plug: number; k: number; w: number };
  /** the mech's bounding box, for hover */
  unitBox: { x: number; y: number; w: number; h: number };
  /** the four eyes on its face, split by side, for the afterimages when it is clicked; and a halo round them */
  eyeFx: { l: string; r: string; halo: string; k: number };
}

interface Frame {
  W: number; H: number; G: number;
  stars: number; starH: number;
  sun: { x: number; y: number; r: number };
  title: { x: number; y: number; size: number };
  cities: [number, number, number, string, string][];
  poles: [number, number]; wireLen: number;
  K: number; ux: number; rearShadowY: number;
  pk: number; pdx: number; pBase: number; pShadow: number;
  /** clouds as [centre x, base y, width, height] */
  cloudsA: Cloud[]; cloudsB: Cloud[]; deck: number;
}
type Cloud = [number, number, number, number];

const FRAMES: Record<'wide' | 'narrow', Frame> = {
  wide: {
    W: 373, H: 140, G: 128, stars: 60, starH: 70,
    sun: { x: 312, y: 96, r: 60 },
    title: { x: 12, y: 98, size: 108 },
    cities: [[17, 10, 30, '#1d1517', 'lit'], [29, 4, 16, '#141012', 'lit2']],
    poles: [30, 130], wireLen: 190,
    K: 4 / 3, ux: 270, rearShadowY: 6,
    pk: 1 / 3, pdx: -18, pBase: 8, pShadow: 10,
    cloudsA: [[44, 30, 50, 13], [150, 54, 34, 9], [238, 22, 60, 14], [334, 46, 42, 11]],
    cloudsB: [[96, 42, 76, 17], [196, 66, 52, 12], [292, 36, 84, 19], [18, 64, 46, 12]],
    deck: 13,
  },
  narrow: {
    W: 120, H: 100, G: 90, stars: 20, starH: 50,
    sun: { x: 88, y: 68, r: 27 },
    title: { x: 5, y: 40, size: 38 },
    cities: [[17, 8, 22, '#1d1517', 'lit'], [29, 4, 12, '#141012', 'lit2']],
    poles: [8, 52], wireLen: 62,
    K: 5 / 6, ux: 58, rearShadowY: 7,
    pk: 2 / 9, pdx: -8, pBase: 1, pShadow: 7,
    cloudsA: [[24, 20, 32, 10], [84, 38, 28, 8]],
    cloudsB: [[56, 30, 48, 13], [108, 54, 32, 9]],
    deck: 9,
  },
};

const SHADOW = '#0a0809';
/** the lit upper edge of the umbilical cable */
const CABLE_HI = '#463a3e';

/** Pixel clouds that tile every W cells: flat-bottomed puffs (a wide base plus round bumps on top),
 *  and optionally a lumpy deck hanging from the top edge. Lit from above, with a dithered underside. */
function cloudRects(W: number, specs: Cloud[], deck: number, seed: number): Rect[] {
  let s = seed;
  const rn = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const wrap = (x: number) => ((x % W) + W) % W;
  const cells = new Set<number>();
  const key = (x: number, y: number) => y * 4096 + wrap(x);
  const has = (x: number, y: number) => y >= 0 && cells.has(key(x, y));
  for (const [cx, by, w, h] of specs) {
    const nb = 2 + Math.floor(rn() * 3);
    const bumps = Array.from({ length: nb }, (_, i) => {
      const r = h * (0.42 + rn() * 0.3);
      return { x: cx - w * 0.32 + (w * 0.64 * (i + 0.5)) / nb + (rn() - 0.5) * 4, y: by - h * 0.35 - r * 0.45, r };
    });
    for (let y = Math.floor(by - h * 1.6); y <= by; y++)
      for (let x = Math.floor(cx - w / 2 - 2); x <= cx + w / 2 + 2; x++) {
        const base = ((x - cx) / (w / 2)) ** 2 + ((y - by) / (h * 0.5)) ** 2 <= 1;
        if (base || bumps.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r)) cells.add(key(x, y));
      }
  }
  if (deck) {
    const T = (Math.PI * 2) / W;
    for (let x = 0; x < W; x++) {
      const bottom = Math.round(deck + 3 * Math.sin(x * T * 5) + 2 * Math.sin(x * T * 13 + 1) + 1.5 * Math.sin(x * T * 29 + 2));
      for (let y = 0; y <= bottom; y++) cells.add(key(x, y));
    }
  }
  const out: Rect[] = [];
  for (const k of cells) {
    const x = k % 4096, y = (k - x) / 4096;
    let c = 'cl1';
    if (y > 0 && !has(x, y - 1)) c = 'cl2';
    else if (!has(x, y + 1)) c = 'cl3';
    else if (!has(x, y + 2) && (x + y) % 2 === 0) c = 'cl3';
    out.push({ x, y, w: 1, h: 1, c }, { x: x + W, y, w: 1, h: 1, c });
  }
  // merge runs on each row so the path stays small
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: Rect[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.y === r.y && last.c === r.c && last.x + last.w === r.x) last.w++;
    else merged.push({ ...r });
  }
  return merged;
}

export function buildHero(variant: 'wide' | 'narrow'): Hero {
  const f = FRAMES[variant];
  const { W, H, G } = f;
  let seed = 3;
  const rn = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  // sky: six bands with a one-pixel checker seam between each pair
  const skyR: Rect[] = [];
  const bands = 6, bandH = Math.ceil(G / bands);
  for (let i = 0; i < bands; i++) skyR.push({ x: 0, y: i * bandH, w: W, h: bandH, c: `s${i}` });
  for (let i = 1; i < bands; i++) {
    const y = i * bandH;
    for (let x = i % 2; x < W; x += 2) skyR.push({ x, y, w: 1, h: 1, c: `s${i - 1}` });
    for (let x = (i + 1) % 2; x < W; x += 2) skyR.push({ x, y: y - 1, w: 1, h: 1, c: `s${i}` });
  }
  const starR: Rect[] = [];
  for (let i = 0; i < f.stars; i++) {
    const x = Math.floor(rn() * W), y = Math.floor(rn() * f.starH);
    starR.push({ x, y, w: 1, h: 1, c: rn() > 0.8 ? 'star2' : 'star' });
  }
  const sunR: Rect[] = [];
  const { x: sx, y: sy, r: rad } = f.sun;
  for (let y = sy - rad; y < G; y++) {
    const dy = y - sy;
    if (dy * dy > rad * rad) continue;
    if (y === sy + 4 || y === sy + 9 || y === sy + 13 || y === sy + 16) continue; // the classic sliced sunset
    const half = Math.floor(Math.sqrt(rad * rad - dy * dy));
    sunR.push({ x: sx - half, y, w: half * 2 + 1, h: 1, c: y > sy - 5 ? 'sunB' : 'sunA' });
  }

  // city: two rows of blocks with a few lit windows
  const S: Rect[] = [];
  const R = (x: number, y: number, w: number, h: number, c: string) => S.push({ x, y, w, h, c });
  for (const [s, minH, maxH, color, lit] of f.cities) {
    seed = s;
    for (let x = 0; x < W;) {
      const w = 6 + Math.floor(rn() * 14), bh = minH + Math.floor(rn() * (maxH - minH));
      R(x, G - bh, w, bh, color);
      if (rn() > 0.6) R(x + Math.floor(w / 2), G - bh - 3, 1, 3, color);
      for (let wy = G - bh + 3; wy < G - 3; wy += 4)
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          const r = rn();
          if (r > 0.92) R(wx, wy, 1, 1, lit);
          else if (r > 0.85) R(wx, wy, 1, 1, '#2a1d1f');
        }
      x += w + (rn() > 0.7 ? 2 : 0);
    }
  }
  // power poles and sagging wires
  const [p1, p2] = f.poles;
  [p1, p2].forEach((px) => { R(px, G - 36, 2, 36, '#0c0a0b'); R(px - 6, G - 34, 14, 1, '#0c0a0b'); });
  ([[-5, 5], [0, 7], [6, 6]] as const).forEach(([dx, sag]) => {
    const y0 = G - 34, a = p1 + 1 + dx, b = p2 + 1 + dx;
    for (let x = 0; x < f.wireLen; x++) {
      const t = (x - a) / (b - a);
      const y = x < a ? y0 + (a - x) * 0.06 : x > b ? y0 + (x - b) * 0.08 : y0 + sag * 4 * t * (1 - t);
      R(x, Math.round(y), 1, 1, '#0c0a0b');
    }
  });
  // street
  R(0, G, W, H - G, '#151213');
  R(0, G, W, 1, '#2e2a2c');
  for (let x = 4; x < W; x += 14) R(x, G + 5, 6, 1, '#2a2426');

  // The mech: feet on the street. The cable plugs in at its socket (best out of sight behind the body),
  // hangs from there as a heavy cable does, in a catenary that flattens out
  // as it reaches the street, then lies along the street off to the left, to the power supply off screen.
  // It is drawn thick, with a lit upper edge, so it reads as a rubber cable against the sky, the city and the street.
  const M = persona.mech;
  const unitSprite = SPRITES.mech;
  const mh = spriteSize(unitSprite).h, K = mh === MECH_ROWS ? f.K : (f.K * MECH_ROWS) / mh, ux = f.ux, uy = G + 9 - Math.round(M.feet * K);
  const T = Math.max(2, Math.round(2.4 * K)); // thickness, in cells
  const lie = G + 1;                          // the cable's top row where it rests on the street
  const ax = ux + M.socket[0] * K, ay = uy + M.socket[1] * K; // the socket
  const h = lie - ay, d = h * 1.2;            // drop, and how far out it touches down
  // y = lie - a (cosh((x - xT) / a) - 1): flat at the touchdown xT, and through the socket
  let lo = d / 40, hi = d * 40;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (m * (Math.cosh(d / m) - 1) > h) lo = m; else hi = m; }
  const ca = (lo + hi) / 2, xT = ax - d;
  const hang = (x: number) => lie - ca * (Math.cosh((x - xT) / ca) - 1);
  /** a cable of thickness T over cells: the body, plus the top cell of each column as its lit edge */
  const cableRects = (cells: Set<string>) => {
    const top = new Map<number, number>();
    const body: Rect[] = [];
    for (const k of cells) {
      const [x, y] = k.split(',').map(Number);
      body.push({ x, y, w: 1, h: 1, c: SHADOW });
      if (!top.has(x) || y < top.get(x)!) top.set(x, y);
    }
    return { body, hi: [...top].map(([x, y]) => ({ x, y, w: 1, h: 1, c: CABLE_HI })) };
  };
  const lay = (cells: Set<string>, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) for (let j = 0; j < T; j++) cells.add(`${x},${lie + j}`);
  };
  const on = new Set<string>();
  for (let x = ax; x >= xT; x -= 0.1) {
    const cx = Math.round(x), cy = Math.round(hang(x));
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) on.add(`${cx + i},${cy + j}`);
  }
  lay(on, 0, Math.round(xT));
  // the click path: along the hanging part, then a stretch of the part on the street
  const cable: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const x = ax - (d * i) / 12; cable.push([x, hang(x) + T / 2]); }
  cable.push([Math.max(0, xT - d), lie + T / 2]);
  // unplugged: it lies along the street, the plug end a little thicker, where the pilot can reach it
  const looseEnd = Math.min(ux + 4, Math.round(xT + d * 0.6));
  const off = new Set<string>();
  lay(off, 0, looseEnd - 1);
  for (let i = 0; i <= T; i++) for (let j = -1; j < T; j++) off.add(`${looseEnd + i},${lie + j}`);
  const plugged = cableRects(on), loose = cableRects(off);
  R(ux + Math.round(M.shadows.front[0] * K), G + 10, Math.round(M.shadows.front[1] * K), 1, SHADOW);
  R(ux + Math.round(M.shadows.rear[0] * K), G + f.rearShadowY, Math.round(M.shadows.rear[1] * K), 1, SHADOW);
  const eye = M.eyes.char, eyeMax = M.eyes.maxX ?? Infinity;
  const unitR = spriteRects(unitSprite, ux, uy, K, unitSprite.rows, { [eye]: 'eye' });
  // the eyes on the face (cells in the eye colour, left of maxX)
  const face: { x: number; y: number }[] = [];
  unitSprite.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === eye && x < eyeMax) face.push({ x, y }); }));
  const mid = face.length ? face.reduce((a, p) => a + p.x, 0) / face.length : 0;
  const eyeD = (pts: typeof face, grow = 0) =>
    toLayers(pts.map((p) => ({ x: ux + (p.x - grow) * K, y: uy + (p.y - grow) * K, w: (1 + 2 * grow) * K, h: (1 + 2 * grow) * K, c: 'e' })))[0]?.d ?? '';

  // the pilot: at 25 cells tall against a mech of 99, one third the cell size
  const P = SPRITES.pilot;
  const pk = P.rows.length === PILOT_ROWS ? f.pk : (f.pk * PILOT_ROWS) / P.rows.length, pxx = ux + f.pdx, pyy = G + f.pBase - P.rows.length * pk;
  R(pxx - 1, G + f.pBase, f.pShadow, 1, SHADOW);
  const pilotR = spriteRects(P, 0, 0, 1); // drawn in its own cells; the page places and scales it

  const cableHit = cable.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const cols = Math.max(...unitSprite.rows.map((r) => r.length));

  return {
    W, H,
    sky: toLayers(skyR),
    stars: toLayers(starR),
    sun: toLayers(sunR),
    clouds: { a: toLayers(cloudRects(W, f.cloudsA, 0, 11)), b: toLayers(cloudRects(W, f.cloudsB, f.deck, 29)) },
    title: f.title,
    scene: toLayers(S),
    unit: toLayers(unitR),
    pilot: toLayers(pilotR),
    cable: toLayers(plugged.body)[0].d,
    cableHi: toLayers(plugged.hi)[0].d,
    cableLoose: toLayers(loose.body)[0].d,
    cableLooseHi: toLayers(loose.hi)[0].d,
    cableHit,
    rope: { ax, ay, lie, T, xA: Math.max(0, Math.round(xT - d)), xT, ca },
    walk: { min: Math.round(W * 0.03), max: ux + 4, home: pxx, y: pyy, plug: looseEnd, k: pk, w: P.rows[0].length * pk },
    unitBox: { x: ux, y: uy, w: cols * K, h: unitSprite.rows.length * K },
    eyeFx: { l: eyeD(face.filter((p) => p.x < mid)), r: eyeD(face.filter((p) => p.x > mid)), halo: eyeD(face, 1), k: K },
  };
}
