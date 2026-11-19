import type { GamePrompt, Verdict } from "./types";

export const MAX_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 5;
/** A suit is a colour index below this. */
export const SUITS = 6;

export type Mode = "deepest" | "longest" | "chaos";
export const MODES: Mode[] = ["deepest", "longest", "chaos"];
/** Seconds of air for each turn. */
export const AIR_MIN = 5;
export const AIR_MAX = 60;
export const DEFAULT_AIR: Record<Mode, number> = { deepest: 30, longest: 15, chaos: 8 };

/** How easily a diver wins a new heart in "longest". */
export type Hearts = "easy" | "medium" | "hard";
export const HEARTS: Hearts[] = ["easy", "medium", "hard"];

/** `builtIn` and `ownPacks` hold the ids of the built-in packs and of the host's own packs that the prompts come from. */
export type RoomSettings = { mode: Mode; air: number; hearts: Hearts; builtIn: string[]; ownPacks: string[]; judging: boolean };
/** A new room plays every built-in pack, which only the server knows. */
export const DEFAULT_SETTINGS: Omit<RoomSettings, "builtIn"> = { mode: "deepest", air: DEFAULT_AIR.deepest, hearts: "medium", ownPacks: [], judging: false };

/** How many prompts a dive in "deepest" mode asks. */
export const DIVE_PROMPTS = 10;
/** Seconds everyone sees a verdict before the next turn. */
export const PAUSE_SECONDS = 2.5;
/**
 * Seconds the server waits after a turn's air runs out. The diver's own browser counts the air
 * from when it heard of the turn, a little behind the server, and says when it ran out, with
 * what was typed; the server ends the turn without it only if that does not come in time.
 */
export const GRACE_SECONDS = 1;
/** Seconds the submarines of a chaos dive take to let the divers go, before the first turn. */
export const DROP_SECONDS = 4;
/** In "longest", the hearts a diver starts with, the most they can have, and the points of rarity that fill the bar and give one more. In "chaos" a diver has one heart, and wins no more. */
export const START_HEARTS = 2;
export const MAX_HEARTS = 5;
/** The points that fill the bar, by how easily hearts are won. At every level one rare answer alone is not a heart. */
export const BAR_FULL: Record<Hearts, number> = { easy: 175, medium: 275, hard: 400 };

export type RoomPlayer = { id: number; nickname: string; suit: number; ready: boolean; host: boolean };
/**
 * A diver of the dive under way: their depth in metres, and the lamps on their line. In "longest" and "chaos" also
 * their hearts, the points in their bar, and whether they are out of the dive (no hearts left).
 */
export type DiverView = { id: number; depth: number; lamps: { depth: number; lit: boolean }[]; hearts: number; bar: number; out: boolean };
/**
 * The dive under way, as it stood when it was sent. `round` counts prompts from 0. `air` is
 * the seconds left to the diver whose turn it is, and runs down from the moment of sending
 * while `running`. `refused` is the latest answer of this turn that lit nothing, numbered so
 * that a repeat of the same words is still news. `verdict`, during the pause after a turn, is
 * how it ended: `answer` is null when the air ran out. `drop` is the seconds left, when it was sent, of a chaos
 * dive's drop-off, before the first turn's air starts to run.
 */
export type DiveView = {
  prompt: GamePrompt;
  round: number;
  of: number;
  order: number[];
  turn: number;
  air: number;
  running: boolean;
  typing: string;
  judging: string | null;
  taken: string[];
  refused: { text: string; taken: boolean; count: number } | null;
  verdict: Verdict | null;
  divers: DiverView[];
  drop: number;
};
/** `answer` is the pack's answer, null when the air ran out. */
export type Said = { prompt: string; answer: string | null; rarity: number };
/**
 * `place` counts from 1. `points` is the sum of the rarities of their lit lamps. `out` is, in "longest" and "chaos",
 * the prompt they went out at (counted from 1; null for one still in).
 */
export type Finish = {
  id: number;
  depth: number;
  won: boolean;
  place: number;
  points: number;
  lamps: DiverView["lamps"];
  said: Said[];
  out: number | null;
};
/**
 * A room as one browser is sent it. `you` is the id of that browser's player. `last` is the
 * dive before, in its mode, until the next one starts.
 */
export type RoomView = {
  code: string;
  you: number;
  players: RoomPlayer[];
  settings: RoomSettings;
  dive: DiveView | null;
  last: { mode: Mode; divers: Finish[] } | null;
};

export type ClientMessage =
  /** `settings` are those the host's browser remembers from their last room; the server keeps what still holds of them. */
  | { type: "create"; nickname: string; suit: number; settings?: Partial<RoomSettings> }
  | { type: "join"; code: string; nickname: string; suit: number }
  /** The page's connection closed, and it takes its place in the room back: player `id`, or if the room is gone, as one of these settings. */
  | { type: "back"; code: string; id: number; nickname: string; suit: number; settings: Partial<RoomSettings> }
  | { type: "ready"; ready: boolean }
  | { type: "suit"; suit: number }
  | { type: "settings"; settings: Partial<RoomSettings> }
  | { type: "start" }
  | { type: "typing"; text: string }
  | { type: "answer"; text: string }
  | { type: "out"; text: string }
  | { type: "host"; id: number }
  | { type: "remove"; id: number; ban: boolean }
  | { type: "leave" };

export type Refusal = "no-room" | "full" | "name-taken" | "bad-name" | "bad-suit" | "not-host" | "bad-settings" | "not-ready" | "no-packs" | "no-prompts" | "banned";
/** How a player went out of a room: of their own accord, or taken out by the host, with or without a ban. */
export type Gone = "left" | "removed" | "banned";
/**
 * `room` is the whole room again, sent after every change to it. `removed` means the host took the player out of the
 * room, and with `banned` they cannot come back to it. `gone` tells the others how a player went, just before the room
 * without them.
 */
export type ServerMessage =
  | { type: "room"; room: RoomView }
  | { type: "refused"; reason: Refusal }
  | { type: "removed"; banned: boolean }
  | { type: "gone"; id: number; how: Gone };
