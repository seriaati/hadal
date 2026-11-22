import { expect, test } from "bun:test";
import { LANGUAGES, wordsIn } from "../../shared/language";
import { en } from "../../shared/words/en";
import { LOST_SECONDS, createGame } from "../state";
import { FONTS } from "./font";
import { Frame } from "./frame";
import { DARK_AT, Glitch, SCARE_FOR, scareAt } from "./glitch";

test("the eyes after every line that scares are over before the end screen opens", () => {
  for (const language of LANGUAGES) for (const text of wordsIn(language).lastWords.scary) expect(scareAt(text) + SCARE_FOR).toBeLessThan(LOST_SECONDS);
});

test("every last word in English is drawn with the game's own font", () => {
  const glyphs = FONTS.medium.glyphs as Record<string, unknown>;
  const { calm, scary } = en.lastWords;
  for (const text of [...calm, ...scary]) for (const letter of text.replaceAll(" ", "")) expect(glyphs[letter], `${letter} in "${text}"`).toBeDefined();
});

test("the dark of a lost chaos dive hides words in half pixels too", () => {
  const frame = new Frame();
  frame.resize(40, 30);
  frame.putFine(20, 20, 7);
  const glitch = new Glitch();
  const focus = { x: 20, y: 15 };
  glitch.update(0, 1, frame.height, focus, { ...createGame(), chaos: true, phase: "lost", phaseTime: DARK_AT });
  glitch.apply(frame, new Int16Array(frame.height).fill(0), new Int16Array(frame.height).fill(frame.width - 1), 0, focus);
  expect(frame.fine.some(Boolean)).toBe(false);
});
