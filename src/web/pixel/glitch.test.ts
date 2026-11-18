import { expect, test } from "bun:test";
import { LANGUAGES, wordsIn } from "../../shared/language";
import { en } from "../../shared/words/en";
import { LOST_SECONDS } from "../state";
import { FONTS } from "./font";
import { SCARE_FOR, scareAt } from "./glitch";

test("the eyes after every line that scares are over before the end screen opens", () => {
  for (const language of LANGUAGES) for (const text of wordsIn(language).lastWords.scary) expect(scareAt(text) + SCARE_FOR).toBeLessThan(LOST_SECONDS);
});

test("every last word in English is drawn with the game's own font", () => {
  const glyphs = FONTS.medium.glyphs as Record<string, unknown>;
  const { calm, scary } = en.lastWords;
  for (const text of [...calm, ...scary]) for (const letter of text.replaceAll(" ", "")) expect(glyphs[letter], `${letter} in "${text}"`).toBeDefined();
});
