// Which persona the site is built with: the PERSONA environment variable if set (a folder name in persona/),
// otherwise the only folder in persona/ that is not `example`, otherwise `example`.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function personaDir(root = 'persona') {
  const has = (n) => existsSync(join(root, n, 'index.ts'));
  const pick = process.env.PERSONA?.trim();
  if (pick) {
    if (!has(pick)) throw new Error(`PERSONA=${pick}, but ${root}/${pick}/index.ts does not exist`);
    return `${root}/${pick}`;
  }
  const own = readdirSync(root).filter((n) => n !== 'example' && statSync(join(root, n)).isDirectory() && has(n));
  if (own.length > 1) throw new Error(`More than one persona in ${root}/ (${own.join(', ')}). Set PERSONA to pick one.`);
  if (own.length === 1) return `${root}/${own[0]}`;
  if (has('example')) return `${root}/example`;
  throw new Error(`No persona found. Add ${root}/<name>/index.ts (see PERSONA.md).`);
}
