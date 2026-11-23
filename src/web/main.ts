import { CHAT_MAX } from "../shared/room";
import { MAX_ANSWER_LENGTH, type Config } from "../shared/types";
import { showDevMenu } from "./devmenu";
import { t } from "./language";
import { Sound } from "./sound";
import { AIR_SECONDS, CHAOS_AIR_SECONDS, createGame, leave, lostDive, pressEnter, start, tick, type Chosen, type Phase } from "./state";
import { AccountPanel } from "./pixel/account";
import { CustomPanel } from "./pixel/choice";
import { drawable } from "./pixel/other";
import { Ending, FADE_SECONDS, type Log } from "./pixel/ending";
import { Display, Frame, visible, type Light } from "./pixel/frame";
import { Glitch, strength } from "./pixel/glitch";
import { MultiplayerPanel } from "./pixel/multiplayer";
import { PacksPanel } from "./pixel/packs";
import { Scene, type Menu } from "./pixel/scene";
import { drawCog, overCog, settingsStep } from "./pixel/settings";
import { selection, steering, Ui, type Step } from "./pixel/ui";

const REPO = "https://github.com/seriaati/hadal";
/** How often an open page asks whether a newer version of the game is out, in milliseconds. */
const VERSION_EVERY = 5 * 60 * 1000;
const ARROWS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

// The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard.
const stage = document.querySelector<HTMLElement>(".stage")!;
const canvas = document.querySelector<HTMLCanvasElement>(".pixels")!;
const input = document.querySelector<HTMLInputElement>(".keys")!;
// Whatever panel is open: `Ui` fills it with the controls of the step on screen.
const form = document.querySelector<HTMLFormElement>(".panel")!;
input.maxLength = MAX_ANSWER_LENGTH;
// In a dive what the player says has a line of its own, opened by Tab: letters type the answer, and "/" may be in one.
const talk = document.querySelector<HTMLInputElement>(".talk")!;
talk.maxLength = CHAT_MAX;
const talking = () => document.activeElement === talk;
// A phone has no Tab: a button opens it, and closes it again.
const talkButton = document.querySelector<HTMLButtonElement>(".talk-button")!;
talkButton.addEventListener("click", () => (talking() ? takeKeys() : talk.focus()));
// Screen readers are told what the others say; the game only draws it.
const said = document.querySelector<HTMLElement>(".said")!;
const game = createGame();
const scene = new Scene();
scene.touch = matchMedia("(pointer: coarse)").matches;
const frame = new Frame();
const display = new Display(canvas, document.querySelector<HTMLCanvasElement>(".glow")!);
const sound = new Sound();
const glitch = new Glitch();
const ui = new Ui(form, () => takeKeys());
const settings = () => settingsStep(sound, display);
const account: AccountPanel = new AccountPanel(ui, () => void packs.load());
const packs = new PacksPanel(ui, account, sound, (pack) => dive(false, { builtIn: [], own: [pack] }));
const multiplayer = new MultiplayerPanel(ui, account, sound);
multiplayer.announce = (words) => {
  said.append(Object.assign(document.createElement("p"), { textContent: words }));
  while (said.childElementCount > 20) said.firstElementChild!.remove();
};
// Wait for the account so the signed-in name can be filled in.
const linked = new URLSearchParams(location.search).get("room");
if (linked) {
  history.replaceState(null, "", location.pathname);
  void account.loaded.finally(() => multiplayer.joinByLink(linked));
}
let ending: Ending | null = null;
const closeEnding = () => (multiplayer.ending ? multiplayer.closeEnding() : pressEnter(game));
let shown = game;
// A phone opens its keyboard for whatever field has the focus, so there the field takes it only in a dive.
const takeKeys = () => {
  if (!scene.touch || (!ending && (multiplayer.diving || game.phase !== "title"))) input.focus();
};
takeKeys();
// The panel stays until the prompts have come, so the title does not show in between.
const dive = (chaos: boolean, packs?: Chosen) => {
  input.focus();
  void ui.wait(start(game, packs, chaos)).then((started) => started && ui.close());
};
const custom = new CustomPanel(ui, account, (packs, chaos) => dive(chaos, packs));
const single = (): Step => ({
  title: t().title.single,
  rows: [
    { kind: "press", id: "mode:descend", label: t().single.descend, press: () => dive(false) },
    { kind: "note", text: t().single.descendHow(AIR_SECONDS) },
    { kind: "press", id: "mode:chaos", label: t().single.chaos, press: () => dive(true) },
    { kind: "note", text: t().single.chaosHow(CHAOS_AIR_SECONDS) },
    { kind: "note", text: t().horror, bad: true },
    { kind: "press", id: "mode:custom", label: t().single.custom, press: () => custom.show() },
    { kind: "note", text: t().single.customHow },
  ],
});
const about = (): Step => ({
  title: t().title.about,
  rows: [
    { kind: "note", text: t().about.madeBy },
    { kind: "note", text: t().about.creatures },
    { kind: "press", id: "source", label: t().about.link, says: t().about.source, press: () => open(REPO, "_blank", "noopener") },
  ],
});
/** The version the page was loaded with, and whether a newer one is out: a running game is never reloaded unasked. */
let version = "";
let newer = false;
const menuItems = () => {
  const words = t().title;
  return [words.single, words.multiplayer, words.packs, account.account ? words.account : words.signIn, words.about, ...(newer ? [words.update] : [])];
};
const menu: Menu = { items: menuItems(), choice: 0 };
/** Whether the pointer chose the menu's line, and which line it took away when it moved off: Up or Down gives it back. */
let menuPointed = false;
let menuParked = 0;
const choose = (line: number) => {
  if (line === 0) ui.go(single);
  else if (line === 1) multiplayer.show();
  else if (line === 2) packs.show();
  else if (line === 3) account.show();
  else if (line === 4) ui.go(about);
  else location.reload();
};
const leaveDive = () => {
  if (multiplayer.diving) multiplayer.leaveDive();
  else leave(game);
  ui.close();
  input.value = "";
};
const leaving = (): Step => ({
  title: t().leaving.title,
  escape: leaveDive,
  rows: [
    { kind: "press", id: "stay", label: t().leaving.stay, press: () => ui.back() },
    { kind: "press", id: "settings", label: t().settings.title, press: () => ui.go(settings) },
    { kind: "press", id: "leave", label: t().leaving.leave, press: leaveDive },
  ],
});
const openMenu = () => {
  if (shown.phase === "title") ui.go(settings);
  else if (shown.phase === "drop" || shown.phase === "ask" || shown.phase === "verdict") ui.go(leaving);
};
if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, glitch, ui, account, packs, custom, multiplayer, room: multiplayer.client } });

