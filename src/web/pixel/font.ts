import type { Frame } from "./frame";

// Glyphs are rows of "#" and "." separated by "/". Rows past the usual height are descenders.

/** 3x5 capitals for labels. "~" is a centred dot, used as a separator; "‹" is the mark that leads one step back. */
const TINY = {
  A: ".#./#.#/###/#.#/#.#", B: "##./#.#/##./#.#/##.", C: ".##/#../#../#../.##", D: "##./#.#/#.#/#.#/##.",
  E: "###/#../##./#../###", F: "###/#../##./#../#..", G: ".##/#../#.#/#.#/.##", H: "#.#/#.#/###/#.#/#.#",
  I: "#/#/#/#/#", J: "..#/..#/..#/#.#/.#.", K: "#.#/#.#/##./#.#/#.#", L: "#../#../#../#../###",
  M: "#...#/##.##/#.#.#/#...#/#...#", N: "#..#/##.#/#.##/#..#/#..#", O: ".#./#.#/#.#/#.#/.#.", P: "##./#.#/##./#../#..",
  Q: ".#./#.#/#.#/#.#/.##", R: "##./#.#/##./#.#/#.#", S: ".##/#../.#./..#/##.", T: "###/.#./.#./.#./.#.",
  U: "#.#/#.#/#.#/#.#/###", V: "#.#/#.#/#.#/#.#/.#.", W: "#...#/#...#/#.#.#/#.#.#/.#.#.", X: "#.#/#.#/.#./#.#/#.#",
  Y: "#.#/#.#/.#./.#./.#.", Z: "###/..#/.#./#../###",
  "0": "###/#.#/#.#/#.#/###", "1": ".#/##/.#/.#/.#", "2": "##./..#/.#./#../###", "3": "##./..#/.#./..#/##.",
  "4": "#.#/#.#/###/..#/..#", "5": "###/#../##./..#/##.", "6": ".##/#../###/#.#/###", "7": "###/..#/.#./.#./.#.",
  "8": "###/#.#/###/#.#/###", "9": "###/#.#/###/..#/##.",
  ".": "././././#", ",": "././././#/#", "+": ".../.#./###/.#./...", "-": ".../.../###/.../...",
  "/": "..#/..#/.#./#../#..", ":": "./#/./#/.", "~": "././#/./.", "?": "##./..#/.#./.../.#.", "!": "#/#/#/./#",
  "'": "#/#/././.", '"': "#.#/#.#/.../.../...", "(": ".#/#./#./#./.#", ")": "#./.#/.#/.#/#.", "&": ".#./#.#/.#./#.#/.##",
  "‹": "../.#/#./.#/..",
};

const MEDIUM = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#", B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".###./#...#/#..../#..../#..../#...#/.###.", D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####", F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.###.", H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "###/.#./.#./.#./.#./.#./###", J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#", L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#", N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.", P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#", R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.", T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.", V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.", X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..", Z: "#####/....#/...#./..#../.#.../#..../#####",
  a: "...../...../.###./....#/.####/#...#/.####", b: "#..../#..../#.##./##..#/#...#/#...#/####.",
  c: "..../..../.###/#.../#.../#.../.###", d: "....#/....#/.####/#...#/#...#/#...#/.####",
  e: "...../...../.###./#...#/#####/#..../.###.", f: "..##/.#../###./.#../.#../.#../.#..",
  g: "...../...../.####/#...#/#...#/.####/....#/....#/.###.", h: "#..../#..../#.##./##..#/#...#/#...#/#...#",
  i: "#/./#/#/#/#/#", j: "..#/.../..#/..#/..#/..#/..#/#.#/.#.", k: "#.../#.../#..#/#.#./##../#.#./#..#",
  l: "#/#/#/#/#/#/#", m: "...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#", n: "...../...../#.##./##..#/#...#/#...#/#...#",
  o: "...../...../.###./#...#/#...#/#...#/.###.", p: "...../...../#.##./##..#/#...#/#...#/####./#..../#....",
  q: "...../...../.####/#...#/#...#/#...#/.####/....#/....#", r: "..../..../#.##/##../#.../#.../#...",
  s: "...../...../.####/#..../.###./....#/####.", t: ".#../.#../###./.#../.#../.#../..##",
  u: "...../...../#...#/#...#/#...#/#..##/.##.#", v: "...../...../#...#/#...#/#...#/.#.#./..#..",
  w: "...../...../#...#/#...#/#.#.#/#.#.#/.#.#.", x: "...../...../#...#/.#.#./..#../.#.#./#...#",
  y: "...../...../#...#/#...#/#...#/.####/....#/....#/.###.", z: "...../...../#####/...#./..#../.#.../#####",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.", "1": "..#../.##../..#../..#../..#../..#../.###.",
  "2": ".###./#...#/....#/...#./..#../.#.../#####", "3": "#####/...#./..#../...#./....#/#...#/.###.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.", "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": "..##./.#.../#..../####./#...#/#...#/.###.", "7": "#####/....#/...#./..#../.#.../.#.../.#...",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.", "9": ".###./#...#/#...#/.####/....#/...#./.##..",
  ",": "../../../../../.#/.#/#.", ".": "./././././#/#", "+": ".../.../.#./###/.#./.../...",
  "?": ".###./#...#/....#/...#./..#../...../..#..", "!": "#/#/#/#/#/./#", "'": "#/#/././././.",
  '"': "#.#/#.#/.../.../.../.../...", "-": ".../.../.../###/.../.../...", ":": "./././#/./#/.",
  "(": ".#/#./#./#./#./#./.#", ")": "#./.#/.#/.#/.#/.#/#.", "/": "....#/...#./...#./..#../.#.../.#.../#....",
  "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#",
};

