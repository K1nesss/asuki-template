// Music, with byte ranges. Browsers fetch audio in pieces to seek (Safari will not play it at all
// without them), and a static asset may answer a Range request with the whole file. So /media/<name>
// asks the static files for public/music/<name> and, if they ignored the range, cuts it out here.
import { fail } from './http';

type WithAssets = Env & { ASSETS: { fetch: typeof fetch } };

export async function media(req: Request, env: Env, path: string): Promise<Response> {
  const name = path.slice('/media/'.length);
  if (!/^[a-z0-9-]+\.mp3$/.test(name) || (req.method !== 'GET' && req.method !== 'HEAD')) return fail('not_found', 'No such track');
  const range = req.headers.get('range');
  const src = await (env as WithAssets).ASSETS.fetch(new URL(`/music/${name}`, req.url), { headers: range ? { range } : {} });
  if (!src.ok) return fail('not_found', 'No such track');

  const headers = new Headers({
    'content-type': 'audio/mpeg',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=86400',
  });
  const etag = src.headers.get('etag');
  if (etag) headers.set('etag', etag);

  // the static files honoured the range themselves
  if (src.status === 206) {
    for (const h of ['content-range', 'content-length']) { const v = src.headers.get(h); if (v) headers.set(h, v); }
    return new Response(req.method === 'HEAD' ? null : src.body, { status: 206, headers });
  }

  const buf = await src.arrayBuffer();
  const size = buf.byteLength;
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    headers.set('content-length', String(size));
    return new Response(req.method === 'HEAD' ? null : buf, { status: 200, headers });
  }
  let start: number, end: number;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // the last N bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2])); }
  if (start >= size || start > end) {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(req.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers });
}