const config = () => fetch("/api/config", { cache: "no-store" }).then((res) => res.json() as Promise<Config>);
void config().then((config) => {
  version = config.version;
  if (config.devMode) showDevMenu(stage, { game, scene, frame, multiplayer });
});
const checkVersion = () => {
  if (version && !newer && document.visibilityState === "visible") void config().then((config) => (newer = config.version !== version), () => {});
};
setInterval(checkVersion, VERSION_EVERY);
document.addEventListener("visibilitychange", checkVersion);

const onKey = (event: KeyboardEvent) => {
  // While a keyboard is still composing a letter (as for Japanese or Chinese), Enter picks the letter; it sends nothing.
  if (event.isComposing) return;
  const key = steering(event);
  const way = ARROWS[key];
  if (ending && done && way) {
    event.preventDefault();
    ending.move(way, frame);
    return;
  }
  // An open panel has the focus and its own keys; these come here while it waits for a dive to begin, and are not for the title.
  if (ui.open) return;
  if (event.key === "Tab" && multiplayer.talking) {
    event.preventDefault();
    talk.focus();
    return;
  }
  if (shown.phase === "title" && (key === "ArrowUp" || key === "ArrowDown")) {
    menuPointed = false;
    if (menu.choice < 0) menu.choice = menuParked;
    else menu.choice = (menu.choice + (key === "ArrowUp" ? -1 : 1) + menu.items.length) % menu.items.length;
  }
  if (event.key !== "Enter" && event.key !== "Escape") return;
  event.preventDefault();
  if (ending) return event.repeat ? undefined : closeEnding();
  if (event.key === "Escape") return event.repeat ? undefined : openMenu();
  if (multiplayer.diving) {
    if (multiplayer.answer(input.value)) input.value = "";
    return;
  }
  if (game.phase === "title") return menu.choice >= 0 ? choose(menu.choice) : undefined;
  if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
  pressEnter(game);
  if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
};
const keepFocus = (event: MouseEvent) => {
  // The controls of an open panel take the focus themselves.
  if (form.contains(event.target as Node)) return;
  if (event.target !== input) event.preventDefault();
  if (!ui.open && !talking()) takeKeys();
};
// Enter sends what is said, unless it must wait out the last; Escape takes it back, and Tab goes back to the answer with it kept.
talk.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key !== "Enter" && event.key !== "Escape" && event.key !== "Tab") return;
  event.preventDefault();
  const text = talk.value.trim();
  if (event.key === "Enter" && text && !multiplayer.talk(text)) return;
  if (event.key !== "Tab") talk.value = "";
  takeKeys();
});
// The cog and the title menu are drawn, not page controls, so the pointer is tested against them here.
const onPointer = (event: PointerEvent) => {
  const at = canvas.getBoundingClientRect();
  const x = (event.clientX - at.left) / display.scale;
  const y = (event.clientY - at.top) / display.scale;
  if (ending && done) {
    const spot = ending.at(x, y);
    canvas.style.cursor = spot ? "pointer" : "";
    // As in ui.ts: a pointer that only rests over a lamp does not take the focus back from the keys.
    if (event.type === "pointermove" && !(event.pointerType === "mouse" && (event.movementX || event.movementY))) return;
    if (spot) ending.choose(spot);
    if (event.type === "pointerdown" && spot === "back") closeEnding();
    return;
  }
  const cog = overCog(frame, x, y);
  const line = shown.phase === "title" && !ui.open && menu.items[scene.menuAt(x, y)] ? scene.menuAt(x, y) : -1;
  const named = ui.open ? undefined : multiplayer.pickable(scene.nameAt(x, y));
  canvas.style.cursor = cog || line >= 0 || named ? "pointer" : "";
  if (event.type === "pointermove") {
    // Moving the pointer over a line of the menu chooses it, and moving off takes the choice away, as with a control of a panel.
    if (!(event.pointerType === "mouse" && (event.movementX || event.movementY))) return;
    if (line >= 0) {
      menu.choice = line;
      menuPointed = true;
    } else if (menuPointed && shown.phase === "title" && !ui.open) {
      menuParked = menu.choice;
      menu.choice = -1;
      menuPointed = false;
    }
  } else if (cog) {
    if (ui.top === settings || ui.top === leaving) ui.back();
    else openMenu();
  }
  // A click on nothing does nothing (owner, 2026-11-21): the controls of a panel are page elements, and take their own clicks.
  else if (ui.open) return;
  else if (named) multiplayer.pick(named);
  else if (line >= 0) choose(line);
  // A tap anywhere does what Enter does after a verdict: a phone's keyboard may be closed.
  else if (!multiplayer.diving && game.phase === "verdict" && event.pointerType !== "mouse") pressEnter(game);
};
input.addEventListener("keydown", onKey);
addEventListener("mousedown", keepFocus);
canvas.addEventListener("pointerdown", onPointer);
canvas.addEventListener("pointermove", onPointer);

