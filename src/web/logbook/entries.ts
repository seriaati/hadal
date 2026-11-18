import { METERS_PER_POINT } from "../../shared/types";
import { formatMeters, zoneAt } from "../depth";
import type { Game } from "../state";
import { SUIT_WASH, isRoom, type Log, type RoomLog } from "./log";
import {
  DISPLAY, GLAZE, GRAPHITE, INK, RED, RUST, TYPED,
  blob, createSheet, fitted, ink, newCanvas, pencil, ring, rnd, shrunk, speckle, txt, wash, widthOf, wrap, type Lettering, type Sheet,
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

/**
 * The right page: the written log, with the depth reached and one entry for every prompt; in a room, who won and
 * one entry for every diver. It stops at every `yield`.
 */
export function* drawEntries(log: Log, narrow: boolean): Generator<void, Sheet> {
  if (isRoom(log)) return yield* roomEntries(log, narrow);
  return yield* (narrow ? narrowEntries(log) : wideEntries(log));
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

const TYPED_SMALL: Lettering = { font: TYPED, size: 11, ls: 0.3, fill: "#6a5a4a", jit: 0 };

/** One diver's entry in a room's log: what is written of them, worked out once for either width of page. */
function entryOf(log: RoomLog, diver: RoomLog["divers"][number]) {
  const lit = diver.said.filter((said) => said.answer !== null);
  const rarest = lit.reduce<(typeof lit)[number] | null>((best, said) => (best && best.rarity >= said.rarity ? best : said), null);
  const lasted = log.mode === "longest" ? (diver.out === null ? "still in" : `out at prompt ${diver.out}`) : "";
  // Each fact keeps its words together (no-break spaces) when the line wraps on a narrow page.
  const facts = [`${diver.points} points`, `${lit.length} of ${diver.said.length} lamps lit`, lasted].filter(Boolean).map((fact) => fact.replaceAll(" ", "\u00a0")).join("  ·  ");
  return { diver, rarest, facts };
}

/** Words cut short, with an ellipsis, until they are no wider than `width`. */
function cut(ctx: CanvasRenderingContext2D, words: string, width: number, o: Lettering): string {
  if (widthOf(ctx, words, o) <= width) return words;
  while (words.length > 1 && widthOf(ctx, `${words}…`, o) > width) words = words.slice(0, -1);
  return `${words.trimEnd()}…`;
}

/** Who won, in the mode's words: "ana went deepest", "ana and ben lasted longest". */
function winnersOf(log: RoomLog): { names: string; words: string; depth: number } {
  const won = log.divers.filter((diver) => diver.won);
  const list = won.map((diver) => diver.name);
  const names = list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return { names, words: log.mode === "deepest" ? "went deepest" : "lasted longest", depth: Math.max(0, ...won.map((diver) => diver.depth)) };
}

/** A room's log: who won, with the zone the winner reached, and one entry for every diver in the order they finished. */
function* roomEntries(log: RoomLog, narrow: boolean): Generator<void, Sheet> {
  const entries = log.divers.toSorted((a, b) => a.place - b.place).map((diver) => entryOf(log, diver));
  const { names, words, depth } = winnersOf(log);
  const [left, right] = narrow ? [22, NARROW_W - 22] : [40, 560];
  const text = left + 38;
  const row = narrow ? 128 : 84;
  const head = narrow ? 236 : 196;
  const foot = head + entries.length * row + (narrow ? 30 : 0);
  const sheet = yield* createSheet(narrow ? NARROW_W : undefined, narrow ? foot + 64 : undefined);
  const { paint, dark } = sheet;
  yield;
  if (narrow) mugRing(paint, 300, foot - 4);
  else mugRing(paint, 92, 704);
  yield;

  // ---- who won
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  if (narrow) {
    txt(dark, left, 50, `${day},`, { size: 25 });
    txt(dark, left, 78, "aboard the Kettle", { size: 25 });
    stampZone(dark, 268, 78, zoneAt(depth).replace(" zone", ""));
  } else {
    txt(dark, left, 52, `${day}, aboard the Kettle`, { size: 25 });
    stampZone(dark, 478, 112, zoneAt(depth).replace(" zone", ""));
  }
  const at = narrow ? 138 : 100;
  txt(dark, left, at, words, { size: 24 });
  const name = fitted(dark, names, narrow ? 300 : 360, { font: DISPLAY, size: narrow ? 50 : 54, jit: 0 });
  txt(dark, left, at + 56, names, name);
  ink(dark, [[left, at + 68], [left + 110, at + 66], [left + 260, at + 69]], { w: 1.8 });
  ink(dark, [[left + 10, at + 74], [left + 120, at + 72], [left + 248, at + 74]], { w: 1.1 });
  yield;

  // ---- one entry for every diver: their place, name and depth, what they scored, and their rarest light
  entries.forEach(({ diver, rarest, facts }, i) => {
    const top = head + i * row;
    lampMark(sheet, left + 14, top + 24, diver.place, diver.won);
    wash(paint, blob(text + 5, top + 21, 5, 5), SUIT_WASH[diver.suit]!, { ...GLAZE, s: 0.75, v: 0.1, seg: 5, edge: 0.3 });
    const hand = shrunk(dark, diver.name, 19, { size: 27, weight: 700, jit: 0.6 });
    txt(dark, text + 16, top + 30, diver.name, hand);
    txt(dark, right, top + 30, formatMeters(diver.depth), { size: 25, weight: 700, anchor: "end", jit: 0 });
    const lines = narrow ? wrap(dark, facts, right - text, TYPED_SMALL) : [facts];
    lines.forEach((line, k) => txt(dark, text, top + 48 + k * 15, line, TYPED_SMALL));
    const y = top + 48 + lines.length * 15 + 8;
    if (rarest) {
      txt(dark, text, y, "RAREST", { ...TYPED_SMALL, size: 9, ls: 1 });
      const answer = fitted(dark, rarest.answer!, right - text - 42, { size: 21, weight: 700, jit: 0.4 });
      const after = text + 46 + widthOf(dark, rarest.answer!, answer);
      txt(dark, text + 42, y + 1, rarest.answer!, answer);
      // Beside the answer on a wide page; on a narrow one, on a line of its own under it.
      if (narrow) txt(dark, text, y + 18, cut(dark, rarest.prompt, right - text, TYPED_SMALL), TYPED_SMALL);
      else if (after + 40 < right) txt(dark, after + 8, y, cut(dark, rarest.prompt, right - after - 8, TYPED_SMALL), TYPED_SMALL);
    } else {
      txt(dark, text, y + 1, "no lamp lit", { size: 21, weight: 600, fill: RED });
    }
    pencil(dark, [[left, top + row - 6], [right, top + row - 7]], { n: 1, opacity: 0.3, w: 0.7 });
  });
  yield;

  if (narrow) turnThePage(dark, 30, foot, "tap anywhere");
  else turnThePage(dark, 300, 734, "click, or press Enter");
  return sheet;
}
