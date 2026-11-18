import { expect, test } from "bun:test";
import { Ambient } from "./creatures";
import { Frame, type Light } from "./frame";

test("when no kind of creature can arrive, nothing does", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  // At 1,200 m only an anglerfish can appear, and never while another large creature is about.
  ambient.spawn("angler", width, height, 1200);
  for (let second = 0; second < 8; second++) ambient.update(1, 1200, 0, width, height, 0);

  const lights: Light[] = [];
  ambient.draw(frame, new Uint8Array(height), 0, lights, () => false);
  expect(lights).toHaveLength(1);
  expect(Number.isFinite(lights[0]!.y)).toBe(true);
});

test("shoals of fish and whales keep to the upper sea", () => {
  const [width, height] = [300, 200];
  const kinds = (depth: number) => {
    const ambient = new Ambient();
    for (let second = 0; second < 120; second++) ambient.update(1, depth, 0, width, height, 0);
    return new Set(ambient.creatures.map((creature) => creature.kind));
  };
  expect(kinds(100).has("fish")).toBe(true);
  expect([...kinds(3000)].some((kind) => kind === "fish" || kind === "whale")).toBe(false);
});

test("a whale is never drawn above the water", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  ambient.update(0, 0, 0, width, height, 60);
  ambient.spawn("whale", width, height, 0);
  ambient.creatures[0]!.x = 20;
  ambient.creatures[0]!.y = 40;
  ambient.draw(frame, new Uint8Array(height).fill(4), 0, [], () => false);
  expect(frame.color.subarray(0, 60 * width).some((color) => color !== 0)).toBe(false);
  expect(frame.color.subarray(60 * width).some((color) => color !== 0)).toBe(true);
});
