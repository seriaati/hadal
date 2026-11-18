import { expect, test } from "bun:test";
import { createGame } from "../state";
import { Ending, type RoomLog } from "./ending";
import { Frame } from "./frame";

const frame = (width: number, height: number) => {
  const made = new Frame();
  made.resize(width, height);
  return made;
};
const WIDE = frame(320, 180);
const PHONE = frame(195, 422);

/** A single player's dive of ten prompts, the third and eighth lost to the air, the fifth the rarest. */
function dive() {
  const rarities = [70, 22, 0, 38, 92, 8, 85, 0, 45, 20];
  return {
    ...createGame(),
    phase: "done" as const,
    prompts: rarities.map((_, i) => ({ id: `p${i}`, text: `prompt ${i}`, pack: "Geography" })),
    results: rarities.map((rarity) => ({ answer: rarity ? "an answer" : "", rarity, correct: rarity > 0 })),
  };
}

test("the focus starts on the rarest lamp, and Left and Right stop at the ends", () => {
  const ending = new Ending(dive());
  expect(ending.focus).toEqual({ line: 0, lamp: 4 });
  expect(ending.focused?.rarity).toBe(92);
  for (let i = 0; i < 9; i++) ending.move("right", WIDE);
  expect(ending.focus).toEqual({ line: 0, lamp: 9 });
  expect(ending.move("right", WIDE)).toBe(false);
});

test("on a wide screen Down goes from the lamps to the line back and round to the lamps", () => {
  const ending = new Ending(dive());
  ending.move("down", WIDE);
  expect(ending.focus).toBe("back");
  expect(ending.focused).toBeNull();
  ending.move("down", WIDE);
  expect(ending.focus).toEqual({ line: 0, lamp: 0 });
  ending.move("up", WIDE);
  expect(ending.focus).toBe("back");
});

test("on a phone the lamps hang in rows of five, and Down keeps the column", () => {
  const ending = new Ending(dive());
  ending.move("left", PHONE);
  ending.move("left", PHONE);
  expect(ending.focus).toEqual({ line: 0, lamp: 2 });
  ending.move("down", PHONE);
  expect(ending.focus).toEqual({ line: 0, lamp: 7 });
  ending.move("down", PHONE);
  expect(ending.focus).toBe("back");
});

test("a dive with nothing asked has only the line back", () => {
  expect(new Ending({ ...createGame(), phase: "done" }).focus).toBe("back");
});

test("in a room the rows go by place, and the focus starts in the row of the diver followed", () => {
  const diver = (id: number, place: number, rarities: number[]): RoomLog["divers"][number] => ({
    id, place, name: `d${id}`, suit: 0, depth: 0, won: place === 1, points: 0, out: null,
    lamps: rarities.map((rarity) => ({ depth: 0, lit: rarity > 0 })),
    said: rarities.map((rarity) => ({ prompt: "p", answer: rarity ? "a" : null, rarity })),
  });
  const log: RoomLog = { mode: "deepest", divers: [diver(1, 2, [10, 50]), diver(2, 1, [30, 0, 90])] };
  const ending = new Ending(log, 1);
  expect(ending.focus).toEqual({ line: 1, lamp: 1 });
  ending.move("up", WIDE);
  expect(ending.focus).toEqual({ line: 0, lamp: 1 });
  ending.move("right", WIDE);
  ending.move("right", WIDE);
  ending.move("down", WIDE);
  expect(ending.focus).toEqual({ line: 1, lamp: 1 });
});
