import { LANGUAGES, wordsIn } from "../../shared/language";
import { currentLanguage, setLanguage, t } from "../language";
import { LEVELS, type Sound } from "../sound";
import { GLOWS, type Display, type Frame } from "./frame";
import type { Part, Step } from "./ui";

const COG = [
  "....66....", ".66.66.66.", ".66666666.", "..666666..", "6666..6666",
  "6666..6666", "..666666..", ".66666666.", ".66.66.66.", "....66....",
];

export function drawCog(frame: Frame) {
  frame.sprite(COG, frame.width - 13, 1);
}

/** With room around the cog for a fingertip. */
export function overCog(frame: Frame, x: number, y: number): boolean {
  return x >= frame.width - 18 && y < 15;
}

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
