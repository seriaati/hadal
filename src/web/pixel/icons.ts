import type { Frame } from "./frame";

const COG = [
  "....66....", ".66.66.66.", ".66666666.", "..666666..", "6666..6666",
  "6666..6666", "..666666..", ".66666666.", ".66.66.66.", "....66....",
];

const KEY = [
  "..........", "..........", "..........", ".666......", "6...6.....",
  "6...666666", "6...6..6.6", ".666...6.6", "..........", "..........",
];

// A turning arrow, in amber so a new version is noticed.
const UPDATE = [
  "...aaaa..a", ".aa....a.a", ".a......aa", "a.....aaaa", "a.........",
  "a.........", "a........a", ".a......a.", ".aa....aa.", "...aaaa...",
];

/** The icons at the top right stand in slots counted from the right edge: the cog always in the first. */
const SLOT = 14;

function drawIcon(frame: Frame, rows: string[], slot: number, glow?: string) {
  frame.sprite(rows, frame.width - 13 - slot * SLOT, 1, glow);
}

/** With room around each icon for a fingertip. */
export function overIcon(frame: Frame, x: number, y: number, slot: number): boolean {
  const left = frame.width - 18 - slot * SLOT;
  return y < 15 && x >= left && (slot === 0 || x < left + SLOT);
}

export const drawCog = (frame: Frame) => drawIcon(frame, COG, 0);
export const drawAdmin = (frame: Frame) => drawIcon(frame, KEY, 1);
export const drawUpdate = (frame: Frame, slot: number) => drawIcon(frame, UPDATE, slot, "a");
