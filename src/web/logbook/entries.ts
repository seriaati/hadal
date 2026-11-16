import { METERS_PER_POINT } from "../../shared/types";
import { formatMeters, zoneAt } from "../depth";
import type { Game } from "../state";
import {
  DISPLAY, GLAZE, GRAPHITE, INK, RED, RUST, TYPED,
  blob, createSheet, ink, newCanvas, pencil, ring, rnd, shrunk, speckle, txt, wash, wrap, type Lettering, type Sheet,
} from "./sketch";

const STAMP_RED = "#b03a26";
const NARROW_W = 360;
const NARROW_PROMPT: Lettering = { font: TYPED, size: 14, fill: "#6a5a4a", jit: 0 };
const NARROW_ANSWER = { size: 28, weight: 700, jit: 0.6 } satisfies Lettering;

/** A ring where a mug stood. */
function mugRing(paint: CanvasRenderingContext2D, x: number, y: number) {
  paint.save();
  paint.globalCompositeOperation = "multiply";
  paint.strokeStyle = "#8a5426";
  paint.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const rim = blob(x + rnd(-0.6, 0.6), y + rnd(-0.6, 0.6), 37 + rnd(-1.2, 1.2), 36, 40, 0.01);
    const start = Math.floor(rnd(rim.length));
    paint.globalAlpha = rnd(0.08, 0.2);
    paint.lineWidth = rnd(0.8, 3.6);
    paint.beginPath();
    for (let k = 0; k < rim.length * rnd(0.5, 0.92); k++) paint.lineTo(...rim[(start + k) % rim.length]!);
    paint.stroke();
  }
  paint.restore();
}

/** A rubber stamp naming the deepest zone reached, its middle at (x, y). It is inked unevenly, so it is worn away on a canvas of its own. */
function stampZone(dark: CanvasRenderingContext2D, x: number, y: number, zone: string) {
  const size = 170;
  const stamp = newCanvas(undefined, size, size);
  stamp.save();
  stamp.translate(size / 2, size / 2);
  stamp.rotate((-11 * Math.PI) / 180);
  stamp.strokeStyle = stamp.fillStyle = STAMP_RED;
  for (const [radius, width] of [[60, 3], [39, 1.4]] as const) {
    stamp.lineWidth = width;
    stamp.beginPath();
    stamp.arc(0, 0, radius, 0, 7);
    stamp.stroke();
  }
  stamp.clearRect(-76, -19, 152, 38);
  stamp.lineWidth = 2.4;
  stamp.strokeRect(-76, -19, 152, 38);
  stamp.textAlign = "center";
  stamp.font = `11.5px "${TYPED}", monospace`;
  // Words around the rim, a letter at a time: across the top, then back along the bottom.
  for (const [words, radius] of [["THE KETTLE", -45], ["DEEPEST ZONE", 54]] as const) {
    const step = -9.2 / radius;
    [...words].forEach((letter, k) => {
      stamp.save();
      stamp.rotate((k - (words.length - 1) / 2) * step);
      stamp.fillText(letter, 0, radius);
      stamp.restore();
    });
  }
  stamp.font = `24px "${TYPED}", monospace`;
  stamp.letterSpacing = "1px";
  stamp.fillText(zone.toUpperCase(), 0, 9);
  stamp.restore();
  speckle(stamp, "destination-out", 0.9, 2.5, size, size);
  dark.drawImage(stamp.canvas, x - size / 2, y - size / 2, size, size);
}

/** The number of a prompt, in a lamp that is lit if the prompt was answered. */
function lampMark({ paint, dark }: Sheet, x: number, y: number, number: number, lit: boolean) {
  if (lit) {
    wash(paint, blob(x, y, 11, 11), "#fbd266", { ...GLAZE, s: 0.7, v: 0.2, seg: 5, edge: 0.3, layers: 10 });
    ink(dark, ring(x, y, 11, 11, { n: 10, over: 25 }), { w: 1.3 });
  } else {
    pencil(dark, ring(x, y, 11, 11, { over: 10 }), { n: 2, w: 1 });
  }
  txt(dark, x, y + 5.5, String(number), { font: DISPLAY, size: 15, anchor: "middle", fill: lit ? INK : GRAPHITE, jit: 0 });
}

/** The way back to the title. */
function turnThePage(dark: CanvasRenderingContext2D, x: number, y: number, how: string) {
  txt(dark, x, y, "turn the page", { size: 36, weight: 700, fill: RUST, rot: -3 });
  txt(dark, x + 26, y + 26, how, { size: 22, fill: GRAPHITE, rot: -3 });
  ink(dark, [[x + 188, y - 14], [x + 230, y - 10], [x + 260, y + 10]], { w: 2.4, color: RUST });
  ink(dark, [[x + 247, y + 12], [x + 262, y + 13], [x + 262, y - 2]], { w: 2.2, color: RUST });
}

/** The right page: the written log, with the depth reached and one entry for every prompt. It stops at every `yield`. */
export function* drawEntries(game: Game, narrow: boolean): Generator<void, Sheet> {
  return yield* (narrow ? narrowEntries(game) : wideEntries(game));
}

