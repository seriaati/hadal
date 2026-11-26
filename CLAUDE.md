# Hadal

Sea-themed web trivia game: rarer correct answers score higher and take the player deeper.
Read `docs/GAME.md` first. It holds the game's idea, its look and the pack format.
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
  up on Wikipedia (see `docs/PACKS.md`); `bun tools/sources.ts [--bump] [--write]` reports what
  the sources of time-sensitive prompts in `curation/` gained since last recorded (the server's
  monthly update does this for the live packs)

API keys: `HADAL_SECRET` in `.env` (32 characters or more, e.g. from `openssl rand -base64 32`)
seals the keys players store. Without it the game runs but keeps no keys. `HADAL_DAILY_KEY`, the
instance's own Anthropic key, turns on the daily dive (`src/server/daily.ts`), which developer
mode always has, runs the monthly update of the prompts that grow (`src/server/updates.ts`; a
server started with the key runs it at once if this month's has not run), and has Claude write
each day's prompts the day before (`src/server/writer.ts`,
on `HADAL_DAILY_MODEL`, `claude-opus-5-5` if unset; what each prompt cost is in `daily_prompts`).
The writer follows `docs/PACKS.md` and the curate-pack skill: a change to either changes it too.
The live judge never uses this key, only players' own.

Developer mode: put `HADAL_DEV_MODE=1` in `.env` (git-ignored, read by Bun at start-up) and
restart the server. The game then shows a menu of shortcuts (`src/web/devmenu.ts`): answer
correctly in a chosen tier (in a room too, on the player's turn), run out of air, end the
dive, summon a creature. Its "Hide" button folds it away, and the browser remembers. Developer
mode also serves the pack review page at http://localhost:3000/dev/review, which rewrites the
built-in packs in the local database (`src/web/review/`, served through `src/server/review.ts`).

Admins: an account whose `admin` column is true (set by hand in the database, nowhere else) sees a
key at the top right that opens the admin panel (`src/web/pixel/admin.ts`, in English only): it
lists, downloads and uploads the built-in packs of each language.

## Layout

- `src/server/`: `Bun.serve` entry, API routes, pack loading and answer judging, accounts and
  sessions (`accounts.ts`), players' own packs (`custom.ts`), their API keys (`keys.ts`), packs
  written by Claude in the background (`generate.ts`), the live judge for answers a pack does not
  list (`live.ts`), the count of answers players give to built-in prompts (`counts.ts`), the
  built-in packs, kept in the database and changed from the admin panel (`system.ts`), the daily
  dive (`daily.ts`), its prompts written by Claude the day before (`writer.ts`) and brought into
  their packs when the day is over (`absorb.ts`), the
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
- `packs/` (git-ignored): a working copy of the built-in packs, a folder per language with one
  JSON file each, in the format described under "Pack format" in `docs/GAME.md` and checked by
  `validatePack` in `src/server/packs.ts`. The pack tools work on it, and an empty database is
  filled from it at start-up. The packs the game plays are those in the database: a pack edited
  here reaches it by an upload from the admin panel, and one downloaded from there is laid out
  like these files
- `tools/`: the pack tools, and `curation/` what they learn about each pack (git-ignored). Local
  `.sources.json` and `.seen.json` files fill an empty database's `prompt_sources` at start-up;
  the live sources are in the database, and a pack's sources file is uploaded from the admin panel
- `src/server/updates.ts`: once a month (on the instance's key), reads the sources of the prompts
  whose answers grow and has Claude add what they gained to every pack that asks the prompt; in
  January it also moves cut-off years forward. Changes go live at once; the admin panel shows the
  last update. `research.ts` is the Claude loop and pack tools it shares with the daily writer
- `design/brand/`: the logo (the diver's helmet) and the link preview; `bun design/brand/render.ts`
  draws the icons and `og-2.png` into `src/web/` (the preview needs Google Chrome)

## Rules

- Pack answers stay on the server. `src/web` may import from `src/shared`, never from `src/server`.
  The one exception is developer mode, whose `/api/dev/answer` endpoint names a correct answer
  and whose review page shows and rewrites every pack; it must stay off on any instance other
  people play on. The admin routes (`/api/admin/`) answer only an admin.
- A player's API key stays on the server, encrypted. It is used only for that player and never
  sent back to the browser or written to a log.
- The project owner is new to web development: build in small stages and explain tradeoffs.
- Everything in the game view is drawn on one pixel grid with the 22-colour palette (letters of
  other scripts, such as Chinese, in half pixels of it, so dense characters stay readable). Keep the
  screen clean: a new on-screen element must earn its place or live in the world.
- Creatures are scenery. They never harm the diver or affect the score (the giant anglerfish
  only seems to swallow them).
- In development the game is reachable from the browser console as `window.hadal`.
- This file, `docs/` and the skills are guidelines, not a record of what the game does; the code
  and the git log are that. Most changes leave them alone. Change one only when a rule in it stops
  being true or future work needs a new rule, never to describe a new feature, screen or setting.
