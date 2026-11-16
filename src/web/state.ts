import { METERS_PER_POINT, type GamePrompt, type Verdict } from "../shared/types";

/** Seconds of air the diver has for each prompt. Wrong answers can be retried until it runs out. */
export const AIR_SECONDS = 18;

/** A lamp hung on the line: lit by a correct answer, dead when the air ran out first. */
export type Lamp = { depth: number; lit: boolean };
export type Result = { answer: string; rarity: number; correct: boolean };
export type Phase = "title" | "ask" | "verdict" | "done";

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
};

export function createGame(): Game {
  return {
    phase: "title", phaseTime: 0, prompts: [], round: 0, input: "", air: AIR_SECONDS,
    judging: false, rejected: null, depth: 0, lamps: [], result: null,
  };
}

function enter(game: Game, phase: Phase) {
  game.phase = phase;
  game.phaseTime = 0;
}

async function start(game: Game) {
  const res = await fetch("/api/game");
  const { prompts } = (await res.json()) as { prompts: GamePrompt[] };
  Object.assign(game, createGame(), { prompts });
  enter(game, "ask");
}

/** The air ran out before a correct answer: the round is lost. */
function fail(game: Game) {
  game.lamps.push({ depth: game.depth, lit: false });
  game.result = { answer: "", rarity: 0, correct: false };
  enter(game, "verdict");
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
  game.judging = false;
  if (verdict.answer !== null) {
    game.depth += verdict.rarity * METERS_PER_POINT;
    game.lamps.push({ depth: game.depth, lit: true });
    game.result = { answer: verdict.answer, rarity: verdict.rarity, correct: true };
    enter(game, "verdict");
  } else if (game.air <= 0) {
    fail(game);
  } else {
    game.rejected = { text: typed, at: game.phaseTime };
  }
}

/** Advance the clocks. When the air runs out, whatever is typed gets one last chance. */
export function tick(game: Game, dt: number) {
  game.phaseTime += dt;
  if (game.phase !== "ask") return;
  game.air = Math.max(0, game.air - dt);
  if (game.air > 0 || game.judging) return;
  if (game.input.trim()) void attempt(game);
  else fail(game);
}

/** The one button: start, try an answer, or move on. */
export function pressEnter(game: Game) {
  if (game.phase === "title" || game.phase === "done") {
    void start(game);
  } else if (game.phase === "ask") {
    if (game.input.trim() && !game.judging) void attempt(game);
  } else if (game.phase === "verdict" && game.phaseTime > 0.4) {
    game.round++;
    game.input = "";
    game.air = AIR_SECONDS;
    game.rejected = null;
    game.result = null;
    enter(game, game.round === game.prompts.length ? "done" : "ask");
  }
}
