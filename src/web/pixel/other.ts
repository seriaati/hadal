import file from "@fontsource/fusion-pixel-10px-proportional-sc/files/fusion-pixel-10px-proportional-sc-latin-400-normal.woff2";
import { latin, other, plain } from "./font";

/**
 * The font for everything the hand-built fonts cannot draw: Fusion Pixel, a ready-made pixel
 * font of 10 pixels with Cyrillic, Greek, Japanese, Chinese and Korean. It is 414 KB (despite
 * "latin" in the file's name, that is the whole font), so it is fetched only once some text
 * needs it. Each letter is drawn once on a hidden canvas at the font's own size and kept as
 * rows of pixels, like a hand-built glyph. The browser smooths the letter's edges even at
 * that size; keeping the pixels that are at least half covered gives back the exact bitmap.
 * A letter the font lacks comes out in the device's own font, roughly.
 */
const FAMILY = "Hadal Other";
const SIZE = 10;
/** Rows kept above and below the line the letters sit on: room for a mark over a capital, and for a tail. */
const ASCENT = 10;
const DESCENT = 3;

let state: "unasked" | "coming" | "here" | "lost" = "unasked";
let context: CanvasRenderingContext2D;
const drawn = new Map<string, string[]>();

function send() {
  state = "coming";
  const face = new FontFace(FAMILY, `url(${file})`);
  document.fonts.add(face);
  face.load().then(
    () => {
      context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      context.font = `${SIZE}px "${FAMILY}"`;
      state = "here";
    },
    () => (state = "lost"),
  );
}

/** False while this text waits for the font that draws it. If the font cannot be had, nothing waits for it. */
export function drawable(text: string): boolean {
  if (latin(plain(text))) return true;
  if (state === "unasked") send();
  return state !== "coming";
}

other.ascent = ASCENT;
other.line = SIZE;
other.glyph = (unit) => {
  if (latin(unit)) return undefined;
  if (state === "unasked") send();
  if (state !== "here") return undefined;
  let rows = drawn.get(unit);
  if (!rows) {
    // A letter's width in the font includes the gap after it, which the drawing adds itself.
    const width = Math.max(1, Math.round(context.measureText(unit).width) - 1);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.fillText(unit, 0, ASCENT);
    const { data } = context.getImageData(0, 0, width, ASCENT + DESCENT);
    rows = Array.from({ length: ASCENT + DESCENT }, (_, y) =>
      Array.from({ length: width }, (_, x) => (data[(y * width + x) * 4 + 3]! >= 128 ? "#" : ".")).join(""),
    );
    drawn.set(unit, rows);
  }
  return rows;
};
