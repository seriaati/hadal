import type { Frame } from "./frame";

// Glyphs are rows of "#" and "." separated by "/". Rows past the usual height are descenders.

/** 3x5 capitals for labels. "~" is a centred dot, used as a separator. */
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
};

/** 5x7 mixed case for prompts. */
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
export type Font = { glyphs: Glyphs; height: number; gap: number; space: number; capitals: boolean };

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
  tiny: { glyphs: parse(TINY), height: 5, gap: 1, space: 3, capitals: true },
  medium: { glyphs: medium, height: 7, gap: 1, space: 4, capitals: false },
  large: { glyphs: large, height: 14, gap: 2, space: 6, capitals: false },
  huge: { glyphs: doubled(large), height: 28, gap: 4, space: 12, capitals: false },
};

/** Reduce text to what the fonts can draw: no accents, plain quotes and dashes. */
export function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
}

const glyphWidth = (rows: string[]) => Math.max(...rows.map((row) => row.length));

export function measure(font: Font, text: string): number {
  let width = 0;
  for (const char of font.capitals ? text.toUpperCase() : text) {
    const rows = font.glyphs[char];
    if (char === " ") width += font.space;
    else if (rows) width += glyphWidth(rows) + font.gap;
  }
  return Math.max(0, width - font.gap);
}

type TextColor = number | ((row: number) => number);

/** Draw text with its top-left at (x, y), or its top-right if `right` is set. Returns the x after it. */
export function drawText(frame: Frame, font: Font, text: string, x: number, y: number, color: TextColor, right = false): number {
  if (right) x -= measure(font, text);
  for (const char of font.capitals ? text.toUpperCase() : text) {
    if (char === " ") {
      x += font.space;
      continue;
    }
    const rows = font.glyphs[char];
    if (!rows) continue;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === "#") frame.put(x + i, y + j, typeof color === "number" ? color : color(j));
      }
    });
    x += glyphWidth(rows) + font.gap;
  }
  return x;
}

/** Break text into lines no wider than `width`. */
export function wrap(font: Font, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const longer = line ? `${line} ${word}` : word;
    if (line && measure(font, longer) > width) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The first of `fonts` in which the text fits `width`, or the last one if none does. */
export function fit(fonts: Font[], text: string, width: number): Font {
  return fonts.find((font) => measure(font, text) <= width) ?? fonts.at(-1)!;
}
