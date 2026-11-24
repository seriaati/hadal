import { LANGUAGES, wordsIn } from "../../shared/language";
import { currentLanguage, setLanguage, t } from "../language";
import { LEVELS, type Sound } from "../sound";
import { GLOWS, type Display } from "./frame";
import type { Part, Step } from "./ui";

export function settingsStep(sound: Sound, display: Display): Step {
  const shift = (way: -1 | 1) => setLanguage(LANGUAGES[(LANGUAGES.indexOf(currentLanguage()) + way + LANGUAGES.length) % LANGUAGES.length]!);
  const shiftGlow = (way: -1 | 1) => display.setGlow(GLOWS[(GLOWS.indexOf(display.setting) + way + GLOWS.length) % GLOWS.length]!);
  const glows = t().settings.glows;
  return {
    title: t().settings.title,
    rows: [
      // Each language is named in its own words, so it can be found by someone who cannot read the others.
      { kind: "press", id: "language", label: t().settings.language, value: wordsIn(currentLanguage()).name, press: () => shift(1), shift },
      ...LEVELS.map((name): Part => ({
        kind: "slider",
        id: name,
        label: t().settings.levels[name],
        value: sound.levels[name],
        set: (value) => {
          sound.setLevel(name, value);
          sound.tick();
        },
      })),
      {
        kind: "press",
        id: "glow",
        label: t().settings.glow,
        // Auto tells the level it has come to.
        value: display.setting === "auto" ? glows.autoAt(glows[display.glow]) : glows[display.setting],
        press: () => shiftGlow(1),
        shift: shiftGlow,
      },
    ],
  };
}