let ended: Log | null = null;
let done = false;
/** In seconds. */
let doneAt = 0;
let last = performance.now();
let phase: Phase = "title";
let yours = false;
requestAnimationFrame(function loop(now) {
  requestAnimationFrame(loop);
  const elapsed = (now - last) / 1000;
  const dt = Math.min(0.05, elapsed);
  last = now;
  // The words of a turn that has ended are not kept for the next.
  if (yours && !multiplayer.yours) input.value = "";
  yours = multiplayer.yours;
  if (game.phase === "ask") game.input = input.value;
  else if (yours) multiplayer.type(input.value);
  else if (!multiplayer.ahead) input.value = "";
  // A prompt in another script keeps its air until the font that draws it has arrived.
  const prompt = game.phase === "ask" && game.prompts[game.round];
  // The air runs on the clock, not on frames: a browser draws none for a tab out of sight, and the diver must not keep
  // their breath while the player looks the answer up elsewhere.
  if (!prompt || drawable(prompt.text)) tick(game, elapsed);
  const log = multiplayer.ending?.log ?? (game.phase === "ascent" || game.phase === "lost" || game.phase === "done" ? game : null);
  if (log !== ended) {
    ended = log;
    ending = log && new Ending(log, multiplayer.ending?.follow);
    if (log) ui.close(); // the settings, if the dive ended while they were open
  }
  const up = multiplayer.ending ? multiplayer.surfaced : game.phase === "done";
  if (up !== done) {
    done = up;
    doneAt = now / 1000;
  }
  // The game stands in the part of the page that can be seen: a phone's keyboard hides the rest, and may have scrolled it.
  const seen = visible();
  Object.assign(stage.style, { width: `${seen.width}px`, height: `${seen.height}px`, transform: `translate(${seen.left}px, ${seen.top}px)` });
  display.fit(frame);
  menu.items = menuItems();
  input.ariaLabel = t().page.answer;
  talk.ariaLabel = t().rooms.say;
  // The player's own turn closes what they were saying, kept for later: every key is for the answer while their air runs.
  if (talking() && !multiplayer.talking) takeKeys();
  if (!multiplayer.diving) talk.value = "";
  form.ariaLabel = t().page.menu;
  menu.note = account.trouble();
  multiplayer.update();
  shown = multiplayer.game(now / 1000) ?? game;
  // The diver whose turn it is sees their own typing at once, not as it comes back from the server.
  if (multiplayer.yours) shown.input = input.value;
  scene.crew = multiplayer.crew();
  scene.lobby = multiplayer.lobby;
  scene.chat = multiplayer.chat();
  scene.draft = multiplayer.draft(talking() ? talk.value : null);
  scene.selection = selection(document.activeElement);
  scene.turn = multiplayer.turn(input.value);
  scene.talkButton = scene.touch && multiplayer.talking ? (talking() ? "open" : "closed") : null;
  talkButton.ariaLabel = t().rooms.sayIt;
  let lights: Light[] = [];
  const closing = done ? ending : null;
  // Once the end screen has faded in it hides the sea, which need not be drawn.
  if (!done || now / 1000 - doneAt < FADE_SECONDS) {
    lights = scene.draw(frame, shown, menu, dt, now / 1000, ui.open);
    // The screen of a lost chaos dive is dark already when its end screen comes.
    if (shown.phase === "done" && lostDive(shown)) {
      frame.clear();
      lights.length = 0;
    }
  }
  if (closing) lights = closing.draw(frame, lights, now / 1000 - doneAt, now / 1000);
  // A chaos dive opens with a hard glitch.
  if (shown.phase === "drop" && phase !== "drop") glitch.cut(frame.height, scene.focus);
  // A dive may have used the player's keys: refresh so the menu can tell of any that failed.
  if (shown.phase === "title" && phase !== "title") {
    account.refresh();
    if (scene.touch) input.blur();
  }
  phase = shown.phase;
  const focus = closing ? closing.point : scene.focus;
  const faults = glitch.count;
  glitch.update(dt, strength(shown, scene.depth, scene.panic), frame.height, focus, shown);
  if (!closing && glitch.count > faults && Math.random() < 0.5) scene.ambient.jolt(frame.width, frame.height);
  glitch.apply(frame, closing ? closing.wordsFrom : scene.wordsFrom, closing ? closing.wordsTo : scene.wordsTo, now / 1000, focus, !closing);
  if (glitch.blackout) lights.length = 0;
  if (!closing) drawCog(frame);
  const box = closing ? null : scene.talkBox;
  talkButton.hidden = !box;
  if (box) {
    const s = display.scale;
    Object.assign(talkButton.style, { left: `${box.x * s}px`, top: `${box.y * s}px`, width: `${box.w * s}px`, height: `${box.h * s}px` });
  }
  ui.draw(frame, scene, display.scale, now / 1000, shown.phase !== "title");
  display.pace(elapsed);
  display.present(frame, lights);
  sound.update(shown, scene, dt, glitch);
});