type Glyphs = Record<string, string[]>;
/** `scale` is how many times larger than drawn the glyphs are: the large fonts are a smaller one doubled. */
export type Font = { glyphs: Glyphs; height: number; gap: number; space: number; capitals: boolean; scale: number };

function parse(source: Record<string, string>): Glyphs {
  return Object.fromEntries(Object.entries(source).map(([char, rows]) => [char, rows.split("/")]));
}

/**
 * Double a glyph with the Scale2x rule, so big text stays on the same pixel grid. Diagonals
 * are smoothed, but the glyph's own outer corners stay square (so a D does not become an O).
 */
function double(rows: string[]): string[] {
  const width = Math.max(...rows.map((row) => row.length));
  const at = (x: number, y: number) => rows[y]?.[x] === "#";
  const out: string[] = [];
  for (let y = 0; y < rows.length; y++) {
    let top = "";
    let bottom = "";
    for (let x = 0; x < width; x++) {
      const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
      const up = y > 0, down = y < rows.length - 1, left = x > 0, right = x < width - 1;
      const e0 = up && left && c === a && c !== d && a !== b ? a : p;
      const e1 = up && right && a === b && a !== c && b !== d ? b : p;
      const e2 = down && left && d === c && d !== b && c !== a ? c : p;
      const e3 = down && right && b === d && b !== a && d !== c ? d : p;
      top += (e0 ? "#" : ".") + (e1 ? "#" : ".");
      bottom += (e2 ? "#" : ".") + (e3 ? "#" : ".");
    }
    out.push(top, bottom);
  }
  return out;
}

function doubled(glyphs: Glyphs): Glyphs {
  return Object.fromEntries(Object.entries(glyphs).map(([char, rows]) => [char, double(rows)]));
}

const medium = parse(MEDIUM);
const large = doubled(medium);

export const FONTS: Record<"tiny" | "medium" | "large" | "huge", Font> = {
  tiny: { glyphs: parse(TINY), height: 5, gap: 1, space: 3, capitals: true, scale: 1 },
  medium: { glyphs: medium, height: 7, gap: 1, space: 4, capitals: false, scale: 1 },
  large: { glyphs: large, height: 14, gap: 2, space: 6, capitals: false, scale: 2 },
  huge: { glyphs: doubled(large), height: 28, gap: 4, space: 12, capitals: false, scale: 4 },
};

/**
 * Where glyphs come from that the fonts above lack: every other script. `other.ts` fills this
 * in with a ready-made pixel font, fetched when first needed. `glyph` gives the rows of one
 * letter with its marks, or nothing if it cannot be drawn (yet); `ascent` is how many of
 * those rows stand above the line the letters sit on; `line` is how many rows a line of them needs.
 */
export const other: { glyph: (unit: string) => string[] | undefined; ascent: number; line: number } = {
  glyph: () => undefined,
  ascent: 0,
  line: 0,
};

/** Whether text holds nothing beyond the plain Latin letters, digits and signs of a keyboard. */
export const latin = (text: string) => /^[ -~]*$/.test(text);

const letters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const segmented = new Map<string, string[]>();
const enlarged = new Map<string, string[]>();

