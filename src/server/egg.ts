// An Easter egg's 3D model and motions (the persona's public/egg), sent compressed. The build stores each file brotli- and gzip-compressed and
// leaves the original out of the upload (scripts/pack-egg.mjs), so /egg/* comes here. This sends the copy the
// browser can unpack, and the browser unpacks it to the original bytes.
// The egg asks for the files with ?v=<hash of their contents> (astro.config.mjs), so a request with a version
// is kept for a year; a new model or motion gets a new hash, and with it a new address.
import { fail } from './http';

type WithAssets = Env & { ASSETS: { fetch: typeof fetch } };

export async function eggFile(req: Request, env: Env, path: string): Promise<Response> {
  if (!/^\/egg\/[a-z0-9_-]+(\/[a-z0-9_-]+)?\.(vrm|vrma)$/i.test(path) || (req.method !== 'GET' && req.method !== 'HEAD')) return fail('not_found', 'No such file');
  const accept = req.headers.get('accept-encoding') ?? '';
  const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
  const fwd = new Headers();
  const inm = req.headers.get('if-none-match');
  if (inm) fwd.set('if-none-match', inm);
  const src = await (env as WithAssets).ASSETS.fetch(new URL(`${path}.${enc === 'br' ? 'br' : 'gz'}`, req.url), { headers: fwd });
  if (src.status !== 200 && src.status !== 304) return fail('not_found', 'No such file');

  const headers = new Headers({
    'content-type': 'application/octet-stream',
    'cache-control': new URL(req.url).searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    vary: 'accept-encoding',
  });
  const etag = src.headers.get('etag');
  if (etag) headers.set('etag', etag);
  if (src.status === 304) return new Response(null, { status: 304, headers });
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers });
  // a browser that takes neither: unpack it here
  if (!enc) return new Response(src.body!.pipeThrough(new DecompressionStream('gzip')), { status: 200, headers });
  headers.set('content-encoding', enc);
  // 'manual': the body is already packed, so the runtime sends it as it is
  return new Response(src.body, { status: 200, headers, encodeBody: 'manual' });
}
