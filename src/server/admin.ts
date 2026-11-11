// The admin contract, shared by every project the superadmin manages.
// The superadmin stores only base URLs; everything else it learns from GET /admin/manifest.
// Paths carry no version. If the contract ever changes shape, CONTRACT goes up and the manifest says so.

import persona from '@persona';
import pkg from '../../package.json';
import { whoIsCalling } from './access';
import { COLLECTIONS, byId, type Collection, type Field } from './collections';
import { audit, ensureSchema, newId } from './db';
import { HttpError, fail, json } from './http';
import { NAMES, refresh, type Name } from './live';
import { purgePage } from './page-cache';

export const CONTRACT = 1;

const ACTIONS = [
  { id: 'refresh-github', label: 'Refresh GitHub data now' },
  { id: 'refresh-weather', label: 'Refresh the weather now' },
  { id: 'refresh-all', label: 'Refresh every live source now (GitHub, weather, apps, social cards)' },
  { id: 'reset-counter', label: 'Reset a counter', input: [{ key: 'name', label: 'Counter', type: 'enum', options: ['visits', 'pets'], required: true }] },
];

const STATS = [
  { id: 'visits', label: 'Visits' },
  { id: 'pets', label: 'Pets' },
  { id: 'missions', label: 'Projects' },
  { id: 'milestones', label: 'Milestones' },
];

export async function handleAdmin(req: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  try {
    const actor = await whoIsCalling(req, env);
    await ensureSchema(env.DB);
    const parts = path.split('/').filter(Boolean).slice(1); // drop "admin"
    const [head, a, b] = parts;
    const m = req.method;

    if (m === 'GET' && head === 'manifest' && !a) return json(manifest(req));
    if (m === 'GET' && head === 'health' && !a) return json(await health(env));
    if (m === 'GET' && head === 'stats' && !a) return json(await stats(env));
    if (m === 'GET' && head === 'audit' && !a) return json(await auditList(env, new URL(req.url)));
    if (head === 'actions' && a && !b && m === 'POST') return json(await action(env, ctx, actor, a, req));
    if (head === 'c' && a) {
      const col = byId(a);
      if (!col) throw new HttpError('not_found', `No collection "${a}"`);
      if (!b && m === 'GET') return json(await list(env, col, new URL(req.url)));
      if (!b && m === 'POST') return json(await create(env, ctx, actor, col, await body(req)), { status: 201 });
      if (b && m === 'GET') return json(await getRow(env, col, b));
      if (b && m === 'PATCH') return json(await update(env, ctx, actor, col, b, req.headers.get('if-match'), await body(req)));
      if (b && m === 'DELETE') {
        await remove(env, ctx, actor, col, b, req.headers.get('if-match'));
        return new Response(null, { status: 204 });
      }
    }
    throw new HttpError('not_found', `No ${m} ${path}`);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.code, e.message);
    console.error(e);
    return fail('internal', e instanceof Error ? e.message : 'Something went wrong');
  }
}

function manifest(req: Request) {
  const origin = new URL(req.url).origin;
  return {
    contract: CONTRACT,
    project: { id: persona.storageKey, name: persona.name, url: origin, version: pkg.version, kind: 'cloudflare-worker' },
    housekeeping: {
      id: 'Assigned by the project',
      sort: 'Integer, lower first',
      visible: 'Boolean; hidden rows stay in the admin but leave the page',
      updated_at: 'ISO time; send it back as If-Match on PATCH and DELETE',
      updated_by: 'Set from the caller identity',
    },
    collections: COLLECTIONS,
    actions: ACTIONS,
    stats: STATS,
  };
}

async function health(env: Env) {
  const started = Date.now();
  let d1 = true;
  try { await env.DB.prepare('SELECT 1').first(); } catch { d1 = false; }
  const snaps = (await env.DB.prepare(`SELECT name, fetched_at, error FROM snapshots`).all<{ name: string; fetched_at: string; error: string | null }>()).results;
  const ok = d1 && snaps.every((s) => !s.error);
  return { ok, contract: CONTRACT, version: pkg.version, d1, d1Ms: Date.now() - started, upstream: snaps };
}

async function stats(env: Env) {
  const [counters, missions, milestones] = await env.DB.batch([
    env.DB.prepare(`SELECT name, value FROM counters`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM missions`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM milestones`),
  ]);
  const out: Record<string, number> = {};
  for (const r of counters.results as { name: string; value: number }[]) out[r.name] = r.value;
  out.missions = (missions.results[0] as { n: number }).n;
  out.milestones = (milestones.results[0] as { n: number }).n;
  return { stats: STATS.map((s) => ({ ...s, value: out[s.id] ?? 0 })) };
}