function* wideEntries(game: Game): Generator<void, Sheet> {
  const sheet = yield* createSheet();
  const { paint, dark } = sheet;
  yield;
  mugRing(paint, 92, 704);
  yield;

  // ---- how the dive ended
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  txt(dark, 40, 52, `${day}, aboard the Kettle`, { size: 25 });
  txt(dark, 40, 100, "the line ended at", { size: 24 });
  txt(dark, 40, 160, formatMeters(game.depth), { font: DISPLAY, size: 60, jit: 0 });
  ink(dark, [[40, 172], [150, 170], [300, 173]], { w: 1.8 });
  ink(dark, [[50, 178], [160, 176], [288, 178]], { w: 1.1 });
  stampZone(dark, 478, 112, zoneAt(game.depth).replace(" zone", ""));
  yield;

  // ---- one entry for every prompt: what came down the wire, and what was answered
  game.prompts.forEach((prompt, i) => {
    const result = game.results[i]!;
    const top = 194 + i * 48;
    lampMark(sheet, 54, top + 22, i + 1, result.correct);
    txt(dark, 78, top + 13, `${prompt.pack.toUpperCase()}  ·  ${prompt.text}`, { font: TYPED, size: 11, ls: 0.3, fill: "#6a5a4a", jit: 0 });
    if (result.correct) {
      // Written as tall as the hand's own capitals and no taller, or it would reach into the prompt above it.
      txt(dark, 78, top + 36, result.answer, shrunk(dark, result.answer, 19, { size: 27, weight: 700, jit: 0.6 }));
      txt(dark, 558, top + 36, `+${formatMeters(result.rarity * METERS_PER_POINT)}`, { size: 25, weight: 700, anchor: "end", jit: 0 });
    } else {
      txt(dark, 78, top + 36, "out of air", { size: 26, weight: 600, fill: RED });
      txt(dark, 558, top + 36, "no light", { size: 19, anchor: "end", fill: GRAPHITE });
    }
    pencil(dark, [[40, top + 43], [560, top + 42]], { n: 1, opacity: 0.3, w: 0.7 });
  });
  yield;

  turnThePage(dark, 300, 714, "click, or press Enter");
  return sheet;
}

/** The same log for an upright screen: a narrower page with larger writing, as long as it needs to be. */
function* narrowEntries(game: Game): Generator<void, Sheet> {
  const [left, right, text] = [22, NARROW_W - 22, 56];
  // Every prompt and answer is written over as many lines as it takes, so the lines are counted before the paper is cut.
  const pen = newCanvas(1, 1, 1);
  const rows = game.prompts.map((prompt, i) => {
    const result = game.results[i]!;
    const prompts = wrap(pen, prompt.text, right - text, NARROW_PROMPT);
    const hand = shrunk(pen, result.answer, 20, NARROW_ANSWER);
    const answers = result.correct ? wrap(pen, result.answer, right - text - 100, hand) : ["out of air"];
    return { prompt, result, prompts, answers, hand, height: 91 + (prompts.length - 1) * 18 + (answers.length - 1) * 30 };
  });
  const foot = 290 + rows.reduce((sum, row) => sum + row.height, 0);
  const sheet = yield* createSheet(NARROW_W, foot + 64);
  const { paint, dark } = sheet;
  yield;
  mugRing(paint, 300, foot - 4);
  yield;

  // ---- how the dive ended
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  txt(dark, left, 50, `${day},`, { size: 25 });
  txt(dark, left, 78, "aboard the Kettle", { size: 25 });
  stampZone(dark, 268, 78, zoneAt(game.depth).replace(" zone", ""));
  txt(dark, left, 138, "the line ended at", { size: 24 });
  txt(dark, left, 196, formatMeters(game.depth), { font: DISPLAY, size: 58, jit: 0 });
  ink(dark, [[left, 208], [130, 206], [282, 209]], { w: 1.8 });
  ink(dark, [[left + 10, 214], [140, 212], [270, 214]], { w: 1.1 });
  yield;

  // ---- one entry for every prompt
  let top = 240;
  rows.forEach(({ prompt, result, prompts, answers, hand, height }, i) => {
    lampMark(sheet, left + 12, top + 24, i + 1, result.correct);
    txt(dark, text, top + 12, prompt.pack.toUpperCase(), { font: TYPED, size: 11, ls: 1, fill: "#6a5a4a", jit: 0 });
    prompts.forEach((line, k) => txt(dark, text, top + 31 + k * 18, line, NARROW_PROMPT));
    const written = top + height - 26;
    answers.forEach((line, k) => {
      const y = written - (answers.length - 1 - k) * 30;
      if (result.correct) txt(dark, text, y, line, hand);
      else txt(dark, text, y, line, { size: 27, weight: 600, fill: RED });
    });
    if (result.correct) txt(dark, right, written, `+${formatMeters(result.rarity * METERS_PER_POINT)}`, { size: 25, weight: 700, anchor: "end", jit: 0 });
    else txt(dark, right, written, "no light", { size: 20, anchor: "end", fill: GRAPHITE });
    pencil(dark, [[left, top + height - 16], [right, top + height - 17]], { n: 1, opacity: 0.3, w: 0.7 });
    top += height;
  });
  yield;

  turnThePage(dark, 30, foot, "tap anywhere");
  return sheet;
}
