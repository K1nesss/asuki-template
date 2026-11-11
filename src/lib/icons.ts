// Icons. The interface ones are drawn on a 9x9 pixel grid so they sit with the sprites;
// tech logos for the loadout come from Simple Icons (CC0), picked by name so only these few are bundled.

import {
  siAnaconda, siAnthropic, siArduino, siAstro, siBlender, siBun, siC, siClaude, siCloudflare, siCplusplus, siCss,
  siDeno, siDocker, siFigma, siFramer, siGit, siGithub, siGo, siGodotengine, siGraphql, siHtml5, siHuggingface,
  siJavascript, siJupyter, siKotlin, siLatex, siLinux, siMongodb, siNeovim, siNextdotjs, siNodedotjs, siNotion,
  siNumpy, siOpencv, siPandas, siPostgresql, siPython, siPytorch, siRaspberrypi, siReact, siRedis, siRos, siRust,
  siSass, siScikitlearn, siSqlite, siSupabase, siSvelte, siSwift, siTailwindcss, siTensorflow, siThreedotjs,
  siTypescript, siUnity, siVercel, siVite, siVuedotjs, siWebgl,
  siX, siInstagram, siYoutube, siBilibili, siDuolingo, siNeteasecloudmusic,
} from 'simple-icons';

const GRIDS = {
  missions: ['....#....', '..#####..', '.#..#..#.', '.#.....#.', '####.####', '.#.....#.', '.#..#..#.', '..#####..', '....#....'],
  milestones: ['.#.......', '.######..', '.########', '.#######.', '.######..', '.#.......', '.#.......', '.#.......', '###......'],
  mail: ['.........', '#########', '##.....##', '#.#...#.#', '#..#.#..#', '#...#...#', '#.......#', '#########', '.........'],
  pin: ['..#####..', '.##...##.', '.#..#..#.', '.#.###.#.', '.#..#..#.', '.##...##.', '..##.##..', '...###...', '....#....'],
  clock: ['..#####..', '.#..#..#.', '#...#...#', '#...#...#', '#...###.#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  signal: ['.........', '.......##', '.......##', '....##.##', '....##.##', '.##.##.##', '.##.##.##', '.##.##.##', '.##.##.##'],
  commit: ['.........', '.........', '...###...', '..#...#..', '###...###', '..#...#..', '...###...', '.........', '.........'],
  gauge: ['.........', '..#####..', '.#.....#.', '#......##', '#.....#.#', '#....#..#', '#...#...#', '.#.....#.', '.........'],
  plug: ['..#...#..', '..#...#..', '.#######.', '.#######.', '.#######.', '..#####..', '....#....', '....#....', '....#....'],
  battery: ['.........', '.........', '#######..', '#.#.#.###', '#.#.#.###', '#######..', '.........', '.........', '.........'],
  sun: ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
  moon: ['..####...', '.###.....', '###......', '###......', '###......', '###......', '.###.....', '..####...', '.........'],
  horizon: ['.........', '....#....', '.#.....#.', '...###...', '..#####..', '.#######.', '#########', '.........', '#.#.#.#.#'],
  cloud: ['.........', '.........', '...###...', '..#...##.', '.#......#', '#.......#', '#.......#', '.#######.', '.........'],
  rain: ['...###...', '..#...##.', '.#......#', '#.......#', '.#######.', '.........', '.#..#..#.', '#..#..#..', '.........'],
  partly: ['.#.......', '#.#.#....', '.###.....', '####.###.', '.##.#...#', '.#.#....#', '..#.....#', '...######', '.........'],
  fog: ['.........', '.#######.', '.........', '###.#####', '.........', '.#####.##', '.........', '####.###.', '.........'],
  storm: ['...###...', '..#...##.', '.#......#', '#.......#', '.##..###.', '....#....', '...###...', '....#....', '...#.....'],
  snow: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'],
  eye: ['.........', '.........', '..#####..', '.#..#..#.', '#..###..#', '.#..#..#.', '..#####..', '.........', '.........'],
  flame: ['....#....', '...##....', '...###...', '..####.#.', '.#######.', '.###.###.', '.##...##.', '.##...##.', '..#####..'],
  headphones: ['..#####..', '.#.....#.', '#.......#', '#.......#', '##.....##', '###...###', '###...###', '###...###', '.#.....#.'],
  heart: ['.........', '.##...##.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  code: ['.........', '#########', '#.......#', '#.#.....#', '#..#....#', '#.#..##.#', '#.......#', '#########', '.........'],
  shipped: ['....#....', '...###...', '..#.#.#..', '....#....', '....#....', '#...#...#', '#.......#', '#########', '.........'],
  started: ['.........', '.##......', '.####....', '.######..', '.#######.', '.######..', '.####....', '.##......', '.........'],
  wrote: ['.......#.', '......###', '.....###.', '....###..', '...###...', '..###....', '.###.....', '.##......', '#........'],
  joined: ['.........', '....#....', '....#....', '....#....', '#########', '....#....', '....#....', '....#....', '.........'],
  learned: ['.........', '##.....##', '#.##.##.#', '#...#...#', '#...#...#', '#...#...#', '#.##.##.#', '.##.#.##.', '....#....'],
  speaker: ['....#....', '...##..#.', '#####...#', '#####.#.#', '#####.#.#', '#####.#.#', '#####...#', '...##..#.', '....#....'],
  mute: ['....#....', '...##....', '#####....', '#####.#.#', '#####..#.', '#####.#.#', '#####....', '...##....', '....#....'],
  sea: ['.........', '.##...##.', '#..#.#..#', '....#....', '.........', '.##...##.', '#..#.#..#', '....#....', '.........'],
  seaStill: ['....#....', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '....#....'], // frozen
  play: ['.........', '.##......', '.####....', '.######..', '.#######.', '.######..', '.####....', '.##......', '.........'],
  pause: ['.........', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.........'],
  grid: ['.........', '##.##.##.', '##.##.##.', '.........', '##.##.##.', '##.##.##.', '.........', '##.##.##.', '##.##.##.'],
  chip: ['..#.#.#..', '.#######.', '##.....##', '.#.###.#.', '##.###.##', '.#.###.#.', '##.....##', '.#######.', '..#.#.#..'],
  back: ['#####....', '##.......', '#.#......', '#..#.....', '#...#....', '.....#...', '......#..', '.......#.', '.........'],
  out: ['....#####', '......###', '.....##.#', '....##..#', '...##...#', '..##.....', '.##......', '##.......', '.........'],
  sound: ['...######', '...######', '...#....#', '...#....#', '...#....#', '.###..###', '####.####', '####.####', '.##...##.'],
  theme: ['..#####..', '.####..#.', '#####...#', '#####...#', '#####...#', '#####...#', '#####...#', '.####..#.', '..#####..'],
  menu: ['.........', '#########', '.........', '.........', '#########', '.........', '.........', '#########', '.........'],
} as const;

export type IconName = keyof typeof GRIDS;

const toPath = (rows: readonly string[]) => {
  let d = '';
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; ) {
      if (r[x] !== '#') { x++; continue; }
      let e = x;
      while (r[e] === '#') e++;
      d += `M${x} ${y}h${e - x}v1h${x - e}z`;
      x = e;
    }
  });
  return d;
};

