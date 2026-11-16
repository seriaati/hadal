import { formatMeters } from "../depth";
import type { Game } from "../state";
import {
  CREAM, DISPLAY, GLAZE, GRAPHITE, INK, PAGE_H, PAGE_W, RED, RUST, YELLOW,
  arc, blob, dot, edges, ink, lift, newCanvas, pencil, ring, rnd, txt, wash, type Pt, type Sheet,
} from "./sketch";

/** The depth ruler down the page, as [metres, y]. It is not to scale, so every zone gets room. */
const RULER: Pt[] = [[0, 84], [200, 150], [1000, 236], [4000, 424], [6000, 566], [11000, 738]];
const [Y0, Y200, Y1000, Y4000, Y6000, Y11000] = RULER.map(([, y]) => y) as [number, number, number, number, number, number];
const LINE_X = 250;
/** The baseline of everything written down the margin, from the top. */
const WRITTEN = RULER.map(([, y]) => y + 6);
const PALE_RED = "#f6b09a";

function yAt(depth: number): number {
  const i = Math.max(1, RULER.findIndex(([d]) => d >= depth));
  const [d0, y0] = RULER[i - 1]!;
  const [d1, y1] = RULER[i]!;
  return y0 + ((y1 - y0) * (depth - d0)) / (d1 - d0);
}

/** The outline of all the water from `top` down, with uneven sides. */
function seaShape(top: number, amp: number): Pt[] {
  const shape: Pt[] = [];
  for (let x = 10; x <= 590; x += 58) shape.push([x, top + Math.sin(x * 0.011 + top * 0.7) * amp]);
  for (const [x, y] of [[588, 160], [581, 240], [590, 330], [584, 420], [591, 500], [586, 575], [592, 628], [589, 692], [591, 748]] as Pt[]) {
    if (y > top + 24) shape.push([x + rnd(-4, 4), y]);
  }
  shape.push([430, 753 + rnd(-2, 2)], [220, 750 + rnd(-2, 2)], [11, 752]);
  for (const [x, y] of [[9, 640], [13, 520], [8, 400], [12, 280], [9, 170]] as Pt[]) {
    if (y > top + 24) shape.push([x + rnd(-2, 2), y]);
  }
  return shape;
}

const WHALE: Pt[] = [
  [384, 201], [394, 189], [420, 182], [456, 180], [492, 186], [516, 195], [535, 197], [553, 184], [561, 187], [553, 201],
  [559, 215], [549, 213], [535, 205], [510, 209], [480, 215], [462, 215], [455, 228], [444, 216], [410, 213], [392, 208],
];
/** The abyssal plain, and the trench cut into it. */
const BED_LEFT: Pt[] = [[6, 572], [38, 561], [70, 567], [100, 559], [136, 573], [158, 598], [174, 642], [194, 692], [212, 730], [226, 751], [120, 756], [8, 755]];
const BED_RIGHT: Pt[] = [
  [272, 751], [289, 712], [303, 668], [321, 626], [337, 598], [360, 581], [396, 573], [434, 561],
  [468, 567], [510, 557], [552, 563], [593, 553], [597, 640], [594, 753], [420, 757],
];
const ANGLER = { x: 520, y: 330 };
const EEL: Pt[] = [[590, 462], [556, 452], [522, 470], [486, 458], [452, 478], [416, 468], [384, 488], [356, 482], [338, 492]];

