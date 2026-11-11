// What a persona gives the framework. A persona is everything that makes the site someone's: the name,
// the characters and their pixel art, the music, the words in the interface and the starting content.
// The framework reads it from `@persona` (persona/<name>/index.ts, picked in astro.config.mjs) and nothing
// else, so swapping the folder swaps the site. PERSONA.md describes every field for people and AIs.
import type { Sprite } from './pixels';

/** Named poses: each is a full set of rows, the same size as the sprite, drawn with the sprite's colour map. */
export type Frames = Record<string, string[]>;

export interface Track {
  /** /media/<file>.mp3, served from the persona's public/music/<file>.mp3 */
  src: string;
  title: string;
  artist: string;
  /** seconds */
  duration: number;
  /** loudness in 256 slices, one digit 0-9 each, for the waveform seek bar (npm run peaks makes it) */
  peaks: string;
}

export interface Persona {
  /** The site's name: the tab title, the copyright line, the heading screen readers hear. */
  name: string;
  /** The big word painted across the banner sky. Short and in capitals reads best (5 to 6 letters). */
  title: string;
  /** Where the site lives, e.g. https://example.com. Used for og:url and as the user agent of the Worker's fetches. */
  url: string;
  /** A short prefix for the visitor's saved switches (theme, sound, sea) in localStorage. */
  storageKey: string;

  /** The giant in the banner, standing on the street with a power cable plugged into its back. */
  mech: {
    name: string;
    sprite: Sprite;
    /** the sprite row its feet stand on (rows below it hang over the street edge, like a claw) */
    feet: number;
    /** where the cable plugs in: [x, y] in sprite cells */
    socket: [number, number];
    /** the two shadow strips on the street under it: [x, width] in sprite cells */
    shadows: { front: [number, number]; rear: [number, number] };
    /** the colour letter of its eyes in the sprite, and (optional) only the cells left of this column count
     *  as eyes, so a lamp elsewhere in the same colour does not flare with them */
    eyes: { char: string; maxX?: number };
  };

  /** The tiny figure who walks the street and plugs the cable back in. */
  pilot: {
    sprite: Sprite;
    /** p_idle, p_walk1, p_walk2, p_up (looking up), p_back (sulking, back turned). Missing ones fall back to p_idle. */
    frames: Frames;
  };

  /** The pet on the caution tape in the footer: walks, gets petted, sulks, and throws the prop. */
  pet: {
    name: string;
    sprite: Sprite;
    /** see PET_FRAMES in src/scripts/pet.ts for the names; missing ones fall back to a near relative */
    frames: Frames;
    /** her throwing hand in each throwing frame, [x, y] in cells, facing left as drawn */
    hands?: Partial<Record<'throwA' | 'throwB' | 'throwC', [number, number]>>;
    /** the avatar in the profile panel is the top of the pet sprite: how many rows, and an optional
     *  viewBox [x, y, w, h] to crop it. Default: the top 55%, full width. */
    head?: { rows: number; view?: [number, number, number, number] };
    /** what she says. `pet` lines come from the content (the pet_lines collection); these are the rest. */
    lines: {
      angry: string; sulk: string; unsulk: string; doze: string; startle: string;
      take: string[]; cheer: string; refuse: string; fallback: string;
    };
  };

  /** Something the pet can be handed and throws down the tape. null: no prop. */
  prop: { name: string; sprite: Sprite } | null;

  /** The back of the avatar card (it turns over when clicked): a picture in the persona's public folder, or null. */
  avatarBack: string | null;

  /** The music player's one track, or null to leave the player out. */
  track: Track | null;

  /** Recorded sound effects, by cue name (see the top of src/scripts/sound.ts). Anything not named is synthesised. */
  sfx: Partial<Record<string, string>>;

  /** Words in the interface that belong to the world of the persona. */
  words: {
    /** the label above the name in the profile panel */
    panel: string;
    /** what the click in the sky raises */
    shield: string;
    cable: string;
    battery: string;
    /** the mech's state line: plugged in, running on battery, battery empty */
    engaged: string;
    internal: string;
    halted: string;
  };

  /** An Easter egg, opened by holding the mech for two seconds. Loaded only then. null: none. */
  egg: null | (() => Promise<{ open(opts: { from?: Element | null; onClose?: () => void }): void }>);
}

export const definePersona = (p: Persona) => p;

/** A pose by name, falling back along `chain` (each name to the next one to try), then to the sprite itself. */
export function pose(frames: Frames, sprite: Sprite, name: string, chain: Record<string, string>): string[] {
  for (let n: string | undefined = name, i = 0; n && i < 12; n = chain[n], i++) if (frames[n]) return frames[n];
  return sprite.rows;
}

export const spriteSize = (s: Sprite) => ({ w: Math.max(...s.rows.map((r) => r.length)), h: s.rows.length });
