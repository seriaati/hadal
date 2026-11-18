import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER_LENGTH, type Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
import { Sound } from "./sound";
import { AIR_SECONDS, CHAOS_AIR_SECONDS, createGame, leave, lostDive, pressEnter, start, tick, type Phase } from "./state";
import { AccountPanel } from "./pixel/account";
import { drawable } from "./pixel/other";
import { Ending, FADE_SECONDS, type Log } from "./pixel/ending";
import { Display, Frame, type Light } from "./pixel/frame";
import { Glitch, strength } from "./pixel/glitch";
import { MultiplayerPanel } from "./pixel/multiplayer";
import { PacksPanel } from "./pixel/packs";
import { Scene, type Menu } from "./pixel/scene";
import { drawCog, overCog, settingsStep } from "./pixel/settings";
import { Ui, type Part, type Step } from "./pixel/ui";

const REPO = "https://github.com/seriaati/hadal";
const ARROWS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
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
    const frame = new Frame();
    const display = new Display(canvas, glow.current!);
    const sound = new Sound();
    const glitch = new Glitch();
    const ui = new Ui(form.current!, input);
    const settings = () => settingsStep(sound);
    const account: AccountPanel = new AccountPanel(ui, () => void packs.load());
    const packs = new PacksPanel(ui, account, sound, (pack) => void start(game, pack));
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
    const dive = (chaos: boolean) => {
      ui.close();
      void start(game, undefined, chaos);
    };
    const single = (): Step => ({
      title: "Single player",
      rows: [
        { kind: "press", id: "mode:descend", label: "Descend", press: () => dive(false) },
        { kind: "note", text: `10 prompts with ${AIR_SECONDS} s of air each: rarer answers go deeper, and an empty tank only loses that prompt` },
        { kind: "press", id: "mode:chaos", label: "Chaos", press: () => dive(true) },
        { kind: "note", text: `10 prompts with ${CHAOS_AIR_SECONDS} s of air each: rarer answers go deeper, and the first empty tank ends the dive` },
      ],
    });
    const about = (): Step => ({
      title: "About",
      rows: [
        { kind: "note", text: "Hadal is made by seria" },
        { kind: "press", id: "source", label: "github.com/seriaati/hadal", says: "Open the source code on GitHub", press: () => open(REPO, "_blank", "noopener") },
      ],
    });
    const menu: Menu = { items: ["Single player", "Multiplayer", "Packs", "Sign in", "About"], choice: 0 };
    const choose = (line: number) => {
      if (line === 0) ui.go(single);
      else if (line === 1) multiplayer.show();
      else if (line === 2) packs.show();
      else if (line === 3) account.show();
      else ui.go(about);
    };
    /** Opened with Escape, the step says what a second Escape does. */
    let byEscape = false;
    const leaveDive = () => {
      ui.close();
      if (multiplayer.diving) multiplayer.leaveDive();
      else leave(game);
      input.value = "";
    };
    const leaving = (): Step => ({
      title: "Leave the dive?",
      escape: leaveDive,
      rows: [
        ...(byEscape ? [{ kind: "note", text: multiplayer.diving ? "Esc again leaves the dive and the room" : "Esc again leaves the dive. It is not logged" } as Part] : []),
        { kind: "press", id: "stay", label: "Keep diving", press: () => ui.back() },
        { kind: "press", id: "settings", label: "Settings", press: () => ui.go(settings) },
        { kind: "press", id: "leave", label: "Leave the dive", press: leaveDive },
      ],
    });
    const openMenu = (escape: boolean) => {
      byEscape = escape;
      if (shown.phase === "title") ui.go(settings);
      else if (shown.phase === "drop" || shown.phase === "ask" || shown.phase === "verdict") ui.go(leaving);
    };
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, glitch, ui, account, packs, multiplayer, room: multiplayer.client } });

    void fetch("/api/config")
      .then((res) => res.json() as Promise<Config>)
      .then((config) => config.devMode && setDev({ game, scene, frame, multiplayer }));

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
      if (event.key === "Escape") return event.repeat ? undefined : openMenu(true);
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
      if (!ui.open) input.focus();
    };
    // The cog and the title menu are drawn, not page controls, so the pointer is tested against them here.
    const onPointer = (event: PointerEvent) => {
      const scale = canvas.clientWidth / frame.width;
      const x = event.clientX / scale;
      const y = event.clientY / scale;
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
        else openMenu(false);
      } else if (ui.open) ui.press(x, y);
      else if (line >= 0) choose(line);
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
    let request = requestAnimationFrame(function loop(now) {
      request = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (game.phase === "ask") game.input = input.value;
      else if (multiplayer.yours) multiplayer.type(input.value);
      else input.value = "";
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
      display.fit(frame);
      menu.items[3] = account.account ? "Account" : "Sign in";
      menu.note = account.trouble();
      multiplayer.update();
      shown = multiplayer.game(now / 1000) ?? game;
      // The diver whose turn it is sees their own typing at once, not as it comes back from the server.
      if (multiplayer.yours) shown.input = input.value;
      scene.crew = multiplayer.crew();
      scene.turn = multiplayer.turn();
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
      if (shown.phase === "title" && phase !== "title") account.refresh();
      phase = shown.phase;
      const focus = closing ? closing.point : scene.focus;
      const faults = glitch.count;
      glitch.update(dt, strength(shown, scene.depth, scene.panic), frame.height, focus, shown);
      if (!closing && glitch.count > faults && Math.random() < 0.5) scene.ambient.jolt(frame.width, frame.height);
      glitch.apply(frame, closing ? closing.wordsFrom : scene.wordsFrom, closing ? closing.wordsTo : scene.wordsTo, now / 1000, focus, !closing);
      if (glitch.blackout) lights.length = 0;
      if (!closing) drawCog(frame);
      ui.draw(frame, scene, canvas.clientWidth / frame.width, now / 1000, shown.phase !== "title");
      display.present(frame, lights);
      sound.update(shown, scene, dt, glitch);
    });

    return () => {
      cancelAnimationFrame(request);
      input.removeEventListener("keydown", onKey);
      removeEventListener("mousedown", keepFocus);
      canvas.removeEventListener("pointerdown", onPointer);
      canvas.removeEventListener("pointermove", onPointer);
      sound.close();
    };
  }, []);

  return (
    <main className="stage">
      <canvas ref={pixels} className="pixels" />
      <canvas ref={glow} className="glow" />
      <input ref={keys} className="keys" aria-label="Your answer" maxLength={MAX_ANSWER_LENGTH} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {/* Whatever panel is open: `Ui` fills it with the controls of the step on screen. */}
      <form ref={form} className="panel" aria-label="Menu" hidden />
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
