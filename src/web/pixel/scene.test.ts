import { expect, test } from "bun:test";
import { createGame } from "../state";
import { Frame } from "./frame";
import { MAX_PLAYERS } from "../../shared/room";
import { Scene, approach, lobbyPlaces, type Crew } from "./scene";

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

test("a diver the host called blinks red, a third of a second on and one off, until they light their lantern", () => {
  const frame = new Frame();
  frame.resize(320, 180);
  const scene = new Scene();
  const reds = (diver: Partial<Crew>) => {
    scene.crew = [{ slot: 0, suit: 0, name: "ana", lit: false, focus: true, depth: 0, ...diver }];
    return scene.draw(frame, createGame(), { items: [], choice: 0 }, 1 / 60, 0, false).filter(({ rgb }) => rgb[0] === 210 && rgb[1] === 40).length;
  };
  expect(reds({ called: 0.1 })).toBe(1);
  expect(reds({ called: 0.5 })).toBe(0);
  expect(reds({ called: 0.7 })).toBe(1);
  expect(reds({ called: 0.1, lit: true })).toBe(0);
  expect(reds({})).toBe(0);
});

test("in a room every place along the boat is in view, from the narrowest frame to a wide one", () => {
  // An upright phone's frame is at least 144 wide; a diver is 21 wide, their line at its left.
  for (const width of [144, 146, 195, 240, 320, 480]) {
    const { gap, across } = lobbyPlaces(width);
    expect(gap).toBeLessThanOrEqual(64);
    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const x = 84 + slot * gap - across;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + 21).toBeLessThanOrEqual(width);
    }
  }
});
