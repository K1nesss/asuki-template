// npm run check: reads the persona in use and says, in plain words, what is missing, the wrong size or
// out of bounds, before anything is built. `npm run build` runs it first. Exit code 1 on any error.
// It loads the persona through Vite, with the same @persona and @site paths the build uses.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { personaDir } from './persona-dir.mjs';

const dir = personaDir();
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const PET_FRAMES = ['idle', 'blink', 'happy', 'angry', 'surprised', 'lookUp', 'back', 'side', 'sideA', 'sideB', 'sideC', 'stompA', 'stompC', 'throwA', 'throwB', 'throwC'];
const PILOT_FRAMES = ['p_idle', 'p_walk1', 'p_walk2', 'p_up', 'p_back'];
const ASSET_MAX = 25 * 1024 * 1024; // Cloudflare's limit for one static file

const vite = await createServer({
  configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom',
  resolve: { alias: { '@persona': join(process.cwd(), dir), '@site': join(process.cwd(), 'src') } },
  define: { 'import.meta.env.SSR': 'true' },
});
let persona, content, COLLECTIONS;
try {
  persona = (await vite.ssrLoadModule('@persona')).default;
  content = (await vite.ssrLoadModule('@persona/content')).default;
  ({ COLLECTIONS } = await vite.ssrLoadModule('@site/server/collections.ts'));
} catch (e) {
  console.error(`\n✗ ${dir} does not load: ${e.message}\n`);
  await vite.close();
  process.exit(1);
}
await vite.close();

const size = (s) => ({ w: Math.max(0, ...s.rows.map((r) => r.length)), h: s.rows.length });

