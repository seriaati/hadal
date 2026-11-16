import { METERS_PER_POINT } from "../../shared/types";
import { formatMeters, zoneAt } from "../depth";
import type { Game } from "../state";
import { DISPLAY, GLAZE, GRAPHITE, INK, PAGE_H, PAGE_W, RED, RUST, TYPED, blob, ink, newCanvas, pencil, ring, rnd, speckle, txt, wash, type Sheet } from "./sketch";

const STAMP_RED = "#b03a26";

/** The right page: the written log, with the depth reached and one entry for every prompt. It stops at every `yield`. */
export function* drawEntries(sheet: Sheet, game: Game) {
  const { paint, dark } = sheet;
  const zone = zoneAt(game.depth).replace(" zone", "");

  // A ring where a mug stood.
  paint.save();
  paint.globalCompositeOperation = "multiply";
  paint.strokeStyle = "#8a5426";
  paint.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const rim = blob(92 + rnd(-0.6, 0.6), 704 + rnd(-0.6, 0.6), 37 + rnd(-1.2, 1.2), 36, 40, 0.01);
    const start = Math.floor(rnd(rim.length));
    paint.globalAlpha = rnd(0.08, 0.2);
    paint.lineWidth = rnd(0.8, 3.6);
    paint.beginPath();
    for (let k = 0; k < rim.length * rnd(0.5, 0.92); k++) paint.lineTo(...rim[(start + k) % rim.length]!);
    paint.stroke();
  }
  paint.restore();
  yield;

  // ---- how the dive ended
  const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
  txt(dark, 40, 52, `${day}, aboard the Kettle`, { size: 25 });
  txt(dark, 40, 100, "the line ended at", { size: 24 });
  txt(dark, 40, 160, formatMeters(game.depth), { font: DISPLAY, size: 60, jit: 0 });
  ink(dark, [[40, 172], [150, 170], [300, 173]], { w: 1.8 });
  ink(dark, [[50, 178], [160, 176], [288, 178]], { w: 1.1 });

  // A rubber stamp names the deepest zone reached. It is inked unevenly, so it is worn away on a canvas of its own.
  const stamp = newCanvas();
  stamp.translate(478, 112);
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
  stamp.resetTransform();
  speckle(stamp, "destination-out", 0.9, 5);
  dark.drawImage(stamp.canvas, 0, 0, PAGE_W, PAGE_H);
  yield;

  // ---- one entry for every prompt: what came down the wire, and what was answered
  game.prompts.forEach((prompt, i) => {
    const result = game.results[i]!;
    const top = 194 + i * 48;
    const lamp = [54, top + 22] as const;
    if (result.correct) {
      wash(paint, blob(...lamp, 11, 11), "#fbd266", { ...GLAZE, s: 0.7, v: 0.2, seg: 5, edge: 0.3, layers: 10 });
      ink(dark, ring(...lamp, 11, 11, { n: 10, over: 25 }), { w: 1.3 });
    } else {
      pencil(dark, ring(...lamp, 11, 11, { over: 10 }), { n: 2, w: 1 });
    }
    txt(dark, lamp[0], lamp[1] + 5.5, String(i + 1), { font: DISPLAY, size: 15, anchor: "middle", fill: result.correct ? INK : GRAPHITE, jit: 0 });
    txt(dark, 78, top + 13, `${prompt.pack.toUpperCase()}  ·  ${prompt.text}`, { font: TYPED, size: 11, ls: 0.3, fill: "#6a5a4a", jit: 0 });
    if (result.correct) {
      txt(dark, 78, top + 36, result.answer, { size: 27, weight: 700, jit: 0.6 });
      txt(dark, 558, top + 36, `+${formatMeters(result.rarity * METERS_PER_POINT)}`, { size: 25, weight: 700, anchor: "end", jit: 0 });
    } else {
      txt(dark, 78, top + 36, "out of air", { size: 26, weight: 600, fill: RED });
      txt(dark, 558, top + 36, "no light", { size: 19, anchor: "end", fill: GRAPHITE });
    }
    pencil(dark, [[40, top + 43], [560, top + 42]], { n: 1, opacity: 0.3, w: 0.7 });
  });
  yield;

  // ---- and back to the title
  txt(dark, 300, 714, "turn the page", { size: 36, weight: 700, fill: RUST, rot: -3 });
  txt(dark, 326, 740, "click, or press Enter", { size: 22, fill: GRAPHITE, rot: -3 });
  ink(dark, [[488, 700], [530, 704], [560, 724]], { w: 2.4, color: RUST });
  ink(dark, [[547, 726], [562, 727], [562, 712]], { w: 2.2, color: RUST });
}
