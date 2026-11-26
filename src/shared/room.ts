import type { GamePrompt, Verdict } from "./types";

/** The divers a room holds, and the ghosts besides them, who only watch every dive. */
export const MAX_PLAYERS = 6;
export const MAX_GHOSTS = 10;
export const ROOM_CODE_LENGTH = 5;
/** A suit is a colour index below this. */
export const SUITS = 10;

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

/**
 * The most characters a chat message may have (with its speaker's name, two lines over the boat on a phone, all the room
 * there is), and the least time between two of one player's, in seconds.
 */
export const CHAT_MAX = 50;
export const CHAT_EVERY = 1;

/** How many prompts a dive in "deepest" mode asks. */
export const DIVE_PROMPTS = 10;
/** Seconds everyone sees a verdict before the next turn. */
export const PAUSE_SECONDS = 2.5;
/** Seconds longer that pause is when the turn put its diver out of the dive, for everyone to see them go. */
export const DEATH_SECONDS = 2;
/**
 * Seconds the server waits after a turn's air runs out. The diver's own browser counts the air
 * from when it heard of the turn, a little behind the server, and says when it ran out, with
 * what was typed; the server ends the turn without it only if that does not come in time.
 */
export const GRACE_SECONDS = 1;
/** Seconds the submarines of a chaos dive take to let the divers go, before the first turn. */
export const DROP_SECONDS = 4;
/** In "longest", the hearts a diver starts with and the most they can have. In "chaos" a diver has one heart, and wins no more. */
export const START_HEARTS = 2;
export const MAX_HEARTS = 5;
/** The points that fill the bar, by how easily hearts are won. At every level one rare answer alone is not a heart. */
export const BAR_FULL: Record<Hearts, number> = { easy: 175, medium: 275, hard: 400 };

/** `muted`: the host has stopped them talking to the room. `ghost`: they take no place among the divers, and only watch the dives. */
export type RoomPlayer = { id: number; nickname: string; suit: number; ready: boolean; host: boolean; muted: boolean; ghost: boolean };
/**
 * A diver of the dive under way: their depth in metres, and the lamps on their line. In "longest" and "chaos" also
 * their hearts, the points in their bar, and whether they are out of the dive (no hearts left).
 */
export type DiverView = { id: number; depth: number; lamps: { depth: number; lit: boolean }[]; hearts: number; bar: number; out: boolean };
/** The dive under way, as it stood when it was sent. */
export type DiveView = {
  prompt: GamePrompt;
  /** Counts from 0. */
  round: number;
  rounds: number;
  order: number[];
  turn: number;
  /** Seconds left to the diver whose turn it is; runs down from the moment of sending while `running`. */
  air: number;
  running: boolean;
  typing: string;
  judging: string | null;
  taken: string[];
  /** The latest answer of this turn that lit nothing, numbered so that a repeat of the same words is still news. */
  refused: { text: string; taken: boolean; count: number } | null;
  /** How the turn ended, during the pause after it. */
  verdict: Verdict | null;
  divers: DiverView[];
  /** Seconds of a chaos dive's drop-off left when this was sent, before the first turn's air starts to run. */
  dropLeft: number;
};
/** `answer` is the pack's answer, null when the air ran out. */
export type Said = { prompt: string; answer: string | null; rarity: number };
export type Finish = {
  id: number;
  depth: number;
  won: boolean;
  /** Counts from 1. */
  place: number;
  /** The sum of the rarities of their lit lamps. */
  points: number;
  lamps: DiverView["lamps"];
  said: Said[];
  /** In "longest" and "chaos", the prompt they went out at, counted from 1; null for one still in. */
  outAt: number | null;
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
  | { type: "join"; code: string; nickname: string; suit: number; ghost?: boolean }
  /** The page's connection closed, and it takes its place in the room back: player `id`, or if the room is gone, as one of these settings. */
  | { type: "back"; code: string; id: number; nickname: string; suit: number; ghost?: boolean; settings: Partial<RoomSettings> }
  | { type: "ready"; ready: boolean }
  | { type: "suit"; suit: number }
  /** Between dives, the player becomes a ghost, or a diver again if a place is free; with `id`, the host makes that player a ghost. */
  | { type: "ghost"; ghost: boolean; id?: number }
  | { type: "settings"; settings: Partial<RoomSettings> }
  | { type: "start" }
  | { type: "typing"; text: string }
  | { type: "answer"; text: string }
  | { type: "out"; text: string }
  | { type: "host"; id: number }
  | { type: "remove"; id: number; ban: boolean }
  | { type: "mute"; id: number; muted: boolean }
  | { type: "leave" }
  | { type: "chat"; text: string }
  /** Asks the server to answer at once, so the page can tell a connection that still works from one that has silently broken. */
  | { type: "ping" };

/**
 * `gives-answer`: what a player said in a dive names an answer to the prompt that nobody has taken yet. `muted`: the host has
 * stopped them talking. `full`: every diver's place is taken; `ghosts-full`: so is every ghost's; `no-place`: a ghost cannot
 * become a diver while every place is taken. `no-divers`: everyone in the room is a ghost.
 */
export type Refusal =
  | "no-room" | "full" | "ghosts-full" | "no-place" | "name-taken" | "bad-name" | "bad-suit" | "not-host" | "bad-settings" | "no-packs" | "no-prompts" | "no-divers"
  | "banned" | "gives-answer" | "muted";
/** How a player went out of a room: of their own accord, or taken out by the host, with or without a ban. */
export type Gone = "left" | "removed" | "banned";
/**
 * `room` is the whole room again, sent after every change to it. `removed` means the host took the player out of the
 * room, and with `banned` they cannot come back to it. `gone` tells the others how a player went, just before the room
 * without them. `called` tells everyone the host tried to start while some were not ready. `pong` answers a `ping`.
 * `chat` is what player `id` said to the room; it is not kept.
 */
export type ServerMessage =
  | { type: "room"; room: RoomView }
  | { type: "pong" }
  | { type: "refused"; reason: Refusal }
  | { type: "removed"; banned: boolean }
  | { type: "gone"; id: number; how: Gone }
  | { type: "called" }
  | { type: "chat"; id: number; text: string };