// ---------------------------------------------------------------- rows

const shape = (col: Collection, r: Record<string, unknown>) => {
  const out: Record<string, unknown> = { id: r.id, sort: r.sort, visible: r.visible === 1, updated_at: r.updated_at, updated_by: r.updated_by };
  for (const f of col.fields) out[f.key] = f.type === 'bool' ? r[f.key] === 1 : r[f.key] ?? null;
  return out;
};

async function list(env: Env, col: Collection, url: URL) {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
  const rows = (await env.DB.prepare(`SELECT * FROM "${col.id}" ORDER BY ${col.order} LIMIT ? OFFSET ?`).bind(limit + 1, offset).all()).results;
  const more = rows.length > limit;
  return { items: rows.slice(0, limit).map((r) => shape(col, r)), next_cursor: more ? String(offset + limit) : null };
}

async function getRow(env: Env, col: Collection, id: string) {
  const r = await env.DB.prepare(`SELECT * FROM "${col.id}" WHERE id = ?`).bind(id).first();
  if (!r) throw new HttpError('not_found', `No ${col.id} row ${id}`);
  return shape(col, r);
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError('bad_request', 'Body must be a JSON object');
  }
}

function check(f: Field, v: unknown): string | number | null {
  if (v === null || v === undefined || v === '') {
    if (f.required) throw new HttpError('bad_request', `${f.key} is required`);
    return null;
  }
  const bad = (why: string) => new HttpError('bad_request', `${f.key}: ${why}`);
  switch (f.type) {
    case 'text':
    case 'longtext': {
      if (typeof v !== 'string') throw bad('must be text');
      const s = v.trim();
      if (f.max && s.length > f.max) throw bad(`at most ${f.max} characters`);
      return s;
    }
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('must be a number');
      return v;
    case 'bool':
      if (typeof v !== 'boolean') throw bad('must be true or false');
      return v ? 1 : 0;
    case 'date':
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad('must be YYYY-MM-DD');
      return v;
    case 'url':
    case 'image': {
      if (typeof v !== 'string' || v.length > 500) throw bad('must be a URL');
      const ok = f.type === 'url' ? /^(https?:\/\/|mailto:)/i : /^https?:\/\//i;
      if (!ok.test(v)) throw bad(f.type === 'url' ? 'must start with https://, http:// or mailto:' : 'must start with https://');
      return v;
    }
    case 'enum':
      if (typeof v !== 'string' || !f.options?.includes(v)) throw bad(`must be one of ${f.options?.join(', ')}`);
      return v;
  }
}

function values(col: Collection, input: Record<string, unknown>, creating: boolean) {
  const out: Record<string, string | number | null> = {};
  for (const f of col.fields) {
    if (!creating && !(f.key in input)) continue;
    out[f.key] = check(f, input[f.key]);
  }
  if ('sort' in input) {
    if (!Number.isInteger(input.sort)) throw new HttpError('bad_request', 'sort must be an integer');
    out.sort = input.sort as number;
  }
  if ('visible' in input) {
    if (typeof input.visible !== 'boolean') throw new HttpError('bad_request', 'visible must be true or false');
    out.visible = input.visible ? 1 : 0;
  }
  const known = new Set([...col.fields.map((f) => f.key), 'sort', 'visible', 'id', 'updated_at', 'updated_by']);
  const extra = Object.keys(input).filter((k) => !known.has(k));
  if (extra.length) throw new HttpError('bad_request', `Unknown field: ${extra.join(', ')}`);
  return out;
}

const unique = (e: unknown) => e instanceof Error && /UNIQUE/i.test(e.message);

async function create(env: Env, ctx: ExecutionContext, actor: string, col: Collection, input: Record<string, unknown>) {
  if (col.limit) {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM "${col.id}"`).first<{ n: number }>();
    if ((n?.n ?? 0) >= col.limit) throw new HttpError('bad_request', `${col.label} holds at most ${col.limit} rows`);
  }
  const v = values(col, input, true);
  const id = newId();
  const now = new Date().toISOString();
  const row: Record<string, string | number | null> = { id, updated_at: now, updated_by: actor, ...v };
  const keys = Object.keys(row);
  try {
    await env.DB.prepare(`INSERT INTO "${col.id}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .bind(...keys.map((k) => row[k]))
      .run();
  } catch (e) {
    if (unique(e)) throw new HttpError('conflict', `That ${col.fields[0].key} already exists`);
    throw e;
  }
  const after = await getRow(env, col, id);
  await audit(env.DB, { actor, action: 'create', tbl: col.id, row_id: id, after });
  ctx.waitUntil(purgePage());
  return after;
}

