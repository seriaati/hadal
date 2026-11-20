import { expect, test } from "bun:test";
import { Ambient, SCARE, WIDE } from "./creatures";
import { DRAWN } from "./drawn";
import { Frame, type Light } from "./frame";

test("beside an anglerfish at 1,200 m, nothing else gives light", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  // At 1,200 m only a squid, which gives no light, and an anglerfish, never while another is about, can come.
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

test("the giant anglerfish comes in every chaos dive, and lets the diver go", () => {
  const [width, height] = [300, 200];
  const ambient = new Ambient();
  ambient.chaos = true;
  ambient.diving = true;
  let came = false;
  for (let second = 0; second < 20; second++) {
    ambient.update(1, 100, 0, width, height, 0);
    came ||= ambient.creatures.some((creature) => creature.kind === "leviathan");
  }
  expect(came).toBe(true);
  for (let second = 0; second < 20; second++) ambient.update(1, 100, 0, width, height, 0);
  expect(ambient.creatures.some((creature) => creature.kind === "leviathan")).toBe(false);
});

test("the giant anglerfish never comes to a normal dive, however deep", () => {
  const ambient = new Ambient();
  ambient.diving = true;
  for (let second = 0; second < 120; second++) ambient.update(1, 9000, 0, 300, 200, 0);
  expect(ambient.creatures.some((creature) => creature.kind === "leviathan")).toBe(false);
});

test("the screen cuts to dark once its mouth is wide open, and its face comes back out of the dark", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  ambient.chaos = true;
  ambient.spawn("leviathan", width, height, 7000);
  ambient.update(WIDE + 0.3, 7000, 0, width, height, 0);
  frame.color.fill(5);
  ambient.drawNear(frame, new Uint8Array(height), [], () => false);
  expect(frame.color.every((color) => color === 0)).toBe(true);
  expect(frame.shade.every((shade) => shade === 255)).toBe(true);
  ambient.update(SCARE + 0.1 - (WIDE + 0.3), 7000, 0, width, height, 0);
  ambient.drawNear(frame, new Uint8Array(height), [], () => false);
  expect(frame.color.some((color) => color !== 0)).toBe(true);
});

test("the creatures NekuMeow drew keep to their own depths", () => {
  const seen = (depth: number) => {
    const ambient = new Ambient();
    const kinds = new Set<string>();
    for (let second = 0; second < 600; second++) {
      ambient.update(1, depth, 0, 320, 180, 0);
      for (const creature of ambient.creatures) kinds.add(creature.kind);
    }
    return kinds;
  };
  const shallow = seen(300);
  expect(["nautilus", "angel", "dragon"].some((kind) => shallow.has(kind))).toBe(true);
  expect(shallow.has("squid") || shallow.has("dumbo")).toBe(false);
  const abyss = seen(5000);
  expect(abyss.has("dumbo")).toBe(true);
  expect(["nautilus", "angel", "dragon", "squid"].some((kind) => abyss.has(kind))).toBe(false);
});

test("each creature NekuMeow drew keeps one size through its frames, in the palette's colours", () => {
  for (const { frames, glow } of Object.values(DRAWN)) {
    const [width, height] = [frames[0]![0]!.length, frames[0]!.length];
    for (const rows of frames) {
      expect(rows).toHaveLength(height);
      for (const row of rows) expect(row).toMatch(new RegExp(`^[.0-7tTmwrRoacvxgGl]{${width}}$`));
    }
    expect(glow).toMatch(/^[0-7tTmwrRoacvxgGl]*$/);
  }
});

test("a creature NekuMeow drew is never drawn above the water", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  ambient.update(0, 0, 0, width, height, 60);
  ambient.spawn("nautilus", width, height, 300);
  ambient.creatures[0]!.x = 20;
  ambient.creatures[0]!.y = 45;
  ambient.draw(frame, new Uint8Array(height).fill(3), 0, [], () => false);
  expect(frame.color.subarray(0, 60 * width).some((color) => color !== 0)).toBe(false);
  expect(frame.color.subarray(60 * width).some((color) => color !== 0)).toBe(true);
});

test("the dumbo octopus only looks in for a while, then backs away", () => {
  const [width, height] = [320, 180];
  const ambient = new Ambient();
  ambient.spawn("dumbo", width, height, 5000);
  const dumbo = ambient.creatures[0]!;
  for (let second = 0; second < 9; second++) ambient.update(1, 5000, 0, width, height, 0);
  const resting = dumbo.x;
  expect(resting).toBeLessThan(width - 20);
  ambient.update(0.5, 5000, 0, width, height, 0);
  expect(dumbo.x).toBe(resting);
  for (let second = 0; second < 30; second++) ambient.update(1, 5000, 0, width, height, 0);
  expect(ambient.creatures.includes(dumbo)).toBe(false);
});

test("a creature that rises out of the sea leaves no glow in the sky", () => {
  const [width, height] = [300, 200];
  const frame = new Frame();
  frame.resize(width, height);
  const ambient = new Ambient();
  ambient.update(0, 0, 0, width, height, 60);
  ambient.spawn("angel", width, height, 300);
  const angel = ambient.creatures[0]!;
  // Half out of the water, its glowing gut above the surface.
  angel.y = 48;
  const lights: Light[] = [];
  ambient.draw(frame, new Uint8Array(height).fill(3), 0, lights, () => false);
  expect(lights).toHaveLength(0);
  // Wholly out of it, it is gone.
  angel.y = 30;
  ambient.update(0, 0, 0, width, height, 60);
  expect(ambient.creatures.includes(angel)).toBe(false);
});
