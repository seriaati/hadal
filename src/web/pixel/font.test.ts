import { expect, test } from "bun:test";
import { FONTS, measure, other, pitch, plain, wrap } from "./font";

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
  other.glyph = (unit) => (/[ -~]/.test(unit) ? undefined : ["####", "####"]);
  expect(measure(tiny, "A東京")).toBe(3 + 1 + 4 + 1 + 4);
  expect(wrap(tiny, "東京東京東京", 14)).toEqual(["東京東", "京東京"]);
  // A letter keeps the marks it carries: Thai "ก้" is two characters and one letter.
  expect(wrap(tiny, "ก้ก้ก้", 9)).toEqual(["ก้ก้", "ก้"]);
  other.glyph = before;
  expect(measure(tiny, "A東京")).toBe(3);
});

test("lines of the other font's taller letters are set further apart", () => {
  other.line = 10;
  expect(pitch(tiny, "Tokyo")).toBe(8);
  expect(pitch(tiny, "東京")).toBe(10);
  expect(pitch(FONTS.large, "東京")).toBe(20);
  other.line = 0;
});
