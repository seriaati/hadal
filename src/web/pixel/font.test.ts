import { expect, test } from "bun:test";
import { FONTS, measure, wrap } from "./font";

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
