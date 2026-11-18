import type { Finish, Mode } from "../../shared/room";
import type { Game } from "../state";

/** A room's dive as the logbook tells it: its mode, and every diver in the dive's order, with their name and suit. */
export type RoomLog = { mode: Mode; divers: (Finish & { name: string; suit: number })[] };
/** What a logbook is drawn for: a single player's dive, or a room's. */
export type Log = Game | RoomLog;

export const isRoom = (log: Log): log is RoomLog => "divers" in log;

/** The suits of the game (steel, teal, pale, green, violet, rose), as watercolour. */
export const SUIT_WASH = ["#5d6f86", "#3f8f88", "#a3b5c2", "#5e8a3c", "#76589a", "#c05a70"];
