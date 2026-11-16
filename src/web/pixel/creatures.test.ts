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
  for (let second = 0; second < 8; second++) ambient.update(1, 1200, 0, width, height);

  const lights: Light[] = [];
  ambient.draw(frame, new Uint8Array(height), 0, lights);
  expect(lights).toHaveLength(1);
  expect(Number.isFinite(lights[0]!.y)).toBe(true);
});
