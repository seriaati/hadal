import { expect, test } from "bun:test";
import { FONTS, bolder, drawText, measure, other, pitch, plain, wrap } from "./font";
import { Frame } from "./frame";

const { tiny } = FONTS;

test("wrap breaks between words and keeps every line within the width", () => {
  const lines = wrap(tiny, "The Lion, the Witch and the Wardrobe", 75);
  expect(lines).toEqual(["The Lion, the Witch", "and the Wardrobe"]);
  for (const line of lines) expect(measure(tiny, line)).toBeLessThanOrEqual(75);
});

test("wrap breaks inside a word that is wider than a line, losing no letters", () => {
  const word = "x".repeat(40);
  const lines = wrap(tiny, `ab ${word} cd`, 75);
  expect(lines.length).toBeGreaterThan(2);
  expect(lines.join("")).toBe(`ab${word} cd`);
  for (const line of lines) expect(measure(tiny, line)).toBeLessThanOrEqual(75);
});

test("wrap leaves text that fits on one line, and empty text gives no lines", () => {
  expect(wrap(tiny, "Taiwan", 75)).toEqual(["Taiwan"]);
  expect(wrap(tiny, "", 75)).toEqual([]);
});

test("plain strips the accents of Latin letters only", () => {
  expect(plain("Pont-l’Évêque")).toBe("Pont-l'Eveque");
  expect(plain("が")).toBe("が");
  expect(plain("Чай")).toBe("Чай");
});

test("letters of other scripts come from the other font, and a line breaks between them", () => {
  const before = other.glyph;
  // Seven half pixels and the font's own gap of one take 4 pixels of the frame, with no gap of this font's after them.
  other.glyph = (unit) => (/[ -~]/.test(unit) ? undefined : ["#######", "#######"]);
  expect(measure(tiny, "A東京")).toBe(3 + 1 + 4 + 4);
  expect(wrap(tiny, "東京東京東京", 14)).toEqual(["東京東", "京東京"]);
  // A letter keeps the marks it carries: Thai "ก้" is two characters and one letter.
  expect(wrap(tiny, "ก้ก้ก้", 9)).toEqual(["ก้ก้", "ก้"]);
  other.glyph = before;
  expect(measure(tiny, "A東京")).toBe(3);
});

test("Chinese breaks between any two letters, but never puts a mark at the start of a line, and keeps digits together", () => {
  const before = other.glyph;
  other.glyph = (unit) => (/[ -~]/.test(unit) ? undefined : ["#######", "#######"]);
  // Each letter takes 4: three letters fit in 14.
  expect(wrap(tiny, "一二三，四五", 14)).toEqual(["一二", "三，四", "五"]);
  expect(wrap(tiny, "一二三四 18", 24)).toEqual(["一二三四", "18"]);
  other.glyph = before;
});

test("lines of the other font's taller letters are set further apart", () => {
  other.line = 10;
  expect(pitch(tiny, "Tokyo")).toBe(8);
  expect(pitch(tiny, "東京")).toBe(10);
  expect(pitch(FONTS.large, "東京")).toBe(20);
  other.line = 0;
});

test("letters in half pixels are drawn finer than the frame in small text, and in whole pixels when text is doubled", () => {
  const before = { glyph: other.glyph, ascent: other.ascent };
  Object.assign(other, { glyph: () => ["###", "#.."], ascent: 1 });
  const frame = new Frame();
  frame.resize(20, 20);
  // Three half pixels across take two pixels of the frame.
  expect(measure(tiny, "東")).toBe(2);
  drawText(frame, tiny, "東", 3, 6, 7);
  // The rows start a rise of 1 - 5 above the top of the line, at y 10, which is half-pixel row 20.
  expect([...frame.fine.slice(20 * 40 + 6, 20 * 40 + 9)]).toEqual([8, 8, 8]);
  expect(frame.fine[21 * 40 + 6]).toBe(8);
  expect(frame.color.every((color) => color === 0)).toBe(true);
  // Doubled, the rise is 1 * 2 - 14: the rows start at y 12.
  drawText(frame, FONTS.large, "東", 0, 0, 7);
  expect([...frame.color.slice(12 * 20, 12 * 20 + 4)]).toEqual([7, 7, 7, 0]);
  expect(frame.color[13 * 20]).toBe(7);
  expect(measure(FONTS.large, "東")).toBe(3);
  Object.assign(other, before);
});

test("bolder strokes grow to the right only where a gap stays after them", () => {
  expect(bolder(["#...", "#.#.", "##..", "..#."])).toEqual(["##..", "#.##", "###.", "..##"]);
});
