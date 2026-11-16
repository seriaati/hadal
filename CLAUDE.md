# Hadal

Sea-themed web trivia game: rarer correct answers score higher and take the player deeper.
Read `docs/PLAN.md` first. It holds the game concept, the decisions made so far, the staged
roadmap and the open questions. Keep it up to date when a decision changes or a stage ends.

## Stack

TypeScript, React, and Bun for everything (runtime, package manager, bundler, tests).
Use `bun`, not `npm`/`node`/`vite`.

## Commands

- `bun install`: install dependencies
- `bun dev`: run the game with hot reload at http://localhost:3000
- `bun test`: run tests
- `bun typecheck`: type-check

## Layout

- `src/server/`: `Bun.serve` entry, API routes, pack loading and answer judging
- `src/web/`: the game client (served by the same Bun process). `state.ts` holds the rules of
  a run; `pixel/` is the renderer (frame buffer and soft light, fonts, the scene, creatures);
  `logbook/` draws the hand-drawn summary of a finished dive (`sketch.ts` holds the paint and
  ink tools, `dive.ts` and `entries.ts` are the two pages)
- `src/shared/`: types and constants used by both sides
- `packs/`: built-in packs, one JSON file each
- `design/explorations/`: the eight art-direction mock-ups; 01 is the chosen style, 02 is the
  summary screen

## Rules

- Pack answers stay on the server. `src/web` may import from `src/shared`, never from `src/server`.
- The project owner is new to web development: build in small stages and explain tradeoffs.
- Everything in the game view is drawn on one pixel grid with the 19-colour palette. Keep the
  screen clean: a new on-screen element must earn its place or live in the world. The logbook
  that closes a dive is the one exception: it is hand-drawn, on its own layer over the game.
- Creatures are scenery. They never attack the diver or affect the score.
- In development the game is reachable from the browser console as `window.hadal`.
