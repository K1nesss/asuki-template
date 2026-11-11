// The homepage is rendered at most once a minute per data centre, and any admin write clears it.
// (The Cache API does nothing on *.workers.dev, so there every request renders; that's fine.)
//
// Each cached copy carries an ETag, a fingerprint of the page. A browser that comes back sends it in
// If-None-Match; if the page is still the same it gets a bodiless 304 and shows the copy it already has, instead
// of downloading the whole page again. A changed page has a new fingerprint, so it is always sent in full.
// The fingerprint is made after the page has gone out (the first visitor never waits for it), which is why a
// freshly rendered page has none and a cached one does.
import { edgeCache } from './http';

const KEY = 'https://page-cache.site.internal/';
const TTL = 60;

export async function cachedPage(req: Request, render: () => Promise<Response>, ctx: ExecutionContext): Promise<Response> {
  const cache = edgeCache();
  const key = new Request(KEY);
  const hit = await cache.match(key);
  if (hit) return notModified(req, hit) ?? withBrowserCache(hit, 'HIT');
  const res = await render();
  if (res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html')) {
    const copy = res.clone();
    ctx.waitUntil((async () => {
      const body = await copy.arrayBuffer();
      const headers = new Headers(copy.headers);
      headers.set('cache-control', `public, max-age=${TTL}`);
      headers.set('etag', await fingerprint(body));
      headers.delete('set-cookie');
      await cache.put(key, new Response(body, { status: 200, headers }));
    })());
  }
  return withBrowserCache(res, 'MISS');
}

function withBrowserCache(res: Response, state: string) {
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  out.headers.set('x-page-cache', state);
  return out;
}

/** a 304 when the browser already holds this exact page */
function notModified(req: Request, page: Response): Response | null {
  const etag = page.headers.get('etag');
  const sent = req.headers.get('if-none-match');
  if (!etag || !sent) return null;
  // compared loosely: Cloudflare marks an ETag weak (W/"…") when it compresses the page on the way out
  const bare = (t: string) => t.trim().replace(/^W\//, '');
  if (!sent.split(',').some((t) => bare(t) === bare(etag) || t.trim() === '*')) return null;
  return new Response(null, {
    status: 304,
    headers: { etag, 'cache-control': 'public, max-age=0, must-revalidate', 'x-page-cache': 'HIT' },
  });
}

async function fingerprint(body: ArrayBuffer) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return `"${[...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')}"`;
}

export async function purgePage() {
  await edgeCache().delete(new Request(KEY));
}
