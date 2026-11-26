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
  are; `bun tools/sources.ts [--bump] [--write]` reports what the sources of time-sensitive
  prompts in `curation/` gained. The Wikipedia tools are in `docs/PACKS.md` and the curate-pack
  skill

Environment, in `.env` (git-ignored, read by Bun at start-up):

- `HADAL_SECRET` (32 characters or more, e.g. from `openssl rand -base64 32`) seals the API keys
  players store. Without it the game runs but keeps no keys.
- `HADAL_DAILY_KEY`, the instance's own Anthropic key, turns on what runs on the instance's behalf:
  the daily dive, the prompts Claude writes for it, and the monthly update of prompts that grow
  (`HADAL_DAILY_MODEL` picks the model). The live judge never uses it, only players' own keys.
  What Claude is told there is read from `docs/PACKS.md` and the curate-pack skill, so a change to
  either changes it too.
- `HADAL_DEV_MODE=1` turns on developer mode: a menu of shortcuts in the game and the pack review
  page at http://localhost:3000/dev/review.

Admins: an account whose `admin` column is true (set by hand in the database, nowhere else) can
open the admin panel, which manages the built-in packs.

## Layout

- `src/server/`: the `Bun.serve` entry, API routes and everything that runs on the server. The
  database is `db.ts`; schema changes are numbered files in `migrations/`, run at start-up, never
  edited once released
- `src/web/`: the game client (served by the same Bun process). `state.ts` holds the rules of
  a run, `sound.ts` makes every sound (there are no sound files), `pixel/` is the renderer, and
  `pixel/ui.ts` the parts and keys every panel shares
- `src/shared/`: types and constants used by both sides, and every word the game says, one
  table per language in `words/` (`en.ts` is the model; the compiler holds the others to it)
- `packs/` (git-ignored): a working copy of the built-in packs, a folder per language, in the
  format of "Pack format" in `docs/GAME.md`. The game plays the packs in its database: an empty
  database is filled from here at start-up, and after that packs move by the admin panel
- `tools/`: the pack tools, and `curation/` what they learn about each pack (git-ignored)
- `design/brand/`: the logo and the link preview; `bun design/brand/render.ts` draws them into
  `src/web/` (the preview needs Google Chrome)

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
