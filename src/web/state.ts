import { METERS_PER_POINT, type GamePrompt, type Verdict } from "../shared/types";

/** Seconds of air the diver has for each prompt. Wrong answers can be retried until it runs out. */
export const AIR_SECONDS = 18;

/** A lamp hung on the line: lit by a correct answer, dead when the air ran out first. */
export type Lamp = { depth: number; lit: boolean };
export type Result = { answer: string; rarity: number; correct: boolean };
/** After the last verdict the diver is hauled up ("ascent"); at the surface the logbook opens ("done"). */
export type Phase = "title" | "ask" | "verdict" | "ascent" | "done";

export type Game = {
  phase: Phase;
  /** Seconds since the phase began. */
  phaseTime: number;
  prompts: GamePrompt[];
  /** Index of the current prompt. */
  round: number;
  input: string;
  air: number;
  /** True while an answer is with the server. */
  judging: boolean;
  /** The latest wrong answer to this prompt, and the `phaseTime` at which it was rejected. */
  rejected: { text: string; at: number } | null;
  /** Depth in metres. */
  depth: number;
  lamps: Lamp[];
  /** How the current round ended, once it has. */
  result: Result | null;
  /** How every finished round ended, in order. */
  results: Result[];
};

export function createGame(): Game {
  return {
    phase: "title", phaseTime: 0, prompts: [], round: 0, input: "", air: AIR_SECONDS,
    judging: false, rejected: null, depth: 0, lamps: [], result: null, results: [],
  };
}

/** Seconds the haul back to the surface takes: longer from deeper, but never long. */
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

/** Begin a dive: in the built-in packs, or in the one of the player's own packs that `pack` names. */
export async function start(game: Game, pack?: string) {
  const res = await fetch(pack ? `/api/game?pack=${pack}` : "/api/game");
  if (!res.ok) return;
  const { prompts } = (await res.json()) as { prompts: GamePrompt[] };
  Object.assign(game, createGame(), { prompts });
  enter(game, "ask");
}

/** The air ran out before a correct answer: the round is lost. */
function fail(game: Game) {
  game.lamps.push({ depth: game.depth, lit: false });
  finish(game, { answer: "", rarity: 0, correct: false });
}

/** Send what has been typed to be judged. A wrong answer only costs the time it took. */
async function attempt(game: Game) {
  const prompt = game.prompts[game.round]!;
  const typed = game.input.trim();
  game.input = "";
  game.judging = true;
  const res = await fetch("/api/answer", {
    method: "POST",
    body: JSON.stringify({ promptId: prompt.id, answer: typed }),
  });
  const verdict = (await res.json()) as Verdict;
  // The dive was left while the answer was with the server: it counts for nothing.
  if (game.prompts[game.round] !== prompt) return;
  game.judging = false;
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

/** Leave the dive where it is and go back to the title. Nothing of it is kept, so no logbook opens. */
export function leave(game: Game) {
  Object.assign(game, createGame());
}

/** Advance the clocks. When the air runs out, whatever is typed gets one last chance. */
export function tick(game: Game, dt: number) {
  game.phaseTime += dt;
  if (game.phase === "ascent" && game.phaseTime >= ascentSeconds(game.depth)) enter(game, "done");
  if (game.phase !== "ask") return;
  game.air = Math.max(0, game.air - dt);
  if (game.air > 0 || game.judging) return;
  if (game.input.trim()) void attempt(game);
  else fail(game);
}

/** The one button: start, try an answer, or move on. */
export function pressEnter(game: Game) {
  if (game.phase === "title") {
    void start(game);
  } else if (game.phase === "done") {
    // Closing the logbook leads back to the title. Not at once, in case Enter was pressed during the ascent.
    if (game.phaseTime > 1) Object.assign(game, createGame());
  } else if (game.phase === "ask") {
    if (game.input.trim() && !game.judging) void attempt(game);
  } else if (game.phase === "verdict" && game.phaseTime > 0.4) {
    game.round++;
    game.input = "";
    game.air = AIR_SECONDS;
    game.rejected = null;
    game.result = null;
    enter(game, game.round === game.prompts.length ? "ascent" : "ask");
  }
}
