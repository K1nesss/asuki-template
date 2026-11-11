// What a new site starts with. The Worker writes these rows into D1 the first time it runs; after that,
// edit them through /admin (or the superadmin), not here. Square brackets mark the parts to replace.
import type { PersonaContent } from '@site/server/schema';

export default {
  seed: {
    status: [
      { key: 'display_name', value: 'Your Name' },
      {
        key: 'bio',
        value:
          'Hi, I’m [your name]. [One line on what you make and what you care about.]' +
          '\n\n' +
          '[A second paragraph: what you are learning, what you listen to, what you are up to lately.]',
      },
      { key: 'status_text', value: 'Open to work' },
      { key: 'open_to_work', value: 'true' },
      { key: 'now_building', value: '[PROJECT]' },
      { key: 'location_label', value: '[Your city]' },
    ],
    ticker: ['Systems online', 'All hands on deck', 'Now loading: something new', 'Stay curious'].map((text) => ({ text })),
    milestones: [
      { year: 2026, kind: 'shipped', text: '[Something I shipped]' },
      { year: 2025, kind: 'joined', text: '[Somewhere I joined]' },
      { year: 2024, kind: 'learned', text: '[Something I learned]' },
      { year: 2023, kind: 'started', text: '[Where it began]' },
    ],
    missions: [
      { name: 'Homebase', blurb: 'This site. A cockpit for my work on one Cloudflare Worker.', state: 'live' },
      { name: 'Project two', blurb: 'In field testing. One line on what it does.', state: 'beta' },
      { name: 'Project three', blurb: 'Under construction.', state: 'dev' },
      { name: 'Project four', blurb: 'Reserved for the next experiment.', state: 'paused' },
    ],
    loadout: [
      { name: 'TypeScript', grp: 'Languages' },
      { name: 'CSS', grp: 'Languages' },
      { name: 'Astro', grp: 'Frameworks' },
      { name: 'Cloudflare', grp: 'Platforms' },
    ],
    links: [
      { label: 'Send a message', url: 'mailto:you@example.com', kind: 'contact' },
      { label: 'GitHub', url: 'https://github.com/your-github', kind: 'social' },
    ],
    pet_lines: ['Beep boop.', 'Again? Okay.', '…that tickles.', 'Systems happy.', 'One more, then back to work.'].map((text) => ({ text })),
  },
  migrations: [],
} satisfies PersonaContent;
