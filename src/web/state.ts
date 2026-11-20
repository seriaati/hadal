import { DROP_SECONDS } from "../shared/room";
import { METERS_PER_POINT, type GamePrompt, type Verdict } from "../shared/types";

/** Seconds of air the diver has for each prompt. Wrong answers can be retried until it runs out. */
export const AIR_SECONDS = 18;
export const CHAOS_AIR_SECONDS = 8;
export { DROP_SECONDS };
/** How long a lost chaos dive takes to die (its signal, then its last words), before the end screen. */
export const LOST_SECONDS = 7.5;

/** Unlit when the air ran out before a correct answer. */
export type Lamp = { depth: number; lit: boolean };
export type Result = { answer: string; rarity: number; correct: boolean };
/**
 * A chaos dive opens with the diver being dropped off ("drop"). After the last verdict the diver is hauled up ("ascent");
 * at the surface the end screen opens ("done"). A chaos dive ends at the first prompt whose air runs out: the signal is
 * "lost", and then the end screen opens.
 */
export type Phase = "title" | "drop" | "ask" | "verdict" | "ascent" | "lost" | "done";

export type Game = {
  phase: Phase;
  chaos: boolean;
  /** Seconds since the phase began. */
  phaseTime: number;
  prompts: GamePrompt[];
  round: number;
  input: string;
  air: number;
  /** The answer that is with the server, while one is. */
  judging: string | null;
  /** The latest wrong answer to this prompt, and the `phaseTime` at which it was rejected. */
  rejected: { text: string; at: number } | null;
  /** Depth in metres. */
  depth: number;
  lamps: Lamp[];
  result: Result | null;
  results: Result[];
};

export function createGame(): Game {
  return {
    phase: "title", chaos: false, phaseTime: 0, prompts: [], round: 0, input: "", air: AIR_SECONDS,
    judging: null, rejected: null, depth: 0, lamps: [], result: null, results: [],
  };
}

export const fullAir = (game: Game) => (game.chaos ? CHAOS_AIR_SECONDS : AIR_SECONDS);
/** Whether a chaos dive ended because the air ran out. */
export const lostDive = (game: Game) => game.chaos && game.results.at(-1)?.correct === false;

export function ascentSeconds(depth: number): number {
  return 1 + 2 * Math.min(1, depth / 5000);
}

function enter(game: Game, phase: Phase) {
  game.phase = phase;
  game.phaseTime = 0;
}

function finish(game: Game, result: Result) {
  game.result = result;
  game.results.push(result);
  enter(game, "verdict");
}

/** The ids of the built-in packs and of the player's own packs a dive draws from. */
export type Chosen = { builtIn: string[]; own: string[] };

/** Without `packs`, the dive draws from the built-in packs of the player's language. Says whether the dive began. */
export async function start(game: Game, packs?: Chosen, chaos = false): Promise<boolean> {
  const res = await fetch(packs ? `/api/game?${new URLSearchParams({ builtIn: packs.builtIn.join(","), own: packs.own.join(",") })}` : "/api/game");
  if (!res.ok) return false;
  const { prompts } = (await res.json()) as { prompts: GamePrompt[] };
  Object.assign(game, createGame(), { prompts, chaos, air: chaos ? CHAOS_AIR_SECONDS : AIR_SECONDS });
  enter(game, chaos ? "drop" : "ask");
  return true;
}

function fail(game: Game) {
  game.lamps.push({ depth: game.depth, lit: false });
  finish(game, { answer: "", rarity: 0, correct: false });
  if (game.chaos) enter(game, "lost");
}

/** A wrong answer only costs the time it took. */
async function attempt(game: Game) {
  const prompt = game.prompts[game.round]!;
  const typed = game.input.trim();
  game.input = "";
  game.judging = typed;
  const res = await fetch("/api/answer", {
    method: "POST",
    body: JSON.stringify({ promptId: prompt.id, answer: typed }),
  });
  const verdict = (await res.json()) as Verdict;
  // The dive was left while the answer was with the server: it counts for nothing.
  if (game.prompts[game.round] !== prompt) return;
  game.judging = null;
  if (verdict.answer !== null) {
    game.depth += verdict.rarity * METERS_PER_POINT;
    game.lamps.push({ depth: game.depth, lit: true });
    finish(game, { answer: verdict.answer, rarity: verdict.rarity, correct: true });
  } else if (game.air <= 0) {
    fail(game);
  } else {
    game.rejected = { text: typed, at: game.phaseTime };
  }
}

/** Nothing of the dive is kept, so no end screen opens. */
export function leave(game: Game) {
  Object.assign(game, createGame());
}

/** When the air runs out, whatever is typed gets one last chance. */
export function tick(game: Game, dt: number) {
  game.phaseTime += dt;
  if (game.phase === "ascent" && game.phaseTime >= ascentSeconds(game.depth)) enter(game, "done");
  if (game.phase === "drop" && game.phaseTime >= DROP_SECONDS) enter(game, "ask");
  if (game.phase === "lost" && game.phaseTime >= LOST_SECONDS) enter(game, "done");
  // No air is used while an answer is being judged: that wait is not the diver's doing.
  if (game.phase !== "ask" || game.judging) return;
  game.air = Math.max(0, game.air - dt);
  if (game.air > 0) return;
  if (game.input.trim()) void attempt(game);
  else fail(game);
}

export function pressEnter(game: Game) {
  if (game.phase === "title") {
    void start(game);
  } else if (game.phase === "done") {
    // Closing the end screen leads back to the title. Not at once, in case Enter was pressed during the ascent.
    if (game.phaseTime > 1) Object.assign(game, createGame());
  } else if (game.phase === "ask") {
    if (game.input.trim() && !game.judging) void attempt(game);
  } else if (game.phase === "verdict" && game.phaseTime > 0.4) {
    game.round++;
    game.input = "";
    game.air = fullAir(game);
    game.rejected = null;
    game.result = null;
    enter(game, game.round === game.prompts.length ? "ascent" : "ask");
  }
}
