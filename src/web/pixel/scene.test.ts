import { expect, test } from "bun:test";
import { createGame } from "../state";
import { Frame } from "./frame";
import { Scene, approach, type Crew } from "./scene";

test("easing takes a share of the way, but never less than the least step, and never overshoots", () => {
  expect(approach(0, 100, 0.5, 10)).toBe(50);
  expect(approach(0, 100, 0.01, 10)).toBe(10);
  expect(approach(0, 4, 0.01, 10)).toBe(4);
  expect(approach(100, 0, 0.5, 10)).toBe(50);
});

test("when the turn passes, the camera travels to the next diver in three quarters of a second, then stays on them", () => {
  const frame = new Frame();
  frame.resize(320, 180);
  const scene = new Scene();
  const game = { ...createGame(), phase: "ask" as const, air: 30 };
  const menu = { items: [], choice: 0 };
  const crew = (turn: number): Crew[] =>
    [0, 2400].map((depth, slot) => ({ slot, suit: slot, name: `d${slot}`, lit: slot === turn, focus: slot === turn, depth, lamps: [{ depth, lit: true }] }));
  const run = (turn: number, seconds: number) => {
    scene.crew = crew(turn);
    for (let t = 0; t < seconds; t += 1 / 60) scene.draw(frame, game, menu, 1 / 60, t, false);
  };
  run(0, 0.5);
  expect(scene.depth).toBe(0);
  const lit = scene.lit;
  run(1, 0.6);
  expect(scene.depth).toBeGreaterThan(2000);
  expect(scene.depth).toBeLessThan(2400);
  run(1, 0.2);
  expect(scene.depth).toBe(2400);
  // Lamps already hung when a diver is first seen were reached long ago: they do not ring again.
  expect(scene.lit).toBe(lit);
});
