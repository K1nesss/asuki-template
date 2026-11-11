// The editable content of the site, described once.
// This one table drives the D1 schema, the admin API's validation and the manifest that the
// superadmin reads, so adding a field here is the only change a new field needs.

export type FieldType = 'text' | 'longtext' | 'number' | 'bool' | 'date' | 'url' | 'enum' | 'image';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  options?: string[];
  help?: string;
}

export interface Collection {
  id: string;
  label: string;
  help?: string;
  /** SQL ORDER BY for lists, built only from field keys and housekeeping columns. */
  order: string;
  fields: Field[];
  /** At most this many rows; the page has room for no more. */
  limit?: number;
}

export const COLLECTIONS: Collection[] = [
  {
    id: 'status',
    label: 'Status',
    help: 'Single settings, one row per key.',
    order: 'sort, key',
    fields: [
      {
        key: 'key',
        label: 'Key',
        type: 'enum',
        required: true,
        options: ['display_name', 'bio', 'status_text', 'open_to_work', 'now_building', 'location_label'],
        help: 'bio: a blank line starts a new paragraph; {duolingo} and {netease} put those app marks after the word before them.',
      },
      { key: 'value', label: 'Value', type: 'longtext', max: 600 },
    ],
  },
  {
    id: 'ticker',
    label: 'Ticker',
    help: 'The lines that run along the red band under the banner.',
    order: 'sort, updated_at',
    limit: 12,
    fields: [{ key: 'text', label: 'Text', type: 'text', required: true, max: 48 }],
  },
  {
    id: 'milestones',
    label: 'Milestones',
    help: 'The things that mark the way, by year, newest first. The homepage shows the latest few; the Milestones page shows them all.',
    order: 'year DESC, month DESC, sort',
    limit: 60,
    fields: [
      { key: 'year', label: 'Year', type: 'number', required: true },
      { key: 'month', label: 'Month (1-12)', type: 'number' },
      { key: 'kind', label: 'Kind', type: 'enum', required: true, options: ['started', 'shipped', 'joined', 'learned', 'wrote'] },
      { key: 'text', label: 'Text', type: 'text', required: true, max: 64 },
      { key: 'note', label: 'One more line', type: 'text', max: 120 },
      { key: 'url', label: 'Link', type: 'url' },
    ],
  },
  {
    id: 'missions',
    label: 'Projects',
    help: 'Project cards (stored as missions). The homepage shows the first four; the Projects page shows every one as a case on a shelf. Without a screenshot a card shows a pixel animation in its status colour. A video plays on the case front when it is opened.',
    order: 'sort, updated_at',
    limit: 24,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, max: 28 },
      { key: 'blurb', label: 'One line', type: 'text', max: 90 },
      { key: 'state', label: 'State', type: 'enum', required: true, options: ['live', 'beta', 'dev', 'paused', 'done'] },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'repo', label: 'GitHub repo (owner/name)', type: 'text', max: 100 },
      { key: 'image', label: 'Screenshot URL', type: 'image' },
      { key: 'video', label: 'Showcase video URL (short, mp4 or webm)', type: 'url' },
    ],
  },
  {
    id: 'loadout',
    label: 'Loadout',
    help: 'Tools and tech. The homepage shows the first twelve; the Loadout page shows all, grouped (Languages, Frameworks, Platforms, Tools, Hardware, or your own group names).',
    order: 'sort, name',
    limit: 60,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, max: 24 },
      { key: 'grp', label: 'Group', type: 'text', max: 24 },
      { key: 'level', label: 'How well (1-5)', type: 'number' },
      { key: 'since', label: 'Using it since (year)', type: 'number' },
    ],
  },
  {
    id: 'links',
    label: 'Links',
    help: 'The first contact link becomes the red Send a message button. Social links to GitHub, X, Instagram, YouTube or Bilibili light up those icons; any other shows as a plain link icon.',
    order: 'sort, label',
    limit: 10,
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true, max: 16 },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'kind', label: 'Kind', type: 'enum', required: true, options: ['contact', 'social', 'source'] },
    ],
  },
  {
    id: 'pet_lines',
    label: 'Pet lines',
    help: 'What the footer pet says when someone pets her.',
    order: 'sort, updated_at',
    fields: [{ key: 'text', label: 'Text', type: 'text', required: true, max: 40 }],
  },
];

export const byId = (id: string) => COLLECTIONS.find((c) => c.id === id);

/** Columns every content table has, managed by the API rather than the caller. */
export const HOUSEKEEPING = ['id', 'sort', 'visible', 'updated_at', 'updated_by'] as const;
