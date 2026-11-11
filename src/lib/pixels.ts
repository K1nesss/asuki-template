// Pixel art to SVG: every sprite and scene is a grid of cells, drawn as one <path> per colour,
// with runs of same-coloured cells on a row merged into one rectangle.

export interface Sprite {
  rows: string[];
  map: Record<string, string>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** a hex colour, or a class name for colours the page changes (sky, sun, eyes) */
  c: string;
}

export interface Layer {
  c: string;
  d: string;
}

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Groups rectangles by colour into path data, keeping first-seen colour order. */
export function toLayers(rects: Rect[]): Layer[] {
  const by = new Map<string, string[]>();
  for (const r of rects) {
    if (r.w <= 0 || r.h <= 0) continue;
    let list = by.get(r.c);
    if (!list) by.set(r.c, (list = []));
    list.push(`M${n(r.x)} ${n(r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z`);
  }
  return [...by].map(([c, parts]) => ({ c, d: parts.join('') }));
}

/** A sprite as rectangles at (x0, y0), `k` units per cell; same-colour runs on a row are merged. */
export function spriteRects(s: Sprite, x0 = 0, y0 = 0, k = 1, rows = s.rows, recolor?: Record<string, string>): Rect[] {
  const out: Rect[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const c = recolor?.[ch] ?? s.map[ch];
      if (c) out.push({ x: x0 + x * k, y: y0 + y * k, w: (end - x) * k, h: k, c });
      x = end;
    }
  });
  return out;
}

export const spriteLayers = (s: Sprite, rows?: string[]) => toLayers(spriteRects(s, 0, 0, 1, rows));