async function update(env: Env, ctx: ExecutionContext, actor: string, col: Collection, id: string, ifMatch: string | null, input: Record<string, unknown>) {
  if (!ifMatch) throw new HttpError('bad_request', 'If-Match (the row’s updated_at) is required');
  const before = await getRow(env, col, id);
  const v = values(col, input, false);
  const now = new Date().toISOString();
  const sets = { ...v, updated_at: now, updated_by: actor };
  const keys = Object.keys(sets);
  const res = await env.DB.prepare(`UPDATE "${col.id}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ? AND updated_at = ?`)
    .bind(...keys.map((k) => (sets as Record<string, unknown>)[k] as string | number | null), id, unquote(ifMatch))
    .run()
    .catch((e) => {
      if (unique(e)) throw new HttpError('conflict', `That ${col.fields[0].key} already exists`);
      throw e;
    });
  if (!res.meta.changes) throw new HttpError('conflict', 'The row changed since you read it. Read it again and retry.');
  const after = await getRow(env, col, id);
  await audit(env.DB, { actor, action: 'update', tbl: col.id, row_id: id, before, after });
  ctx.waitUntil(purgePage());
  return after;
}

async function remove(env: Env, ctx: ExecutionContext, actor: string, col: Collection, id: string, ifMatch: string | null) {
  if (!ifMatch) throw new HttpError('bad_request', 'If-Match (the row’s updated_at) is required');
  const before = await getRow(env, col, id);
  const res = await env.DB.prepare(`DELETE FROM "${col.id}" WHERE id = ? AND updated_at = ?`).bind(id, unquote(ifMatch)).run();
  if (!res.meta.changes) throw new HttpError('conflict', 'The row changed since you read it. Read it again and retry.');
  await audit(env.DB, { actor, action: 'delete', tbl: col.id, row_id: id, before });
  ctx.waitUntil(purgePage());
}

const unquote = (s: string) => s.replace(/^W\//, '').replace(/^"|"$/g, '');

// ---------------------------------------------------------------- actions and audit

async function action(env: Env, ctx: ExecutionContext, actor: string, name: string, req: Request) {
  if (name === 'refresh-all') {
    await Promise.all(NAMES.map((n) => refresh(env, n)));
    const snaps = (await env.DB.prepare(`SELECT name, fetched_at, error FROM snapshots`).all<{ name: string; fetched_at: string; error: string | null }>()).results;
    await audit(env.DB, { actor, action: name });
    ctx.waitUntil(purgePage());
    return { ok: snaps.every((s) => !s.error), snapshots: snaps };
  }
  if (name.startsWith('refresh-') && NAMES.includes(name.slice(8) as Name)) {
    await refresh(env, name.slice(8) as Name);
    const s = await env.DB.prepare(`SELECT fetched_at, error FROM snapshots WHERE name = ?`).bind(name.slice(8)).first();
    await audit(env.DB, { actor, action: name });
    ctx.waitUntil(purgePage());
    return { ok: !(s as { error: string | null } | null)?.error, snapshot: s };
  }
  if (name === 'reset-counter') {
    const b = await body(req);
    if (b.name !== 'visits' && b.name !== 'pets') throw new HttpError('bad_request', 'name must be visits or pets');
    const before = await env.DB.prepare(`SELECT value FROM counters WHERE name = ?`).bind(b.name).first<{ value: number }>();
    await env.DB.prepare(`UPDATE counters SET value = 0 WHERE name = ?`).bind(b.name).run();
    await audit(env.DB, { actor, action: name, tbl: 'counters', row_id: b.name, before, after: { value: 0 } });
    ctx.waitUntil(purgePage());
    return { ok: true };
  }
  throw new HttpError('not_found', `No action "${name}"`);
}

async function auditList(env: Env, url: URL) {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  const before = Number(url.searchParams.get('cursor')) || Number.MAX_SAFE_INTEGER;
  const rows = (await env.DB.prepare(`SELECT * FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?`).bind(before, limit).all<Record<string, unknown>>()).results;
  const items = rows.map((r) => ({ ...r, before: r.before ? JSON.parse(String(r.before)) : null, after: r.after ? JSON.parse(String(r.after)) : null }));
  return { items, next_cursor: rows.length === limit ? String(rows.at(-1)!.id) : null };
}
