import { expect, test } from "bun:test";
import { LOST_SECONDS } from "../state";
import { FONTS } from "./font";
import { LAST_WORDS, SCARE_FOR, scareAt } from "./glitch";

test("the eyes after every line that scares are over before the end screen opens", () => {
  for (const { text } of LAST_WORDS.filter((words) => words.scares)) expect(scareAt(text) + SCARE_FOR).toBeLessThan(LOST_SECONDS);
});

test("every last word is drawn with the game's own font", () => {
  const glyphs = FONTS.medium.glyphs as Record<string, unknown>;
  for (const { text } of LAST_WORDS) for (const letter of text.replaceAll(" ", "")) expect(glyphs[letter], `${letter} in "${text}"`).toBeDefined();
});
