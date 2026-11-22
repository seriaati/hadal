import { TIERS } from "../shared/types";
import type { CreatureKind } from "./pixel/creatures";
import type { Frame } from "./pixel/frame";
import type { MultiplayerPanel } from "./pixel/multiplayer";
import type { Scene } from "./pixel/scene";
import { pressEnter, type Game } from "./state";

export type DevTools = { game: Game; scene: Scene; frame: Frame; multiplayer: MultiplayerPanel };

/** From a verdict, this first moves on to the next prompt. */
function asking(game: Game): boolean {
  if (game.phase === "verdict") pressEnter(game);
  return game.phase === "ask" && !game.judging;
}

/** A correct answer to a prompt worth about these points, which only the server can name. */
async function correct(promptId: string, rarity: number): Promise<string | null> {
  const res = await fetch(`/api/dev/answer?promptId=${encodeURIComponent(promptId)}&rarity=${rarity}`);
  return res.ok ? ((await res.json()) as { answer: string }).answer : null;
}

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

/** The end screen then holds only the prompts that were finished. */
function endDive(game: Game) {
  const diving = game.phase === "ask" || game.phase === "verdict";
  if (!diving || game.judging) return;
  game.prompts = game.prompts.slice(0, game.results.length);
  game.round = game.prompts.length;
  game.result = null;
  game.phase = "ascent";
  game.phaseTime = 0;
}

const CREATURES: [kind: CreatureKind, name: string][] = [["angler", "Anglerfish"], ["eyes", "Eyes"], ["serpent", "Eel"], ["whale", "Whale"], ["fish", "Fish"], ["leviathan", "Giant anglerfish"], ["nautilus", "Nautilus"], ["squid", "Squid"], ["dumbo", "Dumbo octopus"], ["angel", "Sea angel"], ["dragon", "Blue dragon"]];

/** Storage may be closed (a private window): then the menu starts open. */
const FOLDED = "hadal.dev.folded";
function stored(): boolean {
  try {
    return localStorage.getItem(FOLDED) === "1";
  } catch {
    return false;
  }
}

function button(label: string, press: () => void): HTMLButtonElement {
  const made = document.createElement("button");
  made.textContent = label;
  made.addEventListener("click", press);
  return made;
}

function line(label: string, buttons: HTMLButtonElement[]): HTMLDivElement {
  const made = document.createElement("div");
  made.append(label, ...buttons);
  return made;
}

export function showDevMenu(parent: HTMLElement, tools: DevTools) {
  const { game, scene, frame } = tools;
  const menu = document.createElement("aside");
  menu.className = "dev";
  parent.append(menu);
  const show = (folded: boolean) => {
    try {
      localStorage.setItem(FOLDED, folded ? "1" : "0");
    } catch {}
    if (folded) return menu.replaceChildren(button("Dev", () => show(false)));
    const hide = button("Hide", () => show(true));
    hide.className = "fold";
    hide.ariaLabel = "Hide the developer menu";
    menu.replaceChildren(
      hide,
      line("Answer in tier", Object.entries(TIERS).map(([tier, points]) => button(tier, () => void answer(tools, points)))),
      line("Air", [button("Run out", () => asking(game) && (game.air = 0))]),
      line("Dive", [button("End", () => endDive(game))]),
      line("Creature", CREATURES.map(([kind, name]) => button(name, () => scene.ambient.spawn(kind, frame.width, frame.height, scene.depth)))),
    );
  };
  show(stored());
}
