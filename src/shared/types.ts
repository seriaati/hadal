/** A pack file in `packs/`. */
export type Pack = { id: string; name: string; prompts: Prompt[] };
export type Prompt = { id: string; text: string; answers: Answer[] };
/** `rarity` runs from 1 (everyone says it) to 100 (almost nobody does). */
export type Answer = { text: string; aliases?: string[]; rarity: number };

/** The longest answer the game lets a player type, so no spelling in a pack may be longer. */
export const MAX_ANSWER_LENGTH = 40;

/** A prompt as the browser sees it: no answers. */
export type GamePrompt = { id: string; text: string; pack: string };
/** `answer` is the pack's spelling of a correct answer, or null when wrong (rarity 0). */
export type Verdict = { answer: string | null; rarity: number };

/** What the server tells the browser about how this instance is set up. */
export type Config = { devMode: boolean };

/** A correct answer scores its rarity in points; each point is this many metres. */
export const METERS_PER_POINT = 11;

/** A signed-in player, as the browser sees them. */
export type Account = { username: string };
/** A username is 3 to 16 letters or digits, kept in lower case: what the pixel fonts can draw. */
export const USERNAME = /^[a-z0-9]{3,16}$/;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
