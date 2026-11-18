import { en, type Words } from "./words/en";
import { zhCN } from "./words/zh-CN";

export const LANGUAGES = ["en", "zh-CN"] as const;
export type Language = (typeof LANGUAGES)[number];

const WORDS: Record<Language, Words> = { en, "zh-CN": zhCN };
/** What Claude is told the player's language is. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", "zh-CN": "Simplified Chinese" };

/** The browser keeps the player's language in this cookie, so the server answers in it too. */
export const LANGUAGE_COOKIE = "language";

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);
export const wordsIn = (language: Language): Words => WORDS[language];