function sprite(label, s) {
  if (!s || !Array.isArray(s.rows) || !s.rows.length || typeof s.map !== 'object') return err(`${label}: needs { rows: string[], map: { letter: '#hex' } }`), null;
  const h = s.rows.length;
  // the width most rows have; the odd ones out are reported together
  const counts = new Map();
  s.rows.forEach((r) => counts.set(r.length, (counts.get(r.length) ?? 0) + 1));
  const w = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const odd = s.rows.map((r, y) => [y, r.length]).filter(([, n]) => n !== w);
  if (odd.length) err(`${label}: every row must be ${w} cells wide (pad with '.'), but ${odd.slice(0, 6).map(([y, n]) => `row ${y} is ${n}`).join(', ')}${odd.length > 6 ? ` and ${odd.length - 6} more` : ''}`);
  for (const [k, v] of Object.entries(s.map)) {
    if (k.length !== 1 || k === '.') err(`${label}: map key "${k}" must be one character, not '.'`);
    if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(String(v))) err(`${label}: colour "${k}": "${v}" is not a #rrggbb hex colour`);
  }
  rowsUse(label, s.rows, s.map);
  return { w, h };
}
function rowsUse(label, rows, map) {
  const unknown = new Set();
  rows.forEach((r) => [...r].forEach((c) => { if (c !== '.' && !(c in map)) unknown.add(c); }));
  if (unknown.size) err(`${label}: uses ${[...unknown].map((c) => `"${c}"`).join(', ')}, which the map does not define`);
}
function frames(label, f, s, sz, known) {
  if (!f || typeof f !== 'object') return err(`${label}: frames must be an object of name -> rows`);
  for (const [n, rows] of Object.entries(f)) {
    if (!known.includes(n)) warn(`${label}: "${n}" is not a pose the framework uses (${known.join(', ')})`);
    if (!Array.isArray(rows)) { err(`${label}.${n}: must be an array of rows`); continue; }
    if (rows.length !== sz.h || rows.some((r) => r.length !== sz.w)) err(`${label}.${n}: must be ${sz.w} x ${sz.h} cells like the sprite`);
    rowsUse(`${label}.${n}`, rows, s.map);
  }
  const missing = known.filter((n) => !(n in f) && n !== 'idle' && n !== 'p_idle');
  if (missing.length) warn(`${label}: no ${missing.join(', ')}; they fall back to a near pose (fine, just less lively)`);
}
const inside = (label, [x, y], sz) => { if (!(x >= 0 && x < sz.w && y >= 0 && y < sz.h)) err(`${label} [${x}, ${y}] is outside the ${sz.w} x ${sz.h} sprite`); };
const pub = (p) => join(dir, 'public', p.replace(/^\//, ''));
function file(label, p) {
  if (!p) return;
  const f = pub(p);
  if (!existsSync(f)) return err(`${label}: ${p} is not in ${dir}/public/`);
  if (statSync(f).size > ASSET_MAX) err(`${label}: ${p} is over 25 MiB, Cloudflare's limit for one file`);
}

// ---- the persona
const P = persona ?? {};
for (const k of ['name', 'title', 'url', 'storageKey']) if (!P[k] || typeof P[k] !== 'string') err(`${k}: missing`);
if (P.storageKey && !/^[a-z0-9-]+$/.test(P.storageKey)) err(`storageKey: use lowercase letters, digits and dashes only`);
if (P.url && !/^https?:\/\//.test(P.url)) err(`url: should start with https://`);
if (P.title && P.title.length > 8) warn(`title: "${P.title}" is long; the banner fits about 6 letters`);

const m = P.mech ?? err('mech: missing');
if (m) {
  const sz = sprite('mech.sprite', m.sprite);
  if (sz) {
    if (!(m.feet > 0 && m.feet <= sz.h)) err(`mech.feet: ${m.feet} must be a row of the sprite (1 to ${sz.h})`);
    if (m.socket) inside('mech.socket', m.socket, sz); else err('mech.socket: missing');
    for (const k of ['front', 'rear']) if (!m.shadows?.[k]) err(`mech.shadows.${k}: missing [x, width]`);
    if (!m.eyes?.char) err('mech.eyes.char: missing');
    else if (!m.sprite.rows.some((r) => r.includes(m.eyes.char))) warn(`mech.eyes: no cell in the sprite uses "${m.eyes.char}", so it has no eyes to light`);
    if (!m.name) err('mech.name: missing');
  }
}
const pl = P.pilot ?? err('pilot: missing');
if (pl) { const sz = sprite('pilot.sprite', pl.sprite); if (sz) frames('pilot.frames', pl.frames ?? {}, pl.sprite, sz, PILOT_FRAMES); }

const pet = P.pet ?? err('pet: missing');
if (pet) {
  const sz = sprite('pet.sprite', pet.sprite);
  if (sz) {
    frames('pet.frames', pet.frames ?? {}, pet.sprite, sz, PET_FRAMES);
    for (const [k, v] of Object.entries(pet.hands ?? {})) inside(`pet.hands.${k}`, v, sz);
    if (pet.head && !(pet.head.rows > 0 && pet.head.rows <= sz.h)) err(`pet.head.rows: ${pet.head.rows} must be 1 to ${sz.h}`);
    if (sz.h > 110 || sz.w > 80) warn(`pet.sprite: ${sz.w} x ${sz.h} is large for the footer (Asuki's is 52 x 71)`);
  }
  for (const k of ['angry', 'sulk', 'unsulk', 'doze', 'startle', 'cheer', 'refuse', 'fallback']) if (typeof pet.lines?.[k] !== 'string') err(`pet.lines.${k}: missing`);
  if (!Array.isArray(pet.lines?.take) || !pet.lines.take.length) err('pet.lines.take: needs at least one line');
}
if (P.prop) { const sz = sprite('prop.sprite', P.prop.sprite); if (sz && sz.w < sz.h * 3) warn('prop.sprite: it flies like a javelin, so make it long and thin, head to the right'); }

file('avatarBack', P.avatarBack);
if (P.track) {
  const t = P.track;
  const name = /^\/media\/([a-z0-9-]+\.mp3)$/.exec(t.src ?? '')?.[1];
  if (!name) err('track.src: must be /media/<file>.mp3 (lowercase letters, digits and dashes), for public/music/<file>.mp3');
  else file('track.src', `/music/${name}`);
  if (!/^[0-9]{256}$/.test(t.peaks ?? '')) err('track.peaks: must be 256 digits 0-9 (npm run peaks -- <file.mp3> makes it)');
  if (!(t.duration > 0)) err('track.duration: seconds, more than 0');
}
for (const [cue, p] of Object.entries(P.sfx ?? {})) file(`sfx.${cue}`, p);
for (const k of ['panel', 'shield', 'cable', 'battery', 'engaged', 'internal', 'halted']) if (!P.words?.[k]) err(`words.${k}: missing`);
if (!existsSync(join(dir, 'theme.css'))) err(`theme.css: missing (it may be empty)`);
if (!existsSync(pub('favicon.svg'))) warn(`public/favicon.svg: missing, so the tab has no icon`);

// ---- the content
const seed = content?.seed ?? (err('content.ts: needs a default export { seed, migrations }'), {});
for (const [id, rows] of Object.entries(seed)) {
  const c = COLLECTIONS.find((x) => x.id === id);
  if (!c) { err(`content.seed.${id}: no such collection (${COLLECTIONS.map((x) => x.id).join(', ')})`); continue; }
  if (c.limit && rows.length > c.limit) err(`content.seed.${id}: ${rows.length} rows, at most ${c.limit}`);
  rows.forEach((r, i) => {
    for (const f of c.fields) {
      const v = r[f.key];
      if (f.required && (v === undefined || v === '')) err(`content.seed.${id}[${i}].${f.key}: required`);
      if (v === undefined) continue;
      if (f.max && String(v).length > f.max) err(`content.seed.${id}[${i}].${f.key}: ${String(v).length} characters, at most ${f.max}`);
      if (f.options && !f.options.includes(String(v))) err(`content.seed.${id}[${i}].${f.key}: "${v}" is not one of ${f.options.join(', ')}`);
    }
    for (const k of Object.keys(r)) if (!c.fields.some((f) => f.key === k)) err(`content.seed.${id}[${i}]: no field "${k}"`);
    for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && v.includes("'")) err(`content.seed.${id}[${i}].${k}: use ’ instead of ' (the seed is written as SQL)`);
  });
}

const out = [`persona: ${dir}`];
for (const w of warnings) out.push(`  ! ${w}`);
for (const e of errors) out.push(`  ✗ ${e}`);
out.push(errors.length ? `\n${errors.length} problem(s) to fix.` : `  ✓ looks good${warnings.length ? ` (${warnings.length} note(s))` : ''}`);
console.log(out.join('\n'));
process.exit(errors.length ? 1 : 0);
