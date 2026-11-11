// The example persona: Bit, a small robot on the caution tape, and Rook, the mech in the banner.
// All of it is original and free to reuse. Copy this folder to persona/<your-name>/ and make it yours:
// PERSONA.md explains every field, and `npm run check` tells you what is missing or the wrong size.
import { definePersona } from '@site/lib/persona';
import pet from './sprites/pet.json';
import petFrames from './sprites/pet-frames.json';
import mech from './sprites/mech.json';
import pilot from './sprites/pilot.json';
import pilotFrames from './sprites/pilot-frames.json';
import prop from './sprites/prop.json';

export default definePersona({
  name: 'Homebase',
  title: 'HELLO',
  url: 'https://example.com',
  storageKey: 'homebase',

  mech: {
    name: 'Rook',
    sprite: mech,
    feet: 88,
    socket: [14, 28],
    shadows: { front: [40, 16], rear: [10, 14] },
    eyes: { char: 'e' },
  },
  pilot: { sprite: pilot, frames: pilotFrames },
  pet: {
    name: 'Bit',
    sprite: pet,
    frames: petFrames,
    hands: { throwA: [27, 21], throwB: [34, 27], throwC: [7, 39] },
    head: { rows: 30, view: [4, 0, 32, 30] },
    lines: {
      angry: 'Too much!', sulk: 'Hmph.', unsulk: '…okay.', doze: 'zz…', startle: '!',
      take: ['Watch this!', 'Here goes!'], cheer: 'Bullseye!', refuse: 'Not now.', fallback: 'Beep.',
    },
  },
  prop: { name: 'A harpoon', sprite: prop },
  avatarBack: null,

  // Add your own: put an MP3 in public/music/ and run `npm run peaks -- public/music/<file>.mp3` (see PERSONA.md).
  track: null,
  sfx: {},

  words: {
    panel: 'Pilot',
    shield: 'Shield',
    cable: 'Power cable',
    battery: 'Battery',
    engaged: 'Online',
    internal: 'On battery',
    halted: 'Out of power',
  },

  egg: null,
});
