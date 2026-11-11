// The public API: read-only, except two counters that can only go up by a little.

import { bump } from './db';
import { edgeCache, fail, json, visitorHash } from './http';
import { getSnapshot, type Github, type Weather, type Years } from './live';
import { getPageData } from './page-data';

// Best-effort per-isolate memory of recent pets, so one visitor can't spin the counter.
const lastPet = new Map<string, number>();

export async function handleApi(req: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  const method = req.method;

  if (method === 'GET' && path === '/api/now') {
    const d = await getPageData(env, ctx);
    return json(
      {
        status: d.content.status,
        location: d.location,
        time: d.time,
        phase: d.phase,
        ticker: d.ticker.map((t) => t.replace('{phase}', d.phaseLabel)),
        weather: d.weather,
        github: d.github && { total: d.github.total, commits30d: d.github.commits30d, syncRate: d.github.syncRate },
        counters: d.content.counters,
      },
      { cache: 60 },
    );
  }

  if (method === 'GET' && path === '/api/github') {
    const s = await getSnapshot<Github>(env, ctx, 'github');
    return s.data ? json({ ...s.data, fetchedAt: s.fetchedAt }, { cache: 600 }) : fail('not_found', s.error ?? 'No GitHub data yet');
  }

  if (method === 'GET' && path === '/api/years') {
    const s = await getSnapshot<Years>(env, ctx, 'years');
    return s.data ? json({ ...s.data, fetchedAt: s.fetchedAt }, { cache: 1800 }) : fail('not_found', s.error ?? 'No GitHub data yet');
  }

  if (method === 'GET' && path === '/api/weather') {
    const s = await getSnapshot<Weather>(env, ctx, 'weather');
    return s.data ? json({ ...s.data, location: env.LOCATION_LABEL, fetchedAt: s.fetchedAt }, { cache: 600 }) : fail('not_found', s.error ?? 'No weather yet');
  }

  if (method === 'POST' && path === '/api/visit') {
    // count each visitor once a day (Asia/Shanghai); the Cache API remembers who was seen
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE }).format(new Date());
    const hash = await visitorHash(req, env.VISIT_SALT || 'site', day);
    const key = new Request(`https://seen.site.internal/${day}/${hash}`);
    const cache = edgeCache();
    if (await cache.match(key)) {
      const row = await env.DB.prepare(`SELECT value FROM counters WHERE name = 'visits'`).first<{ value: number }>();
      return json({ visits: row?.value ?? 0, counted: false });
    }
    ctx.waitUntil(cache.put(key, new Response('1', { headers: { 'cache-control': 'max-age=86400' } })));
    return json({ visits: await bump(env.DB, 'visits'), counted: true });
  }

  if (method === 'POST' && path === '/api/pet') {
    const who = req.headers.get('cf-connecting-ip') ?? 'local';
    const now = Date.now();
    if (now - (lastPet.get(who) ?? 0) < 800) return fail('rate_limited', 'Easy. She needs a second.');
    lastPet.set(who, now);
    if (lastPet.size > 5000) lastPet.clear();
    let n = 1;
    try {
      const body = (await req.json()) as { n?: number };
      n = Math.max(1, Math.min(5, Math.floor(Number(body.n) || 1)));
    } catch {}
    return json({ pets: await bump(env.DB, 'pets', n) });
  }

  return fail('not_found', `No ${method} ${path}`);
}
