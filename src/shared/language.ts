import { en, type Words } from "./words/en";
import { zhCN } from "./words/zh-CN";
import { zhTW } from "./words/zh-TW";

export const LANGUAGES = ["en", "zh-CN", "zh-TW"] as const;
export type Language = (typeof LANGUAGES)[number];

const WORDS: Record<Language, Words> = { en, "zh-CN": zhCN, "zh-TW": zhTW };
/** What Claude is told the player's language is. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese (Taiwan)" };

/** The browser keeps the player's language in this cookie, so the server answers in it too. */
export const LANGUAGE_COOKIE = "language";

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);
export const wordsIn = (language: Language): Words => WORDS[language];
