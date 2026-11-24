import file from "@fontsource/unifont/files/unifont-latin-400-normal.woff2";
import { bolder, latin, other, plain, trimmed } from "./font";

/**
 * GNU Unifont, a 16-pixel font with every script, drawn in half pixels of the frame as Minecraft draws Chinese: its
 * letters stand 8 pixels tall, yet dense characters (鬱, 龜, 體) keep their strokes apart, which a font in the frame's
 * own pixels manages only at 12 or more. It is 1.6 MB (despite "latin" in the file's name, that is the whole font), so
 * it is fetched only once some text needs it. Its Chinese has mainland forms only.
 */
const FAMILY = "Hadal Other";
const SIZE = 16;
/**
 * Letters are drawn this many times their size and read at the middle of each block: some systems thicken text as they
 * smooth it, which at the font's own size fills the one-pixel gaps of a dense letter.
 */
const SCALE = 8;
/** Rows of half pixels kept above and below the line the letters sit on: every letter of the font is within them. */
const ASCENT = 14;
const DESCENT = 2;
/** Unifont's Chinese fills all 8 pixels of its height: 3 more keep the strokes of one line off the next. */
const LINE = 11;
/**
 * Half pixels kept either side of a punctuation mark's ink. A full-width mark (，：) is about 2 pixels of ink in a cell
 * of 8, which leaves a gap in the sentence; trimmed to this, it stands as far from its neighbours as they from each other.
 */
const MARK_MARGIN = 3;

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

/**
 * What a letter shows while the font is on its way: a dim block as wide as the letter will be (Unifont draws these
 * scripts 16 half pixels wide and the rest 8, less the gap after each), so the text keeps its length and lines their breaks.
 */
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const waiting = (width: number) =>
  Array.from({ length: ASCENT + DESCENT }, (_, y) =>
    Array.from({ length: width }, (_, x) => (y >= 2 && y <= 13 && x >= 1 && x < width - 1 && (x + y) % 2 === 0 ? "#" : ".")).join(""),
  );
const WAITING_WIDE = waiting(15);
const WAITING_NARROW = waiting(7);

other.ascent = ASCENT / 2;
other.line = LINE;
other.glyph = (unit) => {
  if (latin(unit)) return undefined;
  if (state === "unasked") send();
  if (state === "coming") return WIDE.test(unit) ? WAITING_WIDE : WAITING_NARROW;
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
    const sampled = Array.from({ length: ASCENT + DESCENT }, (_, y) =>
      Array.from({ length: width }, (_, x) => (data[((y * SCALE + middle) * across + x * SCALE + middle) * 4 + 3]! >= 128 ? "#" : ".")).join(""),
    );
    // Unifont's strokes are half a pixel of the frame, thin beside the game's own letters. Its marks of punctuation
    // are flat blocks (4 by 2) that bolder would only flatten further.
    rows = /^\p{P}$/u.test(unit) ? trimmed(sampled, MARK_MARGIN) : bolder(sampled);
    drawn.set(unit, rows);
  }
  return rows;
};
