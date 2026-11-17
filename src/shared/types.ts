/** A pack file in `packs/`. */
export type Pack = { id: string; name: string; prompts: Prompt[] };
export type Prompt = { id: string; text: string; answers: Answer[] };
/** `rarity` runs from 1 (everyone says it) to 100 (almost nobody does). */
export type Answer = { text: string; aliases?: string[]; rarity: number };

/** The longest answer the game lets a player type, so no spelling in a pack may be longer. */
export const MAX_ANSWER_LENGTH = 40;

/** The largest pack file a player may upload. The largest built-in pack is about 7 KB. */
export const MAX_PACK_BYTES = 200_000;
/** One of a player's own packs, as the browser sees it: no prompts or answers. */
export type PackSummary = { id: string; name: string; prompts: number };

/** A prompt as the browser sees it: no answers. */
export type GamePrompt = { id: string; text: string; pack: string };
/** `answer` is the pack's spelling of a correct answer, or null when wrong (rarity 0). */
export type Verdict = { answer: string | null; rarity: number };

/** What the server tells the browser about how this instance is set up. */
export type Config = { devMode: boolean };

/** A correct answer scores its rarity in points; each point is this many metres. */
export const METERS_PER_POINT = 11;

/** A signed-in player, as the browser sees them. `key` is whether an API key of theirs is kept: the key itself stays on the server. */
export type Account = { username: string; key: boolean };
export const MAX_KEY_LENGTH = 300;
/** What a player may ask a pack to be written about. */
export const MAX_TOPIC_LENGTH = 60;
/** A username is 3 to 16 letters or digits, kept in lower case: what the pixel fonts can draw. */
export const USERNAME = /^[a-z0-9]{3,16}$/;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