/** An icon's lit cells as "x,y,e" (e = 1 on the outline, 0 inside), for the pixels that fly in to build it. */
export const cells = (name: IconName) => {
  const g = GRIDS[name];
  const on = (x: number, y: number) => g[y]?.[x] === '#';
  const out: string[] = [];
  g.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '#') out.push(`${x},${y},${on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1) ? 0 : 1}`);
  }));
  return out;
};

export const ICONS = Object.fromEntries(Object.entries(GRIDS).map(([k, v]) => [k, toPath(v)])) as Record<IconName, string>;

/** The HUD icon for each weather look except clear, where the time-of-day icon stands in (partly shows a plain cloud at night). */
export const SKY_ICONS: IconName[] = ['partly', 'cloud', 'fog', 'rain', 'storm', 'snow'];

/** Phase of the sky to icon. */
export const PHASE_ICON: Record<string, IconName> = { night: 'moon', dawn: 'horizon', day: 'sun', dusk: 'horizon' };

const BRANDS = [
  siAnaconda, siAnthropic, siArduino, siAstro, siBlender, siBun, siC, siClaude, siCloudflare, siCplusplus, siCss,
  siDeno, siDocker, siFigma, siFramer, siGit, siGithub, siGo, siGodotengine, siGraphql, siHtml5, siHuggingface,
  siJavascript, siJupyter, siKotlin, siLatex, siLinux, siMongodb, siNeovim, siNextdotjs, siNodedotjs, siNotion,
  siNumpy, siOpencv, siPandas, siPostgresql, siPython, siPytorch, siRaspberrypi, siReact, siRedis, siRos, siRust,
  siSass, siScikitlearn, siSqlite, siSupabase, siSvelte, siSwift, siTailwindcss, siTensorflow, siThreedotjs,
  siTypescript, siUnity, siVercel, siVite, siVuedotjs, siWebgl,
];
const norm = (s: string) => s.toLowerCase().replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string> = { ts: 'typescript', js: 'javascript', node: 'nodedotjs', nodejs: 'nodedotjs', vue: 'vuedotjs', next: 'nextdotjs', nextjs: 'nextdotjs', tailwind: 'tailwindcss', golang: 'go', postgres: 'postgresql', threejs: 'threedotjs', three: 'threedotjs', godot: 'godotengine', cpp: 'cplusplus', html: 'html5', css3: 'css', torch: 'pytorch', sklearn: 'scikitlearn', opencv: 'opencv', ros2: 'ros', hf: 'huggingface' };
const bySlug = new Map(BRANDS.map((b) => [b.slug, b]));
const byTitle = new Map(BRANDS.map((b) => [norm(b.title), b]));

