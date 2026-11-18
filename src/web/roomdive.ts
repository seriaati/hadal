import { DROP_SECONDS, type DiveView } from "../shared/room";
import { createGame, type Game, type Result } from "./state";

/**
 * A dive of a room, as a single-player `Game` that the words and the sound already know how
 * to show: the prompt, and the turn on screen with that diver's own depth and lamps. The scene
 * draws every diver of the dive from the room itself.
 */
export class RoomDive {
  game: Game = createGame();
  /** Which turn is on screen ("round:diver"), and since when, in seconds. */
  private shown = "";
  private since = 0;
  private verdictAt = 0;
  private refusals = 0;
  /** The turns whose ending has been heard, so the sounds of an ending play once. */
  private ended = new Set<string>();

  /** A new dive begins: nothing of the one before is kept. */
  reset() {
    this.game = createGame();
    this.shown = "";
    this.refusals = 0;
    this.ended.clear();
  }

  /** Fold the dive, as last sent at `sent` (seconds, like `now`), into the game. A chaos dive opens with the drop-off. */
  update(dive: DiveView, sent: number, now: number, chaos: boolean): Game {
    const game = this.game;
    game.chaos = chaos;
    const diver = dive.divers.find((one) => one.id === dive.turn) ?? { depth: 0, lamps: [] };
    const turn = `${dive.round}:${dive.turn}${dive.drop ? ":drop" : ""}`;
    if (turn !== this.shown) {
      this.shown = turn;
      this.since = now;
    }
    if (dive.verdict && game.phase !== "verdict") this.verdictAt = now;
    if (dive.verdict && !this.ended.has(turn)) {
      this.ended.add(turn);
      const result: Result = { answer: dive.verdict.answer ?? "", rarity: dive.verdict.rarity, correct: dive.verdict.answer !== null };
      game.results.push(result);
    }
    game.phase = dive.drop ? "drop" : dive.verdict ? "verdict" : "ask";
    game.phaseTime = dive.drop ? DROP_SECONDS - dive.drop + (now - sent) : now - (dive.verdict ? this.verdictAt : this.since);
    game.prompts = Array.from({ length: dive.of }, () => dive.prompt);
    game.round = dive.round;
    game.air = dive.running ? Math.max(0, dive.air - (now - sent)) : dive.air;
    game.input = dive.typing;
    game.judging = dive.judging;
    if (dive.refused && dive.refused.count !== this.refusals) game.rejected = { text: dive.refused.text, at: game.phaseTime };
    if (!dive.refused) game.rejected = null;
    this.refusals = dive.refused?.count ?? 0;
    game.depth = diver.depth;
    game.lamps = diver.lamps;
    game.result = dive.verdict && game.results.at(-1)!;
    return game;
  }
}
