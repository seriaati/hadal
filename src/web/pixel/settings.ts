import { LEVELS, type Sound } from "../sound";
import type { Frame } from "./frame";
import type { Part, Step } from "./ui";

const COG = [
  "....66....", ".66.66.66.", ".66666666.", "..666666..", "6666..6666",
  "6666..6666", "..666666..", ".66666666.", ".66.66.66.", "....66....",
];

/** The only control on screen: a cog in the top right corner, which opens the settings. Escape opens them too. */
export function drawCog(frame: Frame) {
  frame.sprite(COG, frame.width - 13, 1);
}

/** Whether a point of the frame is on the cog, with room around it for a fingertip. */
export function overCog(frame: Frame, x: number, y: number): boolean {
  return x >= frame.width - 18 && y < 15;
}

/** The settings: a slider for each sound level. The game goes on behind them. */
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
