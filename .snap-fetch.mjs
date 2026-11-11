// One-off (not committed): runs the Worker's upstream fetches in Node, through the proxy, and prints SQL for local D1.
import { createServer } from 'vite';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import { readFileSync, writeFileSync } from 'node:fs';
const CANNED = process.env.CANNED ? JSON.parse(readFileSync(process.env.CANNED, "utf8")) : {};
globalThis.fetch = async (u, o) => { const k = String(u instanceof URL ? u.href : u.url ?? u); console.error("URL", k, o?.method ?? "GET", o?.body ? String(o.body).slice(0, 80) : ""); const c = CANNED[k]; if (!c) throw new Error("no canned"); return new Response(c.body, { status: c.status ?? 200, headers: { "content-type": "application/json" } }); };
const conf = readFileSync('wrangler.jsonc', 'utf8');
const vars = {};
for (const m of conf.matchAll(/^\s*"([A-Z_]+)":\s*"([^"]*)"/gm)) vars[m[1]] = m[2];
const sql = [];
const stmt = (q) => ({ bind: (...a) => ({ run: async () => { if (/INSERT INTO snapshots/.test(q)) sql.push(a); return {}; }, first: async () => null, all: async () => ({ results: [] }) }), run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) });
const DB = { prepare: stmt, batch: async () => [], exec: async () => ({}) };
const env = { ...vars, DB, GITHUB_TOKEN: process.env.GH_TOKEN };
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', resolve: { alias: { '@persona': process.cwd() + '/persona/asuka', '@site': process.cwd() + '/src' } } });
const live = await vite.ssrLoadModule('/src/server/live.ts');
for (const n of live.NAMES) { await live.refresh(env, n); }
await vite.close();
const esc = (s) => String(s).replace(/'/g, "''");
const out = sql.map((a) => /^[\[{]/.test(a[1])
  ? `INSERT INTO snapshots (name, json, fetched_at, error) VALUES ('${esc(a[0])}', '${esc(a[1])}', '${esc(a[2])}', NULL) ON CONFLICT(name) DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at, error=NULL;`
  : `-- ${a[0]} failed: ${String(a[2]).replace(/\n/g, ' ')}`);
writeFileSync(process.argv[2], out.join('\n'));
console.log(out.map((l) => l.slice(0, 120)).join('\n'));
