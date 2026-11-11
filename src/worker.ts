// The Worker's front door: the public API, the admin API, music with byte ranges, the Easter egg's packed files,
// the cached homepage,
// and the hourly cron.
// Everything else (static files, other pages) goes to Astro.
import { handle } from '@astrojs/cloudflare/handler';
import { handleAdmin } from './server/admin';
import { handleApi } from './server/api';
import { fail } from './server/http';
import { media } from './server/media';
import { eggFile } from './server/egg';
import { refresh } from './server/live';
import { cachedPage } from './server/page-cache';

const PAGES = new Set(['/projects', '/contributions', '/milestones', '/loadout']);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/api' || path.startsWith('/api/')) return await handleApi(req, env, ctx, path);
      if (path === '/admin' || path.startsWith('/admin/')) return await handleAdmin(req, env, ctx, path);
      if (path.startsWith('/media/')) return await media(req, env, path);
      if (path.startsWith('/egg/')) return await eggFile(req, env, path);
      if (path === '/' && req.method === 'GET' && !url.search) return await cachedPage(req, () => handle(req, env, ctx), ctx);
      // /projects, /contributions, /milestones, /loadout: the same page, which opens that view on load
      if (PAGES.has(path) && req.method === 'GET') {
        const home = new Request(new URL('/', url), req);
        return await cachedPage(home, () => handle(home, env, ctx), ctx);
      }
    } catch (e) {
      console.error(e);
      return fail('internal', 'Something went wrong');
    }
    return handle(req, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(Promise.all([refresh(env, 'github'), refresh(env, 'weather')]));
  },
} satisfies ExportedHandler<Env>;