/**
 * Text as the pieces that are drawn one at a time: a letter together with any marks it carries.
 * Finding them is slow outside plain Latin and the same text is drawn every frame, so they are remembered.
 */
function pieces(text: string): string[] {
  if (latin(text)) return text.split("");
  let parts = segmented.get(text);
  if (!parts) {
    if (segmented.size > 2000) segmented.clear();
    parts = Array.from(letters.segment(text), (piece) => piece.segment);
    segmented.set(text, parts);
  }
  return parts;
}

const units = (font: Font, text: string) => pieces(font.capitals ? text.toUpperCase() : text);

/** The rows of a unit, and how far above the top of the line they start. */
function glyphOf(font: Font, unit: string): { rows: string[]; rise: number } | undefined {
  const own = font.glyphs[unit];
  if (own) return { rows: own, rise: 0 };
  let rows = other.glyph(unit);
  if (!rows) return undefined;
  for (let scale = font.scale; scale > 1; scale /= 2) {
    const key = `${scale}${unit}`;
    rows = enlarged.get(key) ?? enlarged.set(key, double(rows)).get(key)!;
  }
  return { rows, rise: other.ascent * font.scale - font.height };
}

/**
 * Reduce text to what the fonts can draw: Latin letters without their accents, plain quotes
 * and dashes. Other scripts keep their marks, which tell their words apart.
 */
export function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
}

const glyphWidth = (rows: string[]) => Math.max(...rows.map((row) => row.length));

export function measure(font: Font, text: string): number {
  let width = 0;
  for (const unit of units(font, text)) {
    const glyph = glyphOf(font, unit);
    if (unit === " ") width += font.space;
    else if (glyph) width += glyphWidth(glyph.rows) + font.gap;
  }
  return Math.max(0, width - font.gap);
}

type TextColor = number | ((row: number) => number);

/** Draw text with its top-left at (x, y), or its top-right if `right` is set. Returns the x after it. */
export function drawText(frame: Frame, font: Font, text: string, x: number, y: number, color: TextColor, right = false): number {
  if (right) x -= measure(font, text);
  for (const unit of units(font, text)) {
    if (unit === " ") {
      x += font.space;
      continue;
    }
    const glyph = glyphOf(font, unit);
    if (!glyph) continue;
    glyph.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === "#") frame.put(x + i, y + j - glyph.rise, typeof color === "number" ? color : color(j - glyph.rise));
      }
    });
    x += glyphWidth(glyph.rows) + font.gap;
  }
  return x;
}

/** Scripts written without spaces, where a line may break between any two letters. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Marks that may not begin a line, and those that may not end one. */
const CLOSING = /^[，。、；：？！）》”’…]/;
const OPENING = /[（《“‘]$/;

/** A word cut where a line may break inside it: between letters of a script written without spaces, keeping each mark with its letter. */
function breaks(word: string): string[] {
  if (latin(word)) return [word];
  const chunks: string[] = [];
  for (const piece of pieces(word)) {
    const last = chunks.at(-1);
    if (last !== undefined && (CLOSING.test(piece) || OPENING.test(last) || (!UNSPACED.test(piece) && !UNSPACED.test(last.at(-1)!)))) chunks[chunks.length - 1] += piece;
    else chunks.push(piece);
  }
  return chunks;
}

/** Break text into lines no wider than `width`, between words where it can and inside a word wider than a line. */
export function wrap(font: Font, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    breaks(word).forEach((chunk, i) => {
      const longer = line ? `${line}${i === 0 ? " " : ""}${chunk}` : chunk;
      if (line && measure(font, longer) > width) {
        lines.push(line);
        line = chunk;
      } else {
        line = longer;
      }
      while (measure(font, line) > width) {
        const parts = pieces(line);
        if (parts.length < 2) break;
        let cut = parts.length - 1;
        while (cut > 1 && measure(font, parts.slice(0, cut).join("")) > width) cut--;
        lines.push(parts.slice(0, cut).join(""));
        line = parts.slice(cut).join("");
      }
    });
  }
  if (line) lines.push(line);
  return lines;
}

/** How far apart lines of this text are set: `usual`, or more when letters of the other font, which stand taller, need it. */
export function pitch(font: Font, text: string, usual = font.height + 3): number {
  return latin(text) ? usual : Math.max(usual, other.line * font.scale);
}

/** The first of `fonts` in which the text fits `width`, or the last one if none does. */
export function fit(fonts: Font[], text: string, width: number): Font {
  return fonts.find((font) => measure(font, text) <= width) ?? fonts.at(-1)!;
}
