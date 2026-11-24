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
  "‹": "../.#/#./.#/..", "%": "#.#/..#/.#./#../#.#", "#": ".#.#./#####/.#.#./#####/.#.#.",
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

/**
 * Strokes one pixel wider to the right, wherever a pixel of gap still stays after them, so that strokes close together
 * keep apart. Past the right edge counts as gap, and is never drawn on.
 */
export function bolder(rows: string[]): string[] {
  return rows.map((row) => Array.from(row, (cell, x) => (cell === "#" || (row[x - 1] === "#" && row[x + 1] !== "#") ? "#" : ".")).join(""));
}

/** Only the columns that hold ink, and up to `margin` blank ones either side. A glyph with no ink is kept as it is. */
export function trimmed(rows: string[], margin: number): string[] {
  const inked = rows.flatMap((row) => [row.indexOf("#"), row.lastIndexOf("#")]).filter((x) => x >= 0);
  if (!inked.length) return rows;
  const from = Math.max(0, Math.min(...inked) - margin);
  const to = Math.max(...inked) + 1 + margin;
  return rows.map((row) => row.slice(from, to));
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
 * letter with its marks, in half pixels of the frame, or nothing if it cannot be drawn (yet);
 * `ascent` is how many pixels of the frame those rows stand above the line the letters sit on;
 * `line` is how many pixels a line of them needs.
 */
export const other: { glyph: (unit: string) => string[] | undefined; ascent: number; line: number } = {
  glyph: () => undefined,
  ascent: 0,
  line: 0,
};

/** Whether text holds nothing beyond the plain Latin letters, digits and signs of a keyboard. */
export const latin = (text: string) => /^[ -~\u00a0]*$/.test(text);

const letters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const segmented = new Map<string, string[]>();
/** Keyed by the glyph rather than the letter: the same letter has other rows once the language picks another cut. */
const enlarged = new WeakMap<string[], string[]>();

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

// A no-break space is drawn as a space; only `wrap` tells them apart, and never breaks a line at one.
const units = (font: Font, text: string) => pieces((font.capitals ? text.toUpperCase() : text).replaceAll("\u00a0", " "));

type Glyph = { rows: string[]; rise: number; fine: boolean };

/** The rows of a unit, how far above the top of the line they start, and whether they are in half pixels. */
function glyphOf(font: Font, unit: string): Glyph | undefined {
  const own = font.glyphs[unit];
  if (own) return { rows: own, rise: 0, fine: false };
  let rows = other.glyph(unit);
  if (!rows) return undefined;
  // Half pixels drawn twice as large are whole pixels: only text of the smallest scale is drawn in half pixels.
  for (let scale = font.scale / 2; scale > 1; scale /= 2) {
    const small: string[] = rows;
    rows = enlarged.get(small) ?? enlarged.set(small, double(small)).get(small)!;
  }
  return { rows, rise: other.ascent * font.scale - font.height, fine: font.scale === 1 };
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

/**
 * How far on the next letter starts. A letter in half pixels ends with its own font's gap of half a pixel, rounded up to
 * a whole one: adding this font's gap as well sets Chinese visibly far apart.
 */
const advance = (glyph: Glyph, font: Font) => {
  const across = Math.max(...glyph.rows.map((row) => row.length));
  return glyph.fine ? Math.ceil((across + 1) / 2) : across + font.gap;
};

export function measure(font: Font, text: string): number {
  let width = 0;
  let trail = font.gap;
  for (const unit of units(font, text)) {
    const glyph = glyphOf(font, unit);
    if (unit === " ") width += font.space;
    else if (glyph) {
      width += advance(glyph, font);
      trail = glyph.fine ? 0 : font.gap;
    }
  }
  return Math.max(0, width - trail);
}

/** How far on from where `text` starts the letter after it would start. */
function reach(font: Font, text: string): number {
  let width = 0;
  for (const unit of units(font, text)) {
    const glyph = glyphOf(font, unit);
    if (unit === " ") width += font.space;
    else if (glyph) width += advance(glyph, font);
  }
  return width;
}

/** The background of selected letters, behind the letters `from` to `to` of `text`, which is drawn as `lines` (from `wrap`) at `x`, `y` and `gap` apart. */
export function drawSelection(frame: Frame, font: Font, text: string, lines: string[], from: number, to: number, x: number, y: number, gap: number) {
  const top = y - 1 - rise(font, text);
  let at = 0;
  lines.forEach((line, i) => {
    // A line break takes the space it falls on: each line is found from where the one before it ended.
    at = text.indexOf(line, at);
    const start = Math.max(from, at) - at;
    const end = Math.min(to, at + line.length) - at;
    at += line.length;
    if (start >= end) return;
    const left = x + reach(font, line.slice(0, start)) - 1;
    const right = x + reach(font, line.slice(0, end));
    for (let j = top; j <= y + font.height; j++) for (let k = left; k < right; k++) frame.put(k, j + i * gap, 5);
  });
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
    const top = y - glyph.rise;
    glyph.rows.forEach((row, j) => {
      const ink = typeof color === "number" ? color : color((glyph.fine ? j >> 1 : j) - glyph.rise);
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== "#") continue;
        if (glyph.fine) frame.putFine(2 * (x | 0) + i, 2 * (top | 0) + j, ink);
        else frame.put(x + i, top + j, ink);
      }
    });
    x += advance(glyph, font);
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

/** How far the letters of the other font stand above the top of a line of this text, which the line before must leave room for. */
export function rise(font: Font, text: string): number {
  return latin(text) ? 0 : Math.max(0, other.ascent * font.scale - font.height);
}

/** How far apart lines of this text are set: `usual`, or more when letters of the other font, which stand taller, need it. */
export function pitch(font: Font, text: string, usual = font.height + 3): number {
  return latin(text) ? usual : Math.max(usual, other.line * font.scale);
}

/** The first of `fonts` in which the text fits `width`, or the last one if none does. */
export function fit(fonts: Font[], text: string, width: number): Font {
  return fonts.find((font) => measure(font, text) <= width) ?? fonts.at(-1)!;
}
