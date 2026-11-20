import file from "@fontsource/fusion-pixel-10px-proportional-sc/files/fusion-pixel-10px-proportional-sc-latin-400-normal.woff2";
import { latin, other, plain } from "./font";

/**
 * Fusion Pixel, a 10-pixel font with Cyrillic, Greek, Japanese, Chinese and Korean. It is 414 KB (despite "latin" in
 * the file's name, that is the whole font), so it is fetched only once some text needs it. A letter it lacks comes out
 * in the device's own font, roughly.
 */
const FAMILY = "Hadal Other";
const SIZE = 10;
/**
 * Letters are drawn this many times their size and read at the middle of each block: some systems thicken text as they
 * smooth it, which at the font's own size fills the one-pixel gaps of a dense letter.
 */
const SCALE = 8;
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
      context.font = `${SIZE * SCALE}px "${FAMILY}"`;
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
    const width = Math.max(1, Math.round(context.measureText(unit).width / SCALE) - 1);
    const across = width * SCALE;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.fillText(unit, 0, ASCENT * SCALE);
    const { data } = context.getImageData(0, 0, across, (ASCENT + DESCENT) * SCALE);
    const middle = SCALE >> 1;
    rows = Array.from({ length: ASCENT + DESCENT }, (_, y) =>
      Array.from({ length: width }, (_, x) => (data[((y * SCALE + middle) * across + x * SCALE + middle) * 4 + 3]! >= 128 ? "#" : ".")).join(""),
    );
    drawn.set(unit, rows);
  }
  return rows;
};
