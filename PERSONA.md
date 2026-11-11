# The persona format

A persona is one folder, `persona/<name>/`. It holds everything that makes the site someone's. The framework reads it through `@persona` and nothing else, so a persona never needs a change in `src/`.

`npm run check` validates every rule on this page and says what to fix. `npm run build` runs it first.

```
persona/<name>/
  index.ts        the persona: names, sprites, words, music, sounds, Easter egg   (required)
  content.ts      the starting content of the database                             (required)
  theme.css       colour overrides; may be empty                                   (required)
  sprites/        pixel art, as JSON
  public/         static files served at the site root: favicon.svg, img/, music/, sfx/
```

Which persona is built: `PERSONA=<name>` if set; otherwise the only folder that is not `example`; otherwise `example`.

## Pixel art

Every sprite is a grid of cells, written as rows of characters, plus a map from character to colour:

```json
{
  "rows": [
    "..aa..",
    ".abba.",
    "..cc.."
  ],
  "map": { "a": "#1a1416", "b": "#f2ece8", "c": "#ff7a3d" }
}
```

- `.` is transparent. Every other character must be in `map`, as a `#rrggbb` colour.
- Every row is the same width. Pad with `.`.
- Keep a palette small (8 to 16 colours) and outline shapes with one dark colour; it reads well at this size.
- Poses ("frames") are extra sets of rows, the same size as the sprite, using the same map: `{ "blink": [rows], "side": [rows] }`.
- `npm run sprite -- idle.png blink.png ... --out persona/<name>/sprites/pet` converts PNGs drawn at one pixel per cell. The first file becomes the sprite, the others become frames named after their files. Add `--cell 4` for art drawn in 4x4 blocks.

## index.ts

```ts
import { definePersona } from '@site/lib/persona';
export default definePersona({ ... });
```

The type, with a comment on every field, is `src/lib/persona.ts`. In short:

| Field | What it is |
|---|---|
| `name` | The site's name: tab title, copyright line, the heading screen readers hear. |
| `title` | The big word across the banner sky. About 5 or 6 capital letters fit. |
| `url` | The site's address, `https://...`. Used for `og:url` and as the Worker's user agent. |
| `storageKey` | Lowercase prefix for the visitor's saved switches in `localStorage`. |
| `mech` | The giant in the banner (see below). |
| `pilot` | The tiny figure on the street. `{ sprite, frames }`. |
| `pet` | The footer pet (see below). |
| `prop` | `{ name, sprite }`, the thing the pet throws, or `null`. |
| `avatarBack` | A picture in `public/` for the back of the avatar card (it turns over when clicked), or `null`. |
| `track` | The music player's one song (see below), or `null` to leave the player out. |
| `sfx` | Recorded sound effects by cue, e.g. `{ field: '/sfx/shield.mp3' }`. Anything not named is synthesised. Cues are listed at the top of `src/scripts/sound.ts`. |
| `words` | Interface words: `panel` (label over your name), `shield`, `cable`, `battery`, and the mech's states `engaged`, `internal`, `halted`. |
| `egg` | An Easter egg opened by holding the mech for two seconds, or `null`. See below. |

### The mech

About 70 cells wide and 100 tall (any size works; it is scaled to the same height). It stands on the street on the right of the banner.

| Field | |
|---|---|
| `sprite` | The art. |
| `name` | Shown in the banner's corner. |
| `feet` | The row its feet stand on. Rows below it hang over the street's edge (a claw, a tail). |
| `socket` | `[x, y]` where the power cable plugs in. Somewhere on its back, ideally hidden by the body. |
| `shadows` | `{ front: [x, width], rear: [x, width] }`, two shadow strips on the street. |
| `eyes` | `{ char, maxX? }`: the colour letter of its eyes. They glow on hover and flare on click. Cells in that colour right of `maxX` are not counted. |

### The pilot

About 20 x 20 cells (scaled to a 25-cell mech-relative height). Frames: `p_walk1`, `p_walk2` (walking), `p_up` (looking up at the sky), `p_back` (sulking, back turned). The sprite itself is `p_idle`. Missing frames use `p_idle`.

### The pet

About 50 x 70 cells, drawn at 1.5 pixels a cell on desktop and 1 on phones.

