export type Pack = { id: string; name: string; prompts: Prompt[] };
export type Prompt = { id: string; text: string; answers: Answer[] };
/** `rarity` runs from 1 (everyone says it) to 100 (almost nobody does). */
export type Answer = { text: string; aliases?: string[]; rarity: number };

/** No spelling in a pack may be longer, or it could not be typed. */
export const MAX_ANSWER_LENGTH = 40;

/** For an uploaded pack. The largest built-in pack is about 7 KB. */
export const MAX_PACK_BYTES = 200_000;
/** As the browser sees it: no prompts or answers. */
export type PackSummary = { id: string; name: string; prompts: number };

/** A prompt as the browser sees it: no answers. */
export type GamePrompt = { id: string; text: string; pack: string };
/** `answer` is the pack's spelling of a correct answer, or null when wrong (rarity 0). */
export type Verdict = { answer: string | null; rarity: number };

export type Config = { devMode: boolean };

/** A correct answer scores its rarity in points; each point is this many metres. */
export const METERS_PER_POINT = 11;

/** Whose API keys a player may keep: Anthropic's (Claude writes packs and judges answers) and TypeSafe's (Jev judges answers). */
export const PROVIDERS = ["anthropic", "jev"] as const;
export type Provider = (typeof PROVIDERS)[number];
/**
 * Why the last request the live judge made with a key failed: the provider refused the key,
 * it is out of credit or over its rate limit, or no answer came (a timeout, an outage).
 */
export type KeyFailure = "refused" | "limited" | "unanswered";
/**
 * A signed-in player, as the browser sees them. `keys` is which API keys of theirs are kept: the keys themselves stay on the server.
 * `failed` is why the last use of each kept key failed, or null if it worked.
 */
export type Account = { username: string; keys: Record<Provider, boolean>; failed: Record<Provider, KeyFailure | null> };
export const MAX_KEY_LENGTH = 300;
export const MAX_TOPIC_LENGTH = 60;
export const MAX_INSTRUCTIONS_LENGTH = 300;
/** How many prompts a player may ask Claude for. A dive asks 10 of them, picked at random. */
export const WRITTEN_PROMPTS = [10, 20, 30, 40, 50];
/** What a player asks Claude for: `instructions` are their own words on top of the game's. */
export type WriteOrder = { topic: string; instructions: string; prompts: number; search: boolean };
/** Lower-case letters and digits only: what the pixel fonts can draw. */
export const USERNAME = /^[a-z0-9]{3,16}$/;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
