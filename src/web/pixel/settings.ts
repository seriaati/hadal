import { LEVELS, type Level, type Sound } from "../sound";
import { FONTS, drawText } from "./font";
import type { Frame } from "./frame";

const COG = [
  "....66....", ".66.66.66.", ".66666666.", "..666666..", "6666..6666",
  "6666..6666", "..666666..", ".66666666.", ".66.66.66.", "....66....",
];
const WIDTH = 112;
const HEIGHT = 70;
const PAD = 7;
const ROW = 13;
const TRACK = 60;

/** Where the panel is: in the middle of the frame. `rows` is the top of its first slider's row. */
function place(frame: Frame) {
  const left = Math.round((frame.width - WIDTH) / 2);
  const top = Math.round((frame.height - HEIGHT) / 2);
  return { left, top, rows: top + PAD + 12, track: left + WIDTH - PAD - TRACK };
}

/**
 * The only controls on screen: a cog in the top right corner, which opens a panel in the
 * middle of the screen with a slider for each sound level. The game goes on behind it.
 */
export class Settings {
  open = false;
  private held: Level = "master";

  constructor(private sound: Sound) {}

  /** A press at a point of the frame. True if it took hold of a slider, which then follows the pointer. */
  press(frame: Frame, x: number, y: number): boolean {
    const { left, top, rows, track } = place(frame);
    if (x >= frame.width - 18 && y < 15) {
      this.open = !this.open; // the cog, with room around it for a fingertip
    } else if (this.open && x >= left && x < left + WIDTH && y >= top && y < top + HEIGHT) {
      const row = Math.floor((y - rows + 4) / ROW);
      this.held = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, row))]!;
      return x >= track - 4;
    } else {
      this.open = false;
    }
    return false;
  }

  drag(frame: Frame, x: number) {
    this.sound.setLevel(this.held, Math.max(0, Math.min(1, (x - place(frame).track) / (TRACK - 1))));
  }

  draw(frame: Frame) {
    // With the panel open, the game behind it is dimmed: every other pixel goes dark.
    if (this.open) for (let y = 0; y < frame.height; y++) for (let x = (y & 1) ^ 1; x < frame.width; x += 2) frame.put(x, y, 0);
    frame.sprite(COG, frame.width - 13, 1);
    if (!this.open) return;
    const { left, top, rows, track } = place(frame);
    frame.block = 255; // the soft light of the scene stays off the panel
    for (let y = top; y < top + HEIGHT; y++) {
      for (let x = left; x < left + WIDTH; x++) {
        const edge = x === left || x === left + WIDTH - 1 || y === top || y === top + HEIGHT - 1;
        frame.put(x, y, edge ? 5 : 0);
      }
    }
    drawText(frame, FONTS.tiny, "Settings", left + PAD, top + PAD, 7);
    LEVELS.forEach((name, i) => {
      const y = rows + i * ROW;
      const knob = track + Math.round(this.sound.levels[name] * (TRACK - 1));
      drawText(frame, FONTS.tiny, name, left + PAD, y, 6);
      for (let x = track; x < track + TRACK; x++) frame.put(x, y + 2, x <= knob ? 6 : 4);
      for (let j = -1; j < 6; j++) frame.put(knob, y + j, 7);
    });
    frame.block = -1;
  }
}
