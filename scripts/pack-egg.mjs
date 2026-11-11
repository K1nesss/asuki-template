// Runs after `astro build` (npm run build). An Easter egg's 3D files (.vrm/.vrma) can be large (a VRoid model and its motions can be 23 MB, about
// 13 MB compressed). Cloudflare only compresses file types it knows, and .vrm/.vrma are not among them, so the
// build compresses them itself: each file is stored brotli- and gzip-compressed next to where it was, and the
// original is left out of the upload. Requests for /egg/* then reach the Worker (src/server/egg.ts), which
// sends the copy the browser can unpack. Unpacked, it is the original file byte for byte: the model is never
// changed (its licence forbids that), only packed for the trip.
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const ROOT = 'dist/client/egg';
const brotli = promisify(zlib.brotliCompress), gzip = promisify(zlib.gzip);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let files;
try { files = walk(ROOT).filter((p) => /\.(vrm|vrma)$/.test(p)); } catch { files = []; }
if (!files.length) { console.log('[pack-egg] nothing to pack'); process.exit(0); }

const t0 = Date.now();
let raw = 0, packed = 0;
await Promise.all(files.map(async (p) => {
  const buf = readFileSync(p);
  const [br, gz] = await Promise.all([
    brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
    gzip(buf, { level: 9 }),
  ]);
  // never ship a copy that does not unpack to the original
  if (!zlib.brotliDecompressSync(br).equals(buf) || !zlib.gunzipSync(gz).equals(buf)) throw new Error(`[pack-egg] ${p}: round trip failed`);
  writeFileSync(p + '.br', br);
  writeFileSync(p + '.gz', gz);
  unlinkSync(p);
  raw += buf.length; packed += br.length;
}));
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`[pack-egg] ${files.length} files, ${mb(raw)} MB -> ${mb(packed)} MB brotli, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
