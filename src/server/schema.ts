// D1 schema. The Worker applies it itself on first use, so a deploy needs no migration step.
// To change the schema later, append a new entry to MIGRATIONS; never edit an old one.

import { COLLECTIONS, byId, type Collection } from './collections';

const sqlType = (t: string) => (t === 'number' || t === 'bool' ? 'INTEGER' : 'TEXT');

const tableFor = (c: Collection) => {
  const cols = c.fields.map((f) => `"${f.key}" ${sqlType(f.type)}`).join(', ');
  return `CREATE TABLE IF NOT EXISTS "${c.id}" (id TEXT PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'seed', ${cols})`;
};
const contentTables = COLLECTIONS.map(tableFor);

/** A column added after the first release. Fresh databases already have it (their tables are built from
 * the current fields), so db.ts skips this statement when the column exists. */
export const addColumn = (table: string, col: string, type: 'TEXT' | 'INTEGER') => `ALTER TABLE "${table}" ADD COLUMN "${col}" ${type}`;
export const ADD_COLUMN = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/;

/** A persona's content (persona/<name>/content.ts): the rows a new database starts with, by collection,
 *  and the persona's own migrations, which run after the framework's and are counted separately. */
export interface PersonaContent {
  seed: Record<string, Record<string, string | number>[]>;
  migrations?: string[][];
}

// The framework's migrations: tables and columns only. Content belongs to the persona. Slots that once held
// content changes are kept, empty, so the count stays the same for databases that ran them.
export const MIGRATIONS: string[][] = [
  [
    ...contentTables,
    `CREATE UNIQUE INDEX IF NOT EXISTS status_key ON status(key)`,
    `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, tbl TEXT, row_id TEXT, before TEXT, after TEXT)`,
    `CREATE TABLE IF NOT EXISTS snapshots (name TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at TEXT NOT NULL, error TEXT)`,
    `INSERT OR IGNORE INTO counters (name, value) VALUES ('visits', 0), ('pets', 0)`,
  ],
  [],
  // 2026-11-04: the Log (dated entries that go stale) gave way to Milestones (a few lines by year).
  // The old log table is left as it is, unused, so nothing written there is lost.
  [tableFor(byId('milestones')!)],
  [],
  [],
  // 2026-11-04: the "more" pages. Projects get a showcase video, milestones a month and a second line,
  // loadout entries a level and a start year.
  [
    addColumn('missions', 'video', 'TEXT'),
    addColumn('milestones', 'month', 'INTEGER'),
    addColumn('milestones', 'note', 'TEXT'),
    addColumn('loadout', 'level', 'INTEGER'),
    addColumn('loadout', 'since', 'INTEGER'),
  ],
  [],
  [],
  // 2026-11-05: no hand-typed stand-ins for live data. The NetEase level comes only from NetEase.
  [`DELETE FROM status WHERE key = 'netease_level'`],
];

/** How many framework migrations existed when content moved out to the persona (see db.ts). */
export const PERSONA_SPLIT_AT = 9;