| Field | |
|---|---|
| `sprite` | The idle pose, facing you. |
| `frames` | The other poses (below). |
| `hands` | `{ throwA: [x, y], throwB: [x, y], throwC: [x, y] }`, where her throwing hand is in each throwing pose, facing left as drawn. The prop is held there. |
| `head` | `{ rows, view? }`: the avatar in the profile panel is the top `rows` of the sprite, cropped to `view` `[x, y, w, h]`. |
| `lines` | What she says: `angry` (petted too much), `sulk`, `unsulk`, `doze`, `startle`, `take` (a list, said when handed the prop), `cheer` (it stuck), `refuse`, `fallback`. Her petting lines are content (`pet_lines` in `content.ts`). |

Poses, and what a missing one falls back to:

| Pose | Used when | Falls back to |
|---|---|---|
| `blink` | blinking, dozing | idle |
| `happy` | being petted, cheering | idle |
| `angry` | petted too much | idle |
| `surprised` | woken up | idle |
| `lookUp` | the cursor is above her | idle |
| `back` | sulking | idle |
| `side` | turning, standing in profile (facing left) | idle |
| `sideA`, `sideB`, `sideC` | the walk cycle, A B C B | side, side, sideA |
| `stompA`, `stompC` | stomping off angry | sideA, sideC |
| `throwA`, `throwB`, `throwC` | holding up the prop, winding up, the throw | side, throwA, throwA |

All poses face left; she is mirrored to walk right.

### The prop

Long and thin, head to the right, about 40 x 7 cells. It flies like a javelin: weight toward the head, sticks in the tape tip first.

### The track

```ts
track: { src: '/media/song.mp3', title: 'Song', artist: 'Artist', duration: 245.8, peaks: '0011...' }
```

Put the MP3 in `public/music/` (lowercase name, under 25 MiB) and run `npm run peaks -- persona/<name>/public/music/song.mp3`, which prints the whole block (it needs ffmpeg).

### The Easter egg

```ts
egg: import.meta.env.SSR ? null : () => import('./egg/my-egg.js').then((m) => ({ open: m.open })),
```

`open({ from, onClose })` shows anything you like over the page and calls `onClose` when it has gone. `from` is the element it was opened from. Keep the `SSR` check: it keeps the egg's code out of the Worker. Large 3D files (`.vrm`, `.vrma`) in `public/egg/` are compressed by the build and versioned by their hash (`__EGG_V__`).

## content.ts

The rows a new database starts with. After the first run the content lives in D1 and is edited through `/admin`, so changing `content.ts` later does not change a live site.

```ts
import type { PersonaContent } from '@site/server/schema';
export default { seed: { status: [...], ticker: [...], ... }, migrations: [] } satisfies PersonaContent;
```

| Collection | Rows |
|---|---|
| `status` | `{ key, value }` with keys `display_name`, `bio` (a blank line starts a paragraph; `{duolingo}` and `{netease}` put those app marks after the word before), `status_text`, `open_to_work`, `now_building`, `location_label` |
| `ticker` | `{ text }`, up to 48 characters. `{phase}` becomes the time of day. |
| `milestones` | `{ year, month?, kind, text, note?, url? }`, kind one of started, shipped, joined, learned, wrote |
| `missions` | Projects: `{ name, blurb, state, url?, repo?, video? }`, state one of live, beta, dev, paused, done |
| `loadout` | Tools: `{ name, grp?, level?, since? }` |
| `links` | `{ label, url, kind }`, kind contact (the red button), social (GitHub, X, Instagram, YouTube, Bilibili light up their icons) or source |
| `pet_lines` | `{ text }`, what the pet says while petted, up to 40 characters |

Field limits are in `src/server/collections.ts`. Use `’` rather than `'` in text.

`migrations` is for later changes to content on databases that already exist: a list of steps, each a list of SQL statements, run once each, in order, after the framework's own. Leave it empty for a new site.

## theme.css

Override any token from `src/styles/tokens.css`, for both themes:

```css
:root { --red: #2b6cff; --red-hot: #4d8bff; --orange: #ffb020; }
:root[data-theme='light'] { --orange: #c77d00; }
```

## Environment, not persona

Your accounts and location are deploy settings, in `wrangler.jsonc` (`GITHUB_USER`, `LOCATION_LABEL`, `TIMEZONE`, `LAT`, `LON`, the social handles), and secrets go in Cloudflare (`GITHUB_TOKEN`, `VISIT_SALT`, ...). See the README.
