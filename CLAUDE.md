# Hadal

Sea-themed web trivia game: rarer correct answers score higher and take the player deeper.
Read `docs/GAME.md` first. It holds the game's idea, its look and the pack format. Keep it up
to date when one of those changes.
`docs/UI.md` is the design system of the interface: the parts a panel is built from, their
states, and what every key does. Read it before touching a panel.
`docs/PACKS.md` is how to write good packs: prompts, answer lists, tiers and how rarity is
measured. Read it before making or changing a pack; the `curate-pack` skill walks through it.

## Stack

TypeScript and Bun for everything (runtime, package manager, bundler, tests). No UI library:
the game draws itself on canvas, and the few page elements are plain DOM.
Use `bun`, not `npm`/`node`/`vite`.

## Commands

- `bun install`: install dependencies
- `docker compose up -d db`: start Postgres (port 5433 on this machine). The game and the
  account tests need it; it keeps running until `docker compose stop db`
- `bun dev`: run the game with hot reload at http://localhost:3000
- `bun test`: run tests
- `bun typecheck`: type-check
- `docker compose up -d --build`: run the database and the game as in production
- `bun tools/check.ts [--write] <pack files>`: check built-in packs and lay them out as the others
  are; `tools/table.ts`, `tools/members.ts`, `tools/names.ts` and `tools/signals.ts` look answers
  up on Wikipedia (see `docs/PACKS.md`)

API keys: `HADAL_SECRET` in `.env` (32 characters or more, e.g. from `openssl rand -base64 32`)
seals the keys players store. Without it the game runs but keeps no keys.

Developer mode: put `HADAL_DEV_MODE=1` in `.env` (git-ignored, read by Bun at start-up) and
restart the server. The game then shows a menu of shortcuts (`src/web/devmenu.ts`): answer
correctly in a chosen tier (in a room too, on the player's turn), run out of air, end the
dive, summon a creature. Its "Hide" button folds it away, and the browser remembers. Developer
mode also serves the pack review page at http://localhost:3000/dev/review, which rewrites the
built-in pack files (`src/web/review/`, served through `src/server/review.ts`).

## Layout

- `src/server/`: `Bun.serve` entry, API routes, pack loading and answer judging, accounts and
  sessions (`accounts.ts`), players' own packs (`custom.ts`), their API keys (`keys.ts`), packs
  written by Claude in the background (`generate.ts`), the live judge for answers a pack does not
  list (`live.ts`), the count of answers players give to built-in prompts (`counts.ts`), the
  multiplayer rooms, kept in memory and reached over a WebSocket
  (`rooms.ts`), the database (`db.ts`; schema changes are numbered files in
  `migrations/`, run at start-up, never edited once released)
- `src/web/`: the game client (served by the same Bun process). `state.ts` holds the rules of
  a run; `sound.ts` makes every sound (there are no sound files); `pixel/` is the renderer
  (frame buffer and soft light, the hand-built fonts and the fetched one for other scripts
  (`other.ts`), the scene, creatures (those NekuMeow drew are sprite frames in `drawn.ts`), the
  parts and keys every panel shares (`ui.ts`), and the settings, account and packs panels,
  which only list what they hold, and the screen that ends a dive, `ending.ts`)
- `src/shared/`: types and constants used by both sides, and every word the game says, one
  table per language in `words/` (`en.ts` is the model; the compiler holds the others to it)
- `packs/`: built-in packs, a folder per language with one JSON file each, in the format
  described under "Pack format" in `docs/GAME.md` and checked by `validatePack` in
  `src/server/packs.ts`
- `tools/`: the pack tools, and `curation/` what they learn about each pack (only the
  `<pack id>.titles.json` files, kept by hand, are in git)
- `design/brand/`: the logo (the diver's helmet) and the link preview; `bun design/brand/render.ts`
  draws the icons and `og-2.png` into `src/web/` (the preview needs Google Chrome)

## Rules

- Pack answers stay on the server. `src/web` may import from `src/shared`, never from `src/server`.
  The one exception is developer mode, whose `/api/dev/answer` endpoint names a correct answer
  and whose review page shows and rewrites every pack; it must stay off on any instance other
  people play on.
- A player's API key stays on the server, encrypted. It is used only for that player and never
  sent back to the browser or written to a log.
- The project owner is new to web development: build in small stages and explain tradeoffs.
- Everything in the game view is drawn on one pixel grid with the 22-colour palette (letters of
  other scripts, such as Chinese, in half pixels of it, so dense characters stay readable). Keep the
  screen clean: a new on-screen element must earn its place or live in the world.
- Creatures are scenery. They never harm the diver or affect the score (the giant anglerfish
  only seems to swallow them).
- In development the game is reachable from the browser console as `window.hadal`.
