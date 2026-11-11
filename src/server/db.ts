import { COLLECTIONS } from './collections';
import { ADD_COLUMN, MIGRATIONS, PERSONA_SPLIT_AT } from './schema';
import content from '@persona/content';

let ready: Promise<void> | null = null;

/** Applies pending migrations and the first-run seed, once per isolate. */
export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= migrate(db).catch((e) => {
    ready = null; // try again on the next request
    throw e;
  });
  return ready;
}

async function migrate(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`).run();
  const meta = async (k: string) => {
    const row = await db.prepare(`SELECT v FROM meta WHERE k = ?1`).bind(k).first<{ v: string }>();
    return row ? Number(row.v) : null;
  };
  const done = (await meta('schema')) ?? 0;
  await run(db, 'schema', MIGRATIONS, done, (i) => (i === 0 ? seed(db) : undefined));
  // The persona's own migrations, counted under their own key. A database made before content moved to the
  // persona already ran them inside the framework's list, so it starts counting at the end.
  const list = content.migrations ?? [];
  let pdone = await meta('persona');
  if (pdone === null && done >= PERSONA_SPLIT_AT) pdone = list.length;
  await run(db, 'persona', list, pdone ?? 0);
}

async function run(db: D1Database, key: string, list: string[][], done: number, after?: (i: number) => Promise<void> | undefined) {
  for (let i = done; i < list.length; i++) {
    const sqls: string[] = [];
    for (const sql of list[i]) {
      const m = ADD_COLUMN.exec(sql);
      if (m) {
        const has = await db.prepare(`SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2`).bind(m[1], m[2]).first();
        if (has) continue;
      }
      sqls.push(sql);
    }
    await db.batch([
      ...sqls.map((sql) => db.prepare(sql)),
      db.prepare(`INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2`).bind(key, String(i + 1)),
    ]);
    await after?.(i);
  }
  // a list that is already done still records where it stands
  if (done >= list.length && key === 'persona') await db.prepare(`INSERT OR IGNORE INTO meta (k, v) VALUES (?1, ?2)`).bind(key, String(list.length)).run();
}

async function seed(db: D1Database) {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const c of COLLECTIONS) {
    (content.seed[c.id] ?? []).forEach((row, i) => {
      const keys = Object.keys(row);
      const cols = ['id', 'sort', 'updated_at', ...keys].map((k) => `"${k}"`).join(', ');
      const qs = ['?', '?', '?', ...keys.map(() => '?')].join(', ');
      stmts.push(db.prepare(`INSERT OR IGNORE INTO "${c.id}" (${cols}) VALUES (${qs})`).bind(newId(), i, now, ...keys.map((k) => row[k])));
    });
  }
  if (stmts.length) await db.batch(stmts);
}

/** Sortable, unique enough for one person's content: time + randomness, base 36. */
export function newId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  return Date.now().toString(36).padStart(9, '0') + [...rand].map((b) => (b % 36).toString(36)).join('');
}

export type Row = Record<string, unknown> & { id: string; sort: number; visible: number; updated_at: string };

export interface Content {
  status: Record<string, string>;
  ticker: Row[];
  milestones: Row[];
  missions: Row[];
  loadout: Row[];
  links: Row[];
  pet_lines: Row[];
  counters: Record<string, number>;
}

/** Everything the page shows from D1, in one round trip. */
export async function readContent(db: D1Database): Promise<Content> {
  await ensureSchema(db);
  const lists = COLLECTIONS.map((c) => db.prepare(`SELECT * FROM "${c.id}" WHERE visible = 1 ORDER BY ${c.order}`));
  const results = await db.batch([...lists, db.prepare(`SELECT name, value FROM counters`)]);
  const out: Record<string, unknown> = {};
  COLLECTIONS.forEach((c, i) => (out[c.id] = results[i].results));
  const status: Record<string, string> = {};
  for (const r of out.status as { key: string; value: string }[]) status[r.key] = r.value ?? '';
  const counters: Record<string, number> = {};
  for (const r of results[COLLECTIONS.length].results as { name: string; value: number }[]) counters[r.name] = r.value;
  return { ...(out as unknown as Content), status, counters };
}

export async function bump(db: D1Database, name: 'visits' | 'pets', by = 1): Promise<number> {
  await ensureSchema(db);
  const row = await db
    .prepare(`UPDATE counters SET value = value + ? WHERE name = ? RETURNING value`)
    .bind(by, name)
    .first<{ value: number }>();
  return row?.value ?? 0;
}

export async function audit(
  db: D1Database,
  e: { actor: string; action: string; tbl?: string; row_id?: string; before?: unknown; after?: unknown },
) {
  await db
    .prepare(`INSERT INTO audit (at, actor, action, tbl, row_id, before, after) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      new Date().toISOString(),
      e.actor,
      e.action,
      e.tbl ?? null,
      e.row_id ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
    )
    .run();
}
