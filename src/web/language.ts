import { LANGUAGES, LANGUAGE_COOKIE, isLanguage, wordsIn, type Language } from "../shared/language";

/** Chinese written in traditional characters: in Taiwan, Hong Kong and Macao, or asked for by its script. */
const TRADITIONAL = /^zh-(hant|tw|hk|mo)\b/;

/** The first language the browser asks for that the game speaks, by its main part ("zh-HK" asks for traditional Chinese). */
function preferred(): Language {
  for (const tag of navigator.languages.map((tag) => tag.toLowerCase())) {
    if (TRADITIONAL.test(tag)) return "zh-TW";
    const found = LANGUAGES.find((language) => language.split("-")[0] === tag.split("-")[0]);
    if (found) return found;
  }
  return "en";
}

function saved(): Language | undefined {
  const value = document.cookie.match(new RegExp(`(?:^|; )${LANGUAGE_COOKIE}=([^;]*)`))?.[1];
  return isLanguage(value) ? value : undefined;
}

/** Tests run without a browser, in English. */
const browser = typeof document !== "undefined";
let language: Language = browser ? (saved() ?? preferred()) : "en";

/** The words of the player's language. Asked for where they are used, so a change of language shows at once. */
export const t = () => wordsIn(language);
export const currentLanguage = () => language;

export function setLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next;
  document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax`;
}

if (browser) setLanguage(language);
