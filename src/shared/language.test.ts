import { expect, test } from "bun:test";
import { LANGUAGES, wordsIn } from "./language";
import { en } from "./words/en";

// The compiler checks that every language has every key; it cannot check how long the lists are.
test("every language names every ocean zone and every light", () => {
  for (const language of LANGUAGES) {
    expect(wordsIn(language).dive.zones).toHaveLength(en.dive.zones.length);
    expect(wordsIn(language).dive.lights).toHaveLength(en.dive.lights.length);
  }
});
