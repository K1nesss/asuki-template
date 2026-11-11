# Working in this repo (for AI agents)

This is a homepage framework. A person forks it and asks you to make it theirs. Almost every request is about their **persona**: the folder `persona/<name>/`.

## Rules

1. **Change the persona, not the framework.** Names, art, words, music, colours and starting content all belong in `persona/<name>/`. Edit `src/` only when the person asks for a new feature or a fix, and then never put a name, a character or an account into `src/`.
2. **Start from the example.** For a new persona, copy `persona/example/` to `persona/<name>/` (lowercase, dashes) and edit the copy. Leave `persona/example/` as it is: it is the reference.
3. **Read [PERSONA.md](PERSONA.md) before touching a persona.** It is the exact format: sprite rows, pose names, anchors, content fields and limits. The type with comments is `src/lib/persona.ts`.
4. **Run `npm run check` after every change to a persona**, and fix what it reports until it says it looks good. Then `npm run build`.
5. **Pixel art is data.** Sprites are JSON palette rows (`.` is transparent; every row the same width; every character in the map). When you draw, work row by row on a grid, keep to a small palette, give shapes a one-cell dark outline, and keep every pose of a sprite the same size. Draw the poses as small changes to the idle pose (eyes, arms, legs), not as new drawings. From PNGs, use `npm run sprite`.
6. **Anchors follow the art.** After drawing or resizing the mech, update `feet`, `socket`, `shadows` and `eyes`. After drawing throwing poses, update `pet.hands`. After resizing the pet, update `pet.head`.
7. **Accounts and location go in `wrangler.jsonc`**, never in code. Secrets (`GITHUB_TOKEN`, `VISIT_SALT`, API keys) are never written to any file in the repo: the person adds them in Cloudflare.
8. **Rights.** Only add art, music or characters the person says they may publish. If they give you copyrighted material for a public repo, say so and suggest a private repository.
9. **Content lives in D1 after launch.** `content.ts` seeds a new database only. To change a live site's content, use the admin API (README) rather than editing `content.ts`.

## Commands

| | |
|---|---|
| `npm run check` | Validate the persona in use |
| `npm run dev` | Dev server for styling (http://localhost:4321) |
| `npm run preview` | Build and run the real Worker with a local database (http://localhost:8787) |
| `npm run build` | Check, then build |
| `npm run sprite -- a.png b.png --out persona/<name>/sprites/pet` | PNGs to sprite JSON |
| `npm run peaks -- persona/<name>/public/music/x.mp3` | The music player's track block (needs ffmpeg) |

`PERSONA=<name>` before any command picks a persona when there are several.

## Map

- `persona/example/` the reference persona (Bit the pet, Rook the mech, a pilot, a harpoon)
- `src/lib/persona.ts` what a persona provides, with comments
- `src/lib/scene.ts` the banner city and how the mech and pilot are placed
- `src/scripts/pet.ts` the pet's state machine and its poses (`PET_FRAMES`)
- `src/scripts/banner.ts` the pilot, the cable, the shield and the Easter egg hold
- `src/server/collections.ts` the content collections and their field limits
- `src/server/schema.ts`, `src/server/db.ts` migrations and the first-run seed
