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

/** The icons at the top right stand in slots counted from the right edge, the cog always in the first, clear of the edges. */
const SIZE = 10;
const TOP = 4;
const RIGHT = 5;
const SLOT = SIZE + 5;
const leftOf = (frame: Frame, slot: number) => frame.width - RIGHT - SIZE - slot * SLOT;

/** Under the pointer an icon is lit as a line in focus is: cream, and glowing. */
const lit = (rows: string[]) => rows.map((row) => row.replace(/[^.]/g, "c"));

function drawIcon(frame: Frame, rows: string[], slot: number, hover: boolean, glow?: string) {
  frame.sprite(hover ? lit(rows) : rows, leftOf(frame, slot), TOP, hover ? "c" : glow);
}

/** With room around each icon for a fingertip; the first reaches the edges of the frame. */
export function overIcon(frame: Frame, x: number, y: number, slot: number): boolean {
  const left = leftOf(frame, slot) - 3;
  return y < TOP + SIZE + 4 && x >= left && (slot === 0 || x < left + SLOT);
}

export const drawCog = (frame: Frame, hover: boolean) => drawIcon(frame, COG, 0, hover);
export const drawAdmin = (frame: Frame, hover: boolean) => drawIcon(frame, KEY, 1, hover);
export const drawUpdate = (frame: Frame, slot: number, hover: boolean) => drawIcon(frame, UPDATE, slot, hover, "a");
