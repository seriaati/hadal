export type Pack = { id: string; name: string; prompts: Prompt[] };
export type Prompt = { id: string; text: string; answers: Answer[] };
/**
 * How rare an answer is, from what nearly everyone says first to what almost nobody thinks of, and the
 * points each scores. Every prompt has at least one gem: the most satisfying of its rarest answers.
 */
export const TIERS = { common: 10, familiar: 30, uncommon: 60, rare: 85, gem: 100 } as const;
export type Tier = keyof typeof TIERS;
export type Answer = { text: string; aliases?: string[]; tier: Tier };

/** No spelling in a pack may be longer, or it could not be typed. */
export const MAX_ANSWER_LENGTH = 40;

/** For an uploaded pack: room for prompts with thousands of answers. */
export const MAX_PACK_BYTES = 5_000_000;
/** As the browser sees it: no prompts or answers. */
export type PackSummary = { id: string; name: string; prompts: number };

/** A prompt as the browser sees it: no answers. */
export type GamePrompt = { id: string; text: string; pack: string };
/** `answer` is the pack's spelling of a correct answer, or null when wrong. `rarity` is the points of its tier, 0 when wrong. */
export type Verdict = { answer: string | null; rarity: number };

/** `version` changes whenever the game's own code does: an open page that sees a new one offers to update. */
export type Config = { devMode: boolean; version: string };

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
/** How a pack Claude is writing stands: `done` prompts of `of` are written. `failed` is why it stopped. */
export type Writing = { topic: string; done: number; of: number; failed?: string };
/** Lower-case letters and digits only: what the pixel fonts can draw. */
export const USERNAME = /^[a-z0-9]{3,16}$/;
export const USERNAME_MAX = 16;
/** A name in a room: letters and digits of any script (and the marks some scripts set on their letters), drawn in the fetched font where the pixel fonts have none. */
export const NICKNAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]{0,15}$/u;
export const NICKNAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;
