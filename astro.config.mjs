// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { fileURLToPath } from 'node:url';
import { eggVersion } from './scripts/egg-version.mjs';
import { personaDir } from './scripts/persona-dir.mjs';

// The persona: everything that makes the site someone's (persona/<name>/). See PERSONA.md.
const persona = personaDir();
const at = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  output: 'server',
  // No Astro sessions: nothing on this site needs them, and they would add a KV namespace.
  session: false,
  adapter: cloudflare({ imageService: 'passthrough' }),
  build: { inlineStylesheets: 'always' },
  // the persona's pictures, music and sounds are the site's static files
  publicDir: at(`./${persona}/public`),
  vite: {
    resolve: { alias: { '@persona': at(`./${persona}`), '@site': at('./src') } },
    // An Easter egg can be one big lazy chunk (a 3D one with three.js is ~770 kB, ~200 kB gzipped), loaded only when opened.
    build: { chunkSizeWarningLimit: 900 },
    // __EGG_V__: a hash of the egg's 3D files, so their addresses change whenever the files do.
    define: { __EGG_V__: JSON.stringify(eggVersion(`${persona}/public/egg`)) },
  },
});
