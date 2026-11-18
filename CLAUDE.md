# Hadal

Sea-themed web trivia game: rarer correct answers score higher and take the player deeper.
Read `docs/PLAN.md` first. It holds the game concept, the decisions made so far, the staged
roadmap and the open questions. Keep it up to date when a decision changes or a stage ends.
`docs/UI.md` is the design system of the interface: the parts a panel is built from, their
states, and what every key does. Read it before touching a panel.

## Stack

TypeScript, React, and Bun for everything (runtime, package manager, bundler, tests).
Use `bun`, not `npm`/`node`/`vite`.

## Commands

- `bun install`: install dependencies
- `docker compose up -d db`: start Postgres (port 5433 on this machine). The game and the
  account tests need it; it keeps running until `docker compose stop db`
- `bun dev`: run the game with hot reload at http://localhost:3000
- `bun test`: run tests
- `bun typecheck`: type-check
- `docker compose up -d --build`: run the database and the game as in production

API keys: `HADAL_SECRET` in `.env` (32 characters or more, e.g. from `openssl rand -base64 32`)
seals the keys players store. Without it the game runs but keeps no keys.

Developer mode: put `HADAL_DEV_MODE=1` in `.env` (git-ignored, read by Bun at start-up) and
restart the server. The game then shows a menu of shortcuts (`src/web/DevMenu.tsx`): answer
correctly at a chosen rarity, run out of air, end the dive, summon a creature.

## Layout

- `src/server/`: `Bun.serve` entry, API routes, pack loading and answer judging, accounts and
  sessions (`accounts.ts`), players' own packs (`custom.ts`), their API keys (`keys.ts`), packs
  written by Claude (`generate.ts`), the live judge for answers a pack does not list
  (`live.ts`), the multiplayer rooms, kept in memory and reached over a WebSocket
  (`rooms.ts`), the database (`db.ts`; schema changes are numbered files in
  `migrations/`, run at start-up, never edited once released)
- `src/web/`: the game client (served by the same Bun process). `state.ts` holds the rules of
  a run; `sound.ts` makes every sound (there are no sound files); `pixel/` is the renderer
  (frame buffer and soft light, the hand-built fonts and the fetched one for other scripts
  (`other.ts`), the scene, creatures, the parts and keys every panel shares (`ui.ts`), and
  the settings, account and packs panels, which only list what they hold);
  `logbook/` draws the hand-drawn summary of a finished dive (`sketch.ts` holds the paint and
  ink tools, `dive.ts` and `entries.ts` are the two pages)
- `src/shared/`: types and constants used by both sides
- `packs/`: built-in packs, one JSON file each, in the format described under "Pack format" in
  `docs/PLAN.md` and checked by `validatePack` in `src/server/packs.ts`
- `design/interface/`: the playable mock-ups of four directions for the panels; "open water"
  was chosen
- `design/multiplayer/`: still mock-ups of multiplayer, drawn with the game's own renderer
  (`bun design/multiplayer/render.ts` redraws `png/`; needs Google Chrome)
- `design/explorations/`: the eight art-direction mock-ups; 01 is the chosen style, 02 is the
  summary screen

## Rules

- Pack answers stay on the server. `src/web` may import from `src/shared`, never from `src/server`.
  The one exception is developer mode, whose `/api/dev/answer` endpoint names a correct answer;
  it must stay off on any instance other people play on.
- A player's API key stays on the server, encrypted. It is used only for that player and never
  sent back to the browser or written to a log.
- The project owner is new to web development: build in small stages and explain tradeoffs.
- Everything in the game view is drawn on one pixel grid with the 22-colour palette. Keep the
  screen clean: a new on-screen element must earn its place or live in the world. The logbook
  that closes a dive is the one exception: it is hand-drawn, on its own layer over the game.
- Creatures are scenery. They never attack the diver or affect the score.
- In development the game is reachable from the browser console as `window.hadal`.