/** The left page: the dive painted as a cross-section of the sea, as far down as the diver went. It stops at every `yield`. */
export function* drawDive(sheet: Sheet, game: Game) {
  const { paint, dark, light } = sheet;

  // Where each lamp hangs on the line, starting clear of the tender's hull.
  const marks = game.lamps.map((hung) => Math.max(yAt(hung.depth), Y0 + 12));
  // Lamps hung too close together to number apart share one label.
  const runs: { from: number; to: number }[] = [];
  marks.forEach((y, i) => {
    const run = runs.at(-1);
    if (run && y - marks[run.to]! < 11) run.to = i;
    else runs.push({ from: i, to: i });
  });
  const diver = { x: LINE_X, y: Math.min(706, Math.max(yAt(game.depth), Y0 + 12) + 7) };
  const lantern = { x: diver.x + 19, y: diver.y + 33 };
  /** The paint stops a little below where the dive did: nothing further down was seen. */
  let bottom = diver.y + 96;
  // It never stops halfway through something written in the margin, and if it nearly fills the page, it does.
  for (const y of WRITTEN) if (bottom > y - 20 && bottom < y + 24) bottom = y + 24;
  if (bottom > 700) bottom = PAGE_H;
  const seen = (y: number) => y < bottom - 12;
  /** Below the sunlit water the paint is dark, and has to be drawn on in something light. */
  const pale = (y: number) => y > 190 && seen(y);

  const helmet = arc(diver.x, diver.y + 11, 10, 10, 0, 340, 14);
  const suit: Pt[] = [[diver.x - 10, diver.y + 21], [diver.x + 10, diver.y + 21], [diver.x + 8, diver.y + 38], [diver.x - 8, diver.y + 38]];
  const lamp: Pt[] = [[diver.x + 15, diver.y + 28], [diver.x + 23, diver.y + 29], [diver.x + 22, diver.y + 39], [diver.x + 14, diver.y + 38]];

  // ---- the sea, painted on its own sheet so that pigment can be lifted back out of it
  const sea = newCanvas(1);
  // Each zone is one more glaze laid over everything beneath it.
  wash(sea, seaShape(Y0, 2.5), "#9ad2c2", { s: 0.62, v: 0.16, layers: 26 });
  yield;
  wash(sea, seaShape(Y0 + 26, 6), "#6fbdb6", { s: 0.35, v: 0.5, edge: 0, layers: 30 });
  yield;
  wash(sea, seaShape(Y200, 4), "#3f95a6", { s: 0.62, v: 0.24 });
  yield;
  wash(sea, seaShape(Y200 + 42, 7), "#2f7895", { s: 0.4, v: 0.5, edge: 0, layers: 30 });
  yield;
  wash(sea, seaShape(Y1000, 4), "#1c4a82", { s: 0.78, v: 0.24 });
  yield;
  wash(sea, seaShape(Y1000 + 70, 8), "#163a70", { s: 0.55, v: 0.5, edge: 0, layers: 30 });
  yield;
  wash(sea, seaShape(Y1000 + 130, 8), "#122f62", { s: 0.5, v: 0.5, edge: 0, layers: 30 });
  yield;
  wash(sea, seaShape(Y4000, 4), "#0f2450", { s: 0.82, v: 0.24, edge: 0.35 });
  yield;
  wash(sea, seaShape(Y4000 + 70, 8), "#0b1a40", { s: 0.6, v: 0.5, edge: 0, layers: 30 });
  yield;
  wash(sea, seaShape(Y6000, 5), "#081230", { s: 0.72, v: 0.3 });
  yield;
  wash(sea, seaShape(Y6000 + 70, 8), "#060c22", { s: 0.62, v: 0.5, edge: 0, layers: 30 });
  yield;
  // Mottling, backruns, places where the brush ran dry.
  for (let i = 0; i < 34; i++) {
    const [x, y, r] = [rnd(30, 570), rnd(100, 730), rnd(12, 44)];
    if (i % 3 === 1) lift(sea, blob(x, y, r, r * rnd(0.35, 0.8)), rnd(0.04, 0.1), { v: 0.3, seg: 12, layers: 12 });
    else {
      const color = i % 3 === 0 ? (y < 240 ? "#2f7895" : "#0f2247") : y < 150 ? "#6fbdb6" : y < 240 ? "#2f7895" : y < 430 ? "#163a70" : "#0b1a40";
      wash(sea, blob(x, y, r, r * rnd(0.35, 0.8)), color, { s: rnd(0.08, 0.2), v: 0.3, seg: 12, edge: 0.08, layers: 12 });
    }
  }
  yield;
  // Specks where the paint missed the paper.
  sea.save();
  sea.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 170; i++) {
    sea.globalAlpha = rnd(0.25, 0.7);
    sea.beginPath();
    sea.ellipse(rnd(14, 584), rnd(90, 745), rnd(0.5, 2.2), rnd(0.4, 1.2), rnd(3), 0, 7);
    sea.fill();
  }
  sea.restore();
  // Light coming down through the top water.
  for (const [x, w, len] of [[90, 16, 150], [170, 10, 120], [330, 22, 170], [420, 9, 110], [505, 16, 140]] as const) {
    lift(sea, [[x, Y0 + 4], [x + w, Y0 + 4], [x + w + len * 0.34 + w, Y0 + len], [x + len * 0.34, Y0 + len]], 0.2, { v: 0.2, seg: 30 });
  }
  yield;
  // Something very large, far off in the twilight.
  wash(sea, WHALE, "#1d5270", { s: 0.72, v: 0.12, seg: 9, edge: 0.3 });
  wash(sea, WHALE.slice(9), "#123a56", { s: 0.3, v: 0.2, seg: 9, edge: 0 });
  // The sea floor.
  const sink = (bed: Pt[], dy: number) => bed.map(([x, y]): Pt => [x, y < 745 ? y + dy : y]);
  for (const bed of [BED_LEFT, BED_RIGHT]) {
    lift(sea, bed, 0.5, { v: 0.14, seg: 12 });
    wash(sea, bed, "#6a4530", { s: 0.82, v: 0.14, seg: 12, edge: 0.4, edgeW: 1.6 });
    yield;
    wash(sea, sink(bed, 26), "#3a2424", { s: 0.45, v: 0.45, seg: 14, edge: 0, layers: 30 });
    wash(sea, sink(bed, 70), "#261a22", { s: 0.45, v: 0.5, seg: 14, edge: 0, layers: 30 });
    wash(sea, sink(bed, 120), "#1a1420", { s: 0.4, v: 0.5, seg: 14, edge: 0, layers: 30 });
    yield;
  }
  // Lamplight: lift the pigment around every light, leaving the paper to glow through.
  for (const [rx, ry, s] of [[72, 62, 0.18], [56, 49, 0.32], [42, 37, 0.5], [30, 27, 0.6]] as const) {
    lift(sea, blob(lantern.x, lantern.y, rx, ry, 14), s, { v: 0.3, seg: 16, layers: 30 });
  }
  game.lamps.forEach((hung, i) => {
    if (hung.lit) lift(sea, blob(LINE_X, marks[i]!, 11, 10), 0.5, { v: 0.3, seg: 6, layers: 10 });
  });
  lift(sea, blob(ANGLER.x - 34, ANGLER.y - 19, 17, 15), 0.5, { v: 0.4, seg: 8 });
  lift(sea, blob(ANGLER.x - 34, ANGLER.y - 19, 6, 6), 0.9, { v: 0.2, seg: 4 });
  // The diver is masked out, so that the copper sits on clean paper.
  lift(sea, helmet, 0.985, { v: 0.03, seg: 6, layers: 10 });
  lift(sea, suit, 0.97, { v: 0.05, seg: 6, layers: 8 });
  lift(sea, lamp, 0.97, { v: 0.05, seg: 6, layers: 8 });
  yield;
  // The paint runs out where the dive did.
  if (bottom < PAGE_H) {
    const edge: Pt[] = [];
    for (let x = -10; x <= PAGE_W + 10; x += 62) edge.push([x, bottom + Math.sin(x * 0.013 + bottom) * 5]);
    lift(sea, [...edge, [PAGE_W + 10, PAGE_H + 20], [-10, PAGE_H + 20]], 0.99, { v: 0.2, seg: 20, layers: 26 });
    sea.clearRect(0, bottom + 26, PAGE_W, PAGE_H);
  }
  paint.globalCompositeOperation = "multiply";
  paint.drawImage(sea.canvas, 0, 0, PAGE_W, PAGE_H);
  paint.globalCompositeOperation = "source-over";
  yield;

  // ---- glazes that go on once the sea is dry
  wash(paint, [[14, 18], [300, 10], [588, 22], [590, 80], [300, 84], [12, 82]], "#f6d9a4", { ...GLAZE, s: 0.3, v: 0.5, seg: 36, edge: 0 });
  wash(paint, blob(470, 40, 70, 16), "#f0b98a", { ...GLAZE, s: 0.3, v: 0.5, seg: 16, edge: 0.05 });
  yield;
  wash(paint, blob(lantern.x, lantern.y, 62, 54, 14), "#fbd67a", { ...GLAZE, s: 0.5, v: 0.3, seg: 16, layers: 30, edge: 0.04 });
  wash(paint, blob(lantern.x, lantern.y, 38, 34, 12), "#f7b450", { ...GLAZE, s: 0.45, v: 0.3, seg: 12, layers: 30, edge: 0.05 });
  game.lamps.forEach((hung, i) => {
    if (hung.lit) wash(paint, blob(LINE_X, marks[i]!, 8, 7), "#fbd266", { ...GLAZE, s: 0.6, v: 0.3, seg: 5, edge: 0, layers: 10 });
  });
  if (seen(ANGLER.y)) wash(paint, blob(ANGLER.x - 34, ANGLER.y - 19, 12, 11), "#fbd266", { ...GLAZE, s: 0.7, v: 0.3, seg: 6, edge: 0 });
  yield;
  // The diver: a copper helmet, a canvas suit, a lantern.
  wash(paint, helmet, "#cf7a3e", { ...GLAZE, s: 0.82, v: 0.05, seg: 6, edge: 0.35 });
  wash(paint, arc(diver.x - 2, diver.y + 13, 8, 8, 60, 250, 8), "#7c3520", { ...GLAZE, s: 0.5, v: 0.08, seg: 6, edge: 0.1 });
  wash(paint, arc(diver.x + 2, diver.y + 11, 4.5, 4.5, 0, 340, 10), "#ffd257", { s: 0.9, v: 0.04, seg: 4, edge: 0, layers: 8 });
  wash(paint, suit, "#5d6f86", { ...GLAZE, s: 0.75, v: 0.08, seg: 6, edge: 0.3 });
  wash(paint, lamp, "#f6c152", { ...GLAZE, s: 0.8, v: 0.08, seg: 5 });
  // The tender, up top.
  const ship = { x: LINE_X, y: Y0 };
  wash(paint, [[ship.x - 44, ship.y - 13], [ship.x + 40, ship.y - 13], [ship.x + 31, ship.y + 5], [ship.x - 35, ship.y + 5]], RUST, { ...GLAZE, s: 0.82, v: 0.1, seg: 8, edge: 0.3 });
  wash(paint, [[ship.x - 22, ship.y - 28], [ship.x + 4, ship.y - 28], [ship.x + 4, ship.y - 13], [ship.x - 22, ship.y - 13]], "#e9c88a", { ...GLAZE, s: 0.5, v: 0.1, seg: 8 });
  wash(paint, [[ship.x - 14, ship.y - 42], [ship.x - 6, ship.y - 42], [ship.x - 6, ship.y - 28], [ship.x - 14, ship.y - 28]], "#2c3550", { ...GLAZE, s: 0.7, v: 0.1, seg: 6 });
  yield;

  // ---- ink: the title, the sky and the tender
  txt(dark, 16, 48, "HADAL", { font: DISPLAY, size: 36, ls: 3, jit: 0 });
  pencil(dark, [[12, 20], [150, 19]], { n: 1, opacity: 0.45 });
  pencil(dark, [[12, 51], [156, 50]], { n: 1, opacity: 0.45 });
  for (const [x, y, s] of [[430, 34, 1], [452, 26, 0.7], [520, 46, 0.8]] as const) {
    ink(dark, [[x - 7 * s, y - 2 * s], [x - 3 * s, y - 5 * s], [x, y], [x + 4 * s, y - 5 * s], [x + 8 * s, y - 1 * s]], { w: 1.1 });
  }
  edges(dark, [[ship.x - 45, ship.y - 13], [ship.x + 41, ship.y - 14], [ship.x + 31, ship.y + 5], [ship.x - 35, ship.y + 5]], { w: 1.6, taper: 0.3 });
  ink(dark, [[ship.x - 22, ship.y - 13], [ship.x - 22, ship.y - 28], [ship.x + 4, ship.y - 28], [ship.x + 4, ship.y - 13]], { w: 1.3 });
  ink(dark, [[ship.x - 14, ship.y - 28], [ship.x - 14, ship.y - 42], [ship.x - 6, ship.y - 42], [ship.x - 6, ship.y - 28]], { w: 1.2 });
  ink(dark, ring(ship.x - 13, ship.y - 21, 2.4, 2.4, { n: 8 }), { w: 0.9 });
  ink(dark, ring(ship.x - 4, ship.y - 21, 2.4, 2.4, { n: 8 }), { w: 0.9 });
  pencil(dark, [[ship.x - 10, ship.y - 45], [ship.x - 14, ship.y - 54], [ship.x - 6, ship.y - 60], [ship.x - 12, ship.y - 68], [ship.x - 2, ship.y - 72]], { n: 2, opacity: 0.5, w: 1.2 });
  ink(dark, [[ship.x + 30, ship.y - 13], [ship.x + 14, ship.y - 44], [ship.x, ship.y - 36]], { w: 1.4 });
  ink(dark, [[ship.x + 14, ship.y - 44], [ship.x + 18, ship.y - 13]], { w: 1 });
  ink(dark, ring(ship.x + 24, ship.y - 18, 4.5, 4.5, { n: 8 }), { w: 1.2 });
  // The waterline.
  ink(dark, [[8, Y0 + 1], [40, Y0 - 2], [80, Y0 + 1], [120, Y0 - 2], [165, Y0 + 1], [205, Y0 - 1]], { w: 1.4 });
  ink(dark, [[296, Y0 - 1], [340, Y0 + 1], [385, Y0 - 2], [430, Y0 + 1], [480, Y0 - 2], [530, Y0 + 1], [592, Y0 - 1]], { w: 1.4 });
  for (const [x, y] of [[60, Y0 + 9], [150, Y0 + 12], [360, Y0 + 10], [455, Y0 + 13], [548, Y0 + 9]] as const) {
    ink(dark, [[x, y], [x + 7, y - 2], [x + 14, y], [x + 21, y - 2]], { w: 0.9, opacity: 0.6 });
  }

  // ---- the depth ruler down the left edge, drawn the whole way whether or not the dive got there
  const stroke = (y: number, pts: Pt[], w: number, opacity = 1) =>
    pale(y) ? ink(light, pts, { w, color: CREAM, opacity }) : ink(dark, pts, { w, opacity: seen(y) ? opacity : opacity * 0.6 });
  const label = (x: number, y: number, words: string, o: Parameters<typeof txt>[4] = {}) =>
    txt(pale(y) ? light : dark, x, y, words, { fill: pale(y) ? CREAM : seen(y) ? INK : GRAPHITE, ...o });
  for (let y = Y0; y < Y11000; y += 17.2) {
    stroke(y, [[30, y], [30 + rnd(-1, 1), y + 17.2]], 1.2);
    stroke(y, [[26, y], [33, y]], 0.8, 0.7);
  }
  label(40, Y0 + 17, "0 m", { size: 18, weight: 700, jit: 0 });
  for (const [depth, y] of RULER.slice(1)) {
    stroke(y, [[22, y], [48, y]], 1.6);
    label(52, y + 6, formatMeters(depth), { size: 19, weight: 700, jit: 0 });
    // Water nobody saw is only ruled off in pencil.
    if (!seen(y) && depth < 11000) pencil(dark, [[120, y], [588, y - 2]], { n: 1, dash: [5, 7], opacity: 0.5 });
  }
  if (seen(150)) txt(dark, 470, 150, "(not to scale)", { size: 16, fill: "#1f4a5c", opacity: 0.75, rot: -3 });
  yield;

  // ---- what was down there
  if (seen(130)) {
    for (const [x, y, s] of [[410, 116, 1], [432, 126, 0.8], [452, 112, 0.9], [474, 124, 1], [498, 116, 0.7], [438, 104, 0.6]] as const) {
      ink(dark, [[x - 9 * s, y - 3 * s], [x - 5 * s, y], [x + 5 * s, y - 3 * s], [x + 9 * s, y], [x + 5 * s, y + 3 * s], [x - 5 * s, y], [x - 9 * s, y + 3 * s]], { w: 1, opacity: 0.8 });
    }
  }
  if (seen(232)) {
    ink(dark, WHALE.slice(0, 10), { w: 1.2, opacity: 0.7 });
    ink(dark, [[404, 197], [406, 198]], { w: 1.6, min: 1 });
  }
  if (seen(ANGLER.y + 20)) {
    const { x, y } = ANGLER;
    ink(light, [[x - 22, y + 2], [x - 12, y - 12], [x + 6, y - 15], [x + 22, y - 6], [x + 33, y - 12], [x + 31, y + 10], [x + 22, y + 4], [x + 6, y + 14], [x - 12, y + 13], [x - 23, y + 5], [x - 10, y + 3]], { w: 1.4, color: CREAM, opacity: 0.9 });
    for (let i = 0; i < 5; i++) ink(light, [[x - 20 + i * 3.2, y + 3], [x - 19 + i * 3.2, y + 8]], { w: 0.9, color: CREAM, min: 0.8 });
    dot(light, x - 8, y - 5, 2, CREAM);
    ink(light, [[x - 6, y - 14], [x - 14, y - 26], [x - 28, y - 24], [x - 33, y - 20]], { w: 1, color: CREAM });
    txt(light, x - 76, y + 38, "its light came first", { size: 18, fill: CREAM, opacity: 0.85, rot: -3 });
  }
  if (seen(410)) {
    for (const [x, y, gap] of [[452, 396, 9], [506, 408, 7]] as const) {
      for (const side of [-1, 1]) {
        ink(light, arc(x + (side * gap) / 2, y, 3.4, 2.2, 0, 400, 8), { w: 1, color: CREAM, opacity: 0.9 });
        dot(light, x + (side * gap) / 2, y, 0.9, CREAM);
      }
    }
    txt(light, 436, 434, "something watched", { size: 18, fill: CREAM, opacity: 0.8, rot: -2 });
  }
  if (seen(500)) {
    ink(light, EEL, { w: 2.6, color: CREAM, opacity: 0.85, taper: 0.5, min: 0.2 });
    dot(light, EEL[8]![0] + 4, EEL[8]![1] - 2.5, 0.9, CREAM);
    txt(light, 420, 512, "it took a long time to pass", { size: 18, fill: CREAM, opacity: 0.8, rot: -2 });
  }
  // Marine snow.
  for (let i = 0; i < 190; i++) {
    const x = rnd(40, 584);
    const y = Y200 + Math.pow(rnd(), 0.7) * (Y11000 - Y200);
    if (seen(y + 4) && Math.hypot(x - lantern.x, y - lantern.y) > 50) dot(light, x, y, rnd(0.5, 1.5), CREAM, rnd(0.25, 0.8));
  }
  // The sea floor: a line of ink along it, and hatching down the trench walls.
  if (seen(600)) {
    ink(light, BED_LEFT.slice(0, 10).filter(([, y]) => seen(y)), { w: 1.3, color: "#e8cfa4", opacity: 0.7 });
    ink(light, BED_RIGHT.slice(0, 12).filter(([, y]) => seen(y)), { w: 1.3, color: "#e8cfa4", opacity: 0.7 });
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const left: Pt = [136 + 90 * t, 573 + 178 * t];
      const right: Pt = [360 - 88 * t, 581 + 170 * t];
      const [d, l] = [rnd(5, 26), rnd(8, 18)];
      if (!seen(left[1] + l)) continue;
      ink(dark, [[left[0] - d, left[1] - l * 0.4], [left[0] - d + l * 0.45, left[1] + l * 0.6]], { w: 1.1, opacity: 0.5 });
      ink(dark, [[right[0] + d, right[1] - l * 0.4], [right[0] + d - l * 0.45, right[1] + l * 0.6]], { w: 1.1, opacity: 0.5 });
    }
  }
  // A note at the bottom of the trench, unless the diver's tag has come down far enough to cover it.
  if (diver.y < 620) {
    label(338, 708, "the bottom: 11,000 m", { size: 20, opacity: 0.9, rot: -2 });
    label(350, 728, "(nobody we know has been)", { size: 17, opacity: 0.7, rot: -2 });
    stroke(726, [[332, 714], [300, 726], [258, 740]], 1.1, 0.8);
    stroke(740, [[267, 731], [257, 740], [270, 744]], 1, 0.8);
  }
  if (bottom < 640) {
    // Kept clear of the pencil rule of a zone, if one runs just here.
    const y = bottom + 30;
    const ruled = RULER.some(([, rule]) => Math.abs(rule - y + 6) < 14);
    txt(dark, 356, ruled ? y + 26 : y, "no light below here", { size: 19, fill: GRAPHITE, rot: -2 });
  }
  yield;

  // ---- the line, and a lamp for every prompt
  const inkEnd = Math.min(diver.y, 250);
  ink(dark, [[LINE_X + 1, Y0 - 37], [LINE_X + 2, (Y0 - 37 + inkEnd) / 2], [LINE_X, inkEnd]], { w: 1.3, wob: 0.3 });
  if (diver.y > 200) ink(light, [[LINE_X + 1, 200], [LINE_X - 1, (200 + diver.y) / 2], [LINE_X, diver.y]], { w: 1.2, wob: 0.35, color: CREAM, opacity: 0.85 });
  // A lit lamp is a light on the line; a dead one is crossed off beside it.
  game.lamps.forEach((hung, i) => {
    const y = marks[i]!;
    if (hung.lit) {
      dot(light, LINE_X, y, 2.8, YELLOW);
      ink(pale(y) ? light : dark, ring(LINE_X, y, 4.4, 4.4, { n: 8, over: 20 }), { w: 0.9, color: pale(y) ? CREAM : INK });
    } else {
      for (const side of [-1, 1]) {
        ink(pale(y) ? light : dark, [[LINE_X + 11 - 4 * side, y - 4], [LINE_X + 11 + 4 * side, y + 4]], { w: 1.8, color: pale(y) ? PALE_RED : RED, min: 0.6 });
      }
    }
  });
  for (const { from, to } of runs) {
    const y = (marks[from]! + marks[to]!) / 2;
    const unlit = game.lamps.slice(from, to + 1).every((hung) => !hung.lit);
    const color = unlit ? (pale(y) ? PALE_RED : RED) : pale(y) ? CREAM : INK;
    const numbers = from === to ? `${from + 1}` : `${from + 1}–${to + 1}`;
    txt(pale(y) ? light : dark, LINE_X - 11, y + 5, numbers, { size: 17, weight: 700, anchor: "end", fill: color, jit: 0 });
  }

  // ---- the diver
  ink(dark, ring(diver.x, diver.y + 11, 10, 10, { n: 14, over: 30, j: 0.012, drift: 0.02 }), { w: 1.8 });
  ink(dark, ring(diver.x + 2, diver.y + 11, 4.5, 4.5, { n: 10, over: 25 }), { w: 1.2 });
  edges(dark, suit, { w: 1.4, taper: 0.3, over: 1 });
  ink(dark, [[diver.x - 4, diver.y + 38], [diver.x - 5, diver.y + 47], [diver.x - 10, diver.y + 48]], { w: 1.7 });
  ink(dark, [[diver.x + 4, diver.y + 38], [diver.x + 5, diver.y + 47], [diver.x + 10, diver.y + 48]], { w: 1.7 });
  ink(dark, [[diver.x - 9, diver.y + 24], [diver.x - 14, diver.y + 32]], { w: 1.5 });
  ink(dark, [[diver.x + 9, diver.y + 24], [diver.x + 14, diver.y + 27], [diver.x + 18, diver.y + 29]], { w: 1.5 });
  edges(dark, lamp, { w: 1.2, taper: 0.3, over: 1 });
  ink(light, arc(diver.x, diver.y + 11, 7, 7, 205, 255, 5), { w: 1.6, color: CREAM, opacity: 0.9 });
  for (const [x, y, r] of [[-9, -6, 2], [-13, -19, 3], [-7, -33, 1.8]] as const) {
    ink(light, ring(diver.x + x, diver.y + y, r, r, { n: 8, over: 15 }), { w: 0.9, color: CREAM, opacity: 0.8 });
  }

  // ---- a paper tag tied to the diver, with the depth reached
  const tag = { x: diver.x + 62, y: diver.y - 6, w: 150, h: 52 };
  const hole: Pt = [tag.x + 13, tag.y + tag.h / 2];
  const outline: Pt[] = [[tag.x + 15, tag.y], [tag.x + tag.w, tag.y + 1], [tag.x + tag.w - 1, tag.y + tag.h], [tag.x + 15, tag.y + tag.h - 1], [tag.x, tag.y + tag.h / 2]];
  ink(light, [[diver.x + 10, diver.y + 14], [diver.x + 36, diver.y + 12], hole], { w: 1.2, color: CREAM });
  light.save();
  light.translate(...hole);
  light.rotate((3 * Math.PI) / 180);
  light.translate(-hole[0], -hole[1]);
  for (const [dx, dy, color] of [[-2, 3, "rgba(4, 8, 26, 0.4)"], [0, 0, "#f5ead0"]] as const) {
    light.fillStyle = color;
    light.beginPath();
    for (const [x, y] of outline) light.lineTo(x + dx, y + dy);
    light.fill();
  }
  edges(light, outline, { w: 1.4, taper: 0.3 });
  dot(light, ...hole, 3, "#22345a");
  txt(light, tag.x + 27, tag.y + 16, "depth reached", { size: 17, fill: GRAPHITE, jit: 0 });
  txt(light, tag.x + 25, tag.y + 45, formatMeters(game.depth), { font: DISPLAY, size: 31, jit: 0 });
  light.restore();
}
