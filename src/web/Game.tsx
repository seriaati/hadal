import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER_LENGTH, type Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
import { Logbook } from "./Logbook";
import { Sound } from "./sound";
import { createGame, pressEnter, start, tick, type Game as Dive } from "./state";
import { AccountPanel } from "./pixel/account";
import { drawable } from "./pixel/other";
import { Display, Frame } from "./pixel/frame";
import { PacksPanel } from "./pixel/packs";
import { Scene } from "./pixel/scene";
import { drawCog, overCog, settingsStep } from "./pixel/settings";
import { Ui } from "./pixel/ui";

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  /** The dive the logbook is drawn for, from the moment it ends, and whether the diver is back at the surface. */
  const [logged, setLogged] = useState<Dive | null>(null);
  const [surfaced, setSurfaced] = useState(false);
  /** What the developer menu works on, if this instance is in developer mode. */
  const [dev, setDev] = useState<DevTools | null>(null);

  useEffect(() => {
    const input = keys.current!;
    const canvas = pixels.current!;
    const game = createGame();
    const scene = new Scene();
    const frame = new Frame();
    const display = new Display(canvas, glow.current!);
    const sound = new Sound();
    const ui = new Ui(form.current!, input);
    const settings = () => settingsStep(sound);
    const account: AccountPanel = new AccountPanel(ui, () => void packs.load());
    const packs = new PacksPanel(ui, account, sound, (pack) => void start(game, pack));
    /** The title menu: its lines, and the one Enter acts on. */
    const menu = { items: ["Descend", "Packs", "Sign in"], choice: 0 };
    const choose = (line: number) => {
      if (line === 0) pressEnter(game);
      else if (line === 1) packs.show();
      else account.show();
    };
    /** The settings can be opened at the title and in a dive, not while the diver is hauled up or the logbook is open. */
    const openSettings = () => {
      if (game.phase !== "ascent" && game.phase !== "done") ui.go(settings);
    };
    // In development, let the browser console (and test scripts) reach the game.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, ui, account, packs } });

    void fetch("/api/config")
      .then((res) => res.json() as Promise<Config>)
      .then((config) => config.devMode && setDev({ game, scene, frame }));

    const onKey = (event: KeyboardEvent) => {
      // While a keyboard is still composing a letter (as for Japanese or Chinese), Enter picks the letter; it sends nothing.
      if (event.isComposing) return;
      // These keys come here only while no panel is open: an open panel has the focus and its own keys.
      if (game.phase === "title" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        // From the last line Down goes to the first, as in every list of the game.
        menu.choice = (menu.choice + (event.key === "ArrowUp" ? -1 : 1) + menu.items.length) % menu.items.length;
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (event.key === "Escape") return openSettings();
      if (game.phase === "title") return choose(menu.choice);
      if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
      pressEnter(game);
      if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
    };
    // Keep the typing focus wherever the player clicks or taps.
    const keepFocus = (event: MouseEvent) => {
      // The controls of an open panel take the focus themselves.
      if (form.current!.contains(event.target as Node)) return;
      if (event.target !== input) event.preventDefault();
      if (!ui.open) input.focus();
    };
    // The pointer on the game itself: the cog and the title menu, which are drawn and are no controls of the page.
    const onPointer = (event: PointerEvent) => {
      const scale = canvas.clientWidth / frame.width;
      const x = event.clientX / scale;
      const y = event.clientY / scale;
      const cog = overCog(frame, x, y);
      const line = game.phase === "title" && !ui.open && menu.items[scene.menuAt(x, y)] ? scene.menuAt(x, y) : -1;
      canvas.style.cursor = cog || line >= 0 ? "pointer" : "";
      if (event.type === "pointermove") {
        // Moving the pointer over a line of the menu chooses it, as moving it over a control of a panel gives that the focus.
        if (line >= 0 && event.pointerType === "mouse" && (event.movementX || event.movementY)) menu.choice = line;
      } else if (cog) {
        if (ui.top === settings) ui.back();
        else openSettings();
      } else if (ui.open) ui.press(x, y);
      else if (line >= 0) choose(line);
    };
    input.addEventListener("keydown", onKey);
    addEventListener("mousedown", keepFocus);
    canvas.addEventListener("pointerdown", onPointer);
    canvas.addEventListener("pointermove", onPointer);

    let ended = false;
    let done = false;
    let last = performance.now();
    let request = requestAnimationFrame(function loop(now) {
      request = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (game.phase === "ask") game.input = input.value;
      else input.value = "";
      // A prompt in another script keeps its air until the font that draws it has arrived.
      const prompt = game.phase === "ask" && game.prompts[game.round];
      if (!prompt || drawable(prompt.text)) tick(game, dt);
      if ((game.phase === "ascent" || game.phase === "done") !== ended) {
        ended = !ended;
        setLogged(ended ? game : null);
        if (ended) ui.close(); // the settings, if the dive ended while they were open
      }
      if ((game.phase === "done") !== done) {
        done = !done;
        setSurfaced(done);
      }
      display.fit(frame);
      // Once the logbook has faded in it hides the sea, which need not be drawn.
      if (!done || game.phaseTime < 1) {
        menu.items[2] = account.account?.username ?? "Sign in";
        const lights = scene.draw(frame, game, menu, dt, now / 1000, ui.open);
        drawCog(frame);
        ui.draw(frame, scene, canvas.clientWidth / frame.width, now / 1000, game.phase !== "title");
        display.present(frame, lights);
      }
      sound.update(game, scene, dt);
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
      <Logbook dive={logged} surfaced={surfaced} />
      <input ref={keys} className="keys" aria-label="Your answer" maxLength={MAX_ANSWER_LENGTH} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {/* Whatever panel is open: `Ui` fills it with the controls of the step on screen. */}
      <form ref={form} className="panel" aria-label="Menu" hidden />
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
