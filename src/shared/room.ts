import type { GamePrompt, Verdict } from "./types";

export const MAX_PLAYERS = 6;
export const ROOM_CODE_LENGTH = 5;
/** How many colours the diver's suit comes in. A suit is a number from 0 up to this. */
export const SUITS = 6;

export type Mode = "deepest" | "longest";
/** Seconds of air for each turn: the limits the host may set, and where each mode starts. */
export const AIR_MIN = 5;
export const AIR_MAX = 60;
export const DEFAULT_AIR: Record<Mode, number> = { deepest: 30, longest: 15 };

/** What the host decides. The prompts come from the built-in packs, from packs of the host's own (`ownPacks` holds their ids), or both. */
export type RoomSettings = { mode: Mode; air: number; builtIn: boolean; ownPacks: string[]; judging: boolean };
export const DEFAULT_SETTINGS: RoomSettings = { mode: "deepest", air: DEFAULT_AIR.deepest, builtIn: true, ownPacks: [], judging: false };

/** How many prompts a dive in "deepest" mode asks. */
export const DIVE_PROMPTS = 10;
/** Seconds everyone sees a verdict before the next turn. */
export const PAUSE_SECONDS = 2.5;
/** In "longest", the hearts a diver starts with, the most they can have, and the points of rarity that fill the bar and give one more. */
export const START_HEARTS = 2;
export const MAX_HEARTS = 5;
export const BAR_FULL = 100;

export type RoomPlayer = { id: number; nickname: string; suit: number; ready: boolean; host: boolean };
/**
 * A diver of the dive under way: their depth in metres, and the lamps on their line. In "longest" also their hearts,
 * the points in their bar, and whether they are out of the dive (no hearts left).
 */
export type DiverView = { id: number; depth: number; lamps: { depth: number; lit: boolean }[]; hearts: number; bar: number; out: boolean };
/**
 * The dive under way, as it stood when it was sent. `round` counts prompts from 0. `air` is
 * the seconds left to the diver whose turn it is, and runs down from the moment of sending
 * while `running`. `refused` is the latest answer of this turn that lit nothing, numbered so
 * that a repeat of the same words is still news. `verdict`, during the pause after a turn, is
 * how it ended: `answer` is null when the air ran out.
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
};
/** One answer a diver gave: the prompt it was to, the pack's answer (null when the air ran out) and its rarity. */
export type Said = { prompt: string; answer: string | null; rarity: number };
/**
 * How a dive ended for one diver: how deep they went, whether they won, their place (from 1), their points (the
 * rarities of their lit lamps), their lamps, every answer they gave, and in "longest" the prompt they went out at
 * (counted from 1; null for one still in).
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
  | { type: "create"; nickname: string; suit: number }
  | { type: "join"; code: string; nickname: string; suit: number }
  | { type: "ready"; ready: boolean }
  | { type: "settings"; settings: Partial<RoomSettings> }
  | { type: "start" }
  | { type: "typing"; text: string }
  | { type: "answer"; text: string }
  | { type: "leave" };

export type Refusal = "no-room" | "full" | "name-taken" | "bad-name" | "bad-suit" | "not-host" | "bad-settings" | "not-ready" | "no-prompts";
/** `room` is the whole room again, sent after every change to it. `closed` means the host left and the room is gone. */
export type ServerMessage = { type: "room"; room: RoomView } | { type: "refused"; reason: Refusal } | { type: "closed" };
