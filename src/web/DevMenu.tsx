import { useState } from "react";
import type { CreatureKind } from "./pixel/creatures";
import type { Frame } from "./pixel/frame";
import type { MultiplayerPanel } from "./pixel/multiplayer";
import type { Scene } from "./pixel/scene";
import { pressEnter, type Game } from "./state";

export type DevTools = { game: Game; scene: Scene; frame: Frame; multiplayer: MultiplayerPanel };

/** Whether a prompt is waiting for an answer. From a verdict, this first moves on to the next prompt. */
function asking(game: Game): boolean {
  if (game.phase === "verdict") pressEnter(game);
  return game.phase === "ask" && !game.judging;
}

/** A correct answer of about this rarity to a prompt, which only the server can name. */
async function correct(promptId: string, rarity: number): Promise<string | null> {
  const res = await fetch(`/api/dev/answer?promptId=${encodeURIComponent(promptId)}&rarity=${rarity}`);
  return res.ok ? ((await res.json()) as { answer: string }).answer : null;
}

/** Give a correct answer of about this rarity: in a room's dive on the player's own turn, or in single player. */
async function answer({ game, multiplayer }: DevTools, rarity: number) {
  if (multiplayer.diving) {
    const prompt = multiplayer.client.view?.dive?.prompt;
    const text = multiplayer.yours && prompt && (await correct(prompt.id, rarity));
    if (text) multiplayer.answer(text);
    return;
  }
  if (!asking(game)) return;
  const text = await correct(game.prompts[game.round]!.id, rarity);
  if (!text || game.phase !== "ask" || game.judging) return;
  game.input = text;
  pressEnter(game);
}

/** End the dive here. The end screen then holds only the prompts that were finished. */
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
/** Whether the menu is folded away, kept by the browser between visits. Storage may be closed (a private window): then it starts open. */
const FOLDED = "hadal.dev.folded";
function stored(): boolean {
  try {
    return localStorage.getItem(FOLDED) === "1";
  } catch {
    return false;
  }
}

export function DevMenu(tools: DevTools) {
  const { game, scene, frame } = tools;
  const [folded, setFolded] = useState(stored);
  const fold = (value: boolean) => {
    setFolded(value);
    try {
      localStorage.setItem(FOLDED, value ? "1" : "0");
    } catch {}
  };
  if (folded) {
    return (
      <aside className="dev">
        <button onClick={() => fold(false)}>Dev</button>
      </aside>
    );
  }
  return (
    <aside className="dev">
      <button className="fold" onClick={() => fold(true)} aria-label="Hide the developer menu">Hide</button>
      <div>
        Answer with rarity near
        {[1, 25, 50, 75, 100].map((rarity) => (
          <button key={rarity} onClick={() => void answer(tools, rarity)}>{rarity}</button>
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
