// A hash of the Easter egg's 3D files (the persona's public/egg). The egg asks for them with ?v=<this> (astro.config.mjs),
// so a browser can keep them for a year and still gets new ones the moment a file changes.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function eggVersion(dir) {
  const h = createHash('sha256');
  const walk = (d, rel = '') => readdirSync(d).sort().forEach((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`);
    else if (/\.(vrm|vrma)$/.test(n)) h.update(rel + n).update(readFileSync(p));
  });
  try { walk(dir); } catch { return ''; }
  return h.digest('hex').slice(0, 10);
}