/** A tech logo for a loadout name, if there is one: { path (24x24), hex }. */
export function brand(name: string): { d: string; hex: string } | null {
  const n = norm(name);
  const b = bySlug.get(ALIAS[n] ?? n) ?? byTitle.get(n);
  if (!b) return null;
  // near-black logos (GitHub, Next.js, Vercel…) would vanish on the dark theme; they light up in the text colour instead
  const [r, g, bl] = [0, 2, 4].map((i) => parseInt(b.hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  return { d: b.path, hex: lum < 0.2 ? 'var(--text-strong)' : `#${b.hex}` };
}

export const GITHUB_MARK = siGithub.path;

/** The profile panel's fixed row of accounts, in order. A `links` row whose address matches one fills it in;
 *  until then its mark is drawn greyed out. `hex` is the colour the mark lights up in. */
export const SOCIALS = [
  { key: 'github', label: 'GitHub', d: siGithub.path, hex: 'var(--text-strong)', match: /(^|\.)github\.com$/ },
  { key: 'x', label: 'X', d: siX.path, hex: 'var(--text-strong)', match: /(^|\.)(x|twitter)\.com$/ },
  { key: 'instagram', label: 'Instagram', d: siInstagram.path, hex: `#${siInstagram.hex}`, match: /(^|\.)instagram\.com$/ },
  { key: 'youtube', label: 'YouTube', d: siYoutube.path, hex: `#${siYoutube.hex}`, match: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { key: 'bilibili', label: 'Bilibili', d: siBilibili.path, hex: `#${siBilibili.hex}`, match: /(^|\.)(bilibili\.com|b23\.tv)$/ },
] as const;

/** The app marks in the bio, drawn as their app icons. */
export const DUOLINGO = { d: siDuolingo.path, hex: `#${siDuolingo.hex}` };
export const NETEASE = { d: siNeteasecloudmusic.path, hex: `#${siNeteasecloudmusic.hex}` };

/** A project's status as a tiny 7x7 pixel mark rather than a glyph, which not every phone font has. */
export const STATE_MARK: Record<string, string> = { live: 'M2 0h3v1h-3zM1 1h5v1h-5zM0 2h7v1h-7zM0 3h7v1h-7zM0 4h7v1h-7zM1 5h5v1h-5zM2 6h3v1h-3z', beta: 'M2 0h3v1h-3zM1 1h4v1h-4zM6 1h1v1h-1zM0 2h4v1h-4zM6 2h1v1h-1zM0 3h4v1h-4zM6 3h1v1h-1zM0 4h4v1h-4zM6 4h1v1h-1zM1 5h4v1h-4zM6 5h1v1h-1zM2 6h3v1h-3z', dev: 'M2 0h3v1h-3zM1 1h1v1h-1zM5 1h1v1h-1zM0 2h1v1h-1zM6 2h1v1h-1zM0 3h1v1h-1zM6 3h1v1h-1zM0 4h1v1h-1zM6 4h1v1h-1zM1 5h1v1h-1zM5 5h1v1h-1zM2 6h3v1h-3z', paused: 'M1 0h2v1h-2zM4 0h2v1h-2zM1 1h2v1h-2zM4 1h2v1h-2zM1 2h2v1h-2zM4 2h2v1h-2zM1 3h2v1h-2zM4 3h2v1h-2zM1 4h2v1h-2zM4 4h2v1h-2zM1 5h2v1h-2zM4 5h2v1h-2zM1 6h2v1h-2zM4 6h2v1h-2z', done: 'M6 0h1v1h-1zM5 1h2v1h-2zM0 2h1v1h-1zM4 2h2v1h-2zM0 3h2v1h-2zM3 3h2v1h-2zM1 4h3v1h-3zM2 5h1v1h-1z' };

