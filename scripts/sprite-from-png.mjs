// npm run sprite -- <base.png> [pose.png ...] --out persona/<name>/sprites/<sprite>
//
// Turns pixel art drawn at one image pixel per cell into the palette rows the site draws:
//   <sprite>.json         { rows, map } from the first image (the idle pose)
//   <sprite>-frames.json  { <pose>: rows } from the others, named after their files (blink.png -> "blink")
// All images share one colour map, so every pose must be the same size. Transparent pixels (alpha < 128)
// become '.'. Colours are matched exactly; keep the art to a small palette (at most 60 colours).
// Art drawn bigger than one pixel per cell (say 4x4 blocks)? Pass --cell 4.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const out = opt('--out');
const cell = Number(opt('--cell') ?? 1);
if (!out || !args.length) {
  console.error('usage: npm run sprite -- idle.png [blink.png side.png ...] --out persona/<name>/sprites/pet [--cell 4]');
  process.exit(1);
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const map = new Map(); // '#rrggbb' -> letter
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function rowsOf(file) {
  const png = PNG.sync.read(readFileSync(file));
  const w = Math.floor(png.width / cell), h = Math.floor(png.height / cell);
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = ((y * cell) * png.width + x * cell) * 4; // the top-left pixel of each cell
      const [r, g, b, a] = png.data.subarray(i, i + 4);
      if (a < 128) { row += '.'; continue; }
      const c = hex(r, g, b);
      if (!map.has(c)) {
        if (map.size >= LETTERS.length) throw new Error(`${file}: more than ${LETTERS.length} colours; reduce the palette first`);
        map.set(c, LETTERS[map.size]);
      }
      row += map.get(c);
    }
    rows.push(row);
  }
  return { rows, w, h };
}

const [first, ...rest] = args;
const base = rowsOf(first);
const frames = {};
for (const f of rest) {
  const r = rowsOf(f);
  if (r.w !== base.w || r.h !== base.h) throw new Error(`${f} is ${r.w} x ${r.h} cells; ${first} is ${base.w} x ${base.h}. Every pose must be the same size.`);
  frames[basename(f).replace(/\.png$/i, '')] = r.rows;
}
mkdirSync(dirname(out), { recursive: true });
const colours = Object.fromEntries([...map].map(([c, l]) => [l, c]));
writeFileSync(`${out}.json`, JSON.stringify({ rows: base.rows, map: colours }, null, 1) + '\n');
if (rest.length) writeFileSync(`${out}-frames.json`, JSON.stringify(frames, null, 1) + '\n');
console.log(`${out}.json: ${base.w} x ${base.h} cells, ${map.size} colours${rest.length ? `; ${rest.length} pose(s) in ${out}-frames.json` : ''}`);
