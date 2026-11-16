import type { CreatureKind } from "./pixel/creatures";
import type { Frame } from "./pixel/frame";
import type { Scene } from "./pixel/scene";
import { pressEnter, type Game } from "./state";

export type DevTools = { game: Game; scene: Scene; frame: Frame };

/** Whether a prompt is waiting for an answer. From a verdict, this first moves on to the next prompt. */
function asking(game: Game): boolean {
  if (game.phase === "verdict") pressEnter(game);
  return game.phase === "ask" && !game.judging;
}

/** Give a correct answer of about this rarity, which only the server can name. */
async function answer(game: Game, rarity: number) {
  if (!asking(game)) return;
  const prompt = game.prompts[game.round]!;
  const res = await fetch(`/api/dev/answer?promptId=${encodeURIComponent(prompt.id)}&rarity=${rarity}`);
  const { answer } = (await res.json()) as { answer: string };
  if (game.phase !== "ask" || game.judging) return;
  game.input = answer;
  pressEnter(game);
}

/** End the dive here. The logbook then holds only the prompts that were finished. */
function endDive(game: Game) {
  const diving = game.phase === "ask" || game.phase === "verdict";
  if (!diving || game.judging) return;
  game.prompts = game.prompts.slice(0, game.results.length);
  game.round = game.prompts.length;
  game.result = null;
  game.phase = "ascent";
  game.phaseTime = 0;
}

const CREATURES: [kind: CreatureKind, name: string][] = [["angler", "Anglerfish"], ["eyes", "Eyes"], ["serpent", "Eel"]];

/** Shortcuts for whoever is working on the game. Shown only when the server runs with HADAL_DEV_MODE=1. */
export function DevMenu({ game, scene, frame }: DevTools) {
  return (
    <aside className="dev">
      <div>
        Answer with rarity near
        {[1, 25, 50, 75, 100].map((rarity) => (
          <button key={rarity} onClick={() => void answer(game, rarity)}>{rarity}</button>
        ))}
      </div>
      <div>
        Air
        <button onClick={() => asking(game) && (game.air = 0)}>Run out</button>
      </div>
      <div>
        Dive
        <button onClick={() => endDive(game)}>End</button>
      </div>
      <div>
        Creature
        {CREATURES.map(([kind, name]) => (
          <button key={kind} onClick={() => scene.ambient.spawn(kind, frame.width, frame.height, scene.depth)}>{name}</button>
        ))}
      </div>
    </aside>
  );
}
