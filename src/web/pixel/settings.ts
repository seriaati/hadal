import { LEVELS, type Sound } from "../sound";
import type { Frame } from "./frame";
import type { Part, Step } from "./ui";

const COG = [
  "....66....", ".66.66.66.", ".66666666.", "..666666..", "6666..6666",
  "6666..6666", "..666666..", ".66666666.", ".66.66.66.", "....66....",
];

export function drawCog(frame: Frame) {
  frame.sprite(COG, frame.width - 13, 1);
}

/** With room around the cog for a fingertip. */
export function overCog(frame: Frame, x: number, y: number): boolean {
  return x >= frame.width - 18 && y < 15;
}

export function settingsStep(sound: Sound): Step {
  return {
    title: "Settings",
    rows: LEVELS.map((name): Part => ({
      kind: "slider",
      id: name,
      label: name,
      value: sound.levels[name],
      set: (value) => {
        sound.setLevel(name, value);
        sound.tick();
      },
    })),
  };
}
