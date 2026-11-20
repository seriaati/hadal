import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER_LENGTH, type Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
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
import { Ui, type Step } from "./pixel/ui";

const REPO = "https://github.com/seriaati/hadal";
/** How often an open page asks whether a newer version of the game is out, in milliseconds. */
const VERSION_EVERY = 5 * 60 * 1000;
const ARROWS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const stage = useRef<HTMLElement>(null);
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [dev, setDev] = useState<DevTools | null>(null);

  useEffect(() => {
    const input = keys.current!;
    const canvas = pixels.current!;
    const game = createGame();
    const scene = new Scene();
    scene.touch = matchMedia("(pointer: coarse)").matches;
    const frame = new Frame();
    const display = new Display(canvas, glow.current!);
    const sound = new Sound();
    const glitch = new Glitch();
    const ui = new Ui(form.current!, () => takeKeys());
    const settings = () => settingsStep(sound);
    const account: AccountPanel = new AccountPanel(ui, () => void packs.load());
    const packs = new PacksPanel(ui, account, sound, (pack) => dive(false, { builtIn: [], own: [pack] }));
    const multiplayer = new MultiplayerPanel(ui, account, sound);
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
    const dive = (chaos: boolean, packs?: Chosen) => {
      ui.close();
      input.focus();
      void start(game, packs, chaos);
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
        { kind: "press", id: "source", label: "github.com/seriaati/hadal", says: t().about.source, press: () => open(REPO, "_blank", "noopener") },
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
      if (config.devMode) setDev({ game, scene, frame, multiplayer });
    });
    const checkVersion = () => {
      if (version && !newer && document.visibilityState === "visible") void config().then((config) => (newer = config.version !== version), () => {});
    };
    const checking = setInterval(checkVersion, VERSION_EVERY);
    document.addEventListener("visibilitychange", checkVersion);

    const onKey = (event: KeyboardEvent) => {
      // While a keyboard is still composing a letter (as for Japanese or Chinese), Enter picks the letter; it sends nothing.
      if (event.isComposing) return;
      const way = ARROWS[event.key];
      if (ending && done && way) {
        event.preventDefault();
        ending.move(way, frame);
        return;
      }
      // These keys come here only while no panel is open: an open panel has the focus and its own keys.
      if (shown.phase === "title" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        menu.choice = (menu.choice + (event.key === "ArrowUp" ? -1 : 1) + menu.items.length) % menu.items.length;
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (ending) return event.repeat ? undefined : closeEnding();
      if (event.key === "Escape") return event.repeat ? undefined : openMenu();
      if (multiplayer.diving) {
        if (multiplayer.answer(input.value)) input.value = "";
        return;
      }
      if (game.phase === "title") return choose(menu.choice);
      if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
      pressEnter(game);
      if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
    };
    const keepFocus = (event: MouseEvent) => {
      // The controls of an open panel take the focus themselves.
      if (form.current!.contains(event.target as Node)) return;
      if (event.target !== input) event.preventDefault();
      if (!ui.open) takeKeys();
    };
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
      canvas.style.cursor = cog || line >= 0 ? "pointer" : "";
      if (event.type === "pointermove") {
        // Moving the pointer over a line of the menu chooses it, as moving it over a control of a panel gives that the focus.
        if (line >= 0 && event.pointerType === "mouse" && (event.movementX || event.movementY)) menu.choice = line;
      } else if (cog) {
        if (ui.top === settings || ui.top === leaving) ui.back();
        else openMenu();
      } else if (ui.open) ui.press(x, y);
      else if (line >= 0) choose(line);
      // A press anywhere does what Enter does after a verdict: a phone's keyboard may be closed.
      else if (!multiplayer.diving && game.phase === "verdict") pressEnter(game);
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
    let request = requestAnimationFrame(function loop(now) {
      request = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The words of a turn that has ended are not kept for the next.
      if (yours && !multiplayer.yours) input.value = "";
      yours = multiplayer.yours;
      if (game.phase === "ask") game.input = input.value;
      else if (yours) multiplayer.type(input.value);
      else if (!multiplayer.ahead) input.value = "";
      // A prompt in another script keeps its air until the font that draws it has arrived.
      const prompt = game.phase === "ask" && game.prompts[game.round];
      if (!prompt || drawable(prompt.text)) tick(game, dt);
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
      Object.assign(stage.current!.style, { width: `${seen.width}px`, height: `${seen.height}px`, transform: `translate(${seen.left}px, ${seen.top}px)` });
      display.fit(frame);
      menu.items = menuItems();
      input.ariaLabel = t().page.answer;
      form.current!.ariaLabel = t().page.menu;
      menu.note = account.trouble();
      multiplayer.update();
      shown = multiplayer.game(now / 1000) ?? game;
      // The diver whose turn it is sees their own typing at once, not as it comes back from the server.
      if (multiplayer.yours) shown.input = input.value;
      scene.crew = multiplayer.crew();
      scene.turn = multiplayer.turn(input.value);
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
      ui.draw(frame, scene, display.scale, now / 1000, shown.phase !== "title");
      display.present(frame, lights);
      sound.update(shown, scene, dt, glitch);
    });

    return () => {
      cancelAnimationFrame(request);
      clearInterval(checking);
      document.removeEventListener("visibilitychange", checkVersion);
      input.removeEventListener("keydown", onKey);
      removeEventListener("mousedown", keepFocus);
      canvas.removeEventListener("pointerdown", onPointer);
      canvas.removeEventListener("pointermove", onPointer);
      sound.close();
    };
  }, []);

  return (
    <main ref={stage} className="stage">
      <canvas ref={pixels} className="pixels" />
      <canvas ref={glow} className="glow" />
      <input ref={keys} className="keys" maxLength={MAX_ANSWER_LENGTH} enterKeyHint="send" autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {/* Whatever panel is open: `Ui` fills it with the controls of the step on screen. */}
      <form ref={form} className="panel" hidden />
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
