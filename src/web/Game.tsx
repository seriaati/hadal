import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER_LENGTH, PASSWORD_MAX, USERNAME_MAX, type Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
import { Logbook } from "./Logbook";
import { Sound } from "./sound";
import { createGame, pressEnter, start, tick, type Game as Dive } from "./state";
import { AccountPanel } from "./pixel/account";
import { drawable } from "./pixel/other";
import { Display, Frame } from "./pixel/frame";
import { PacksPanel } from "./pixel/packs";
import { Scene } from "./pixel/scene";
import { Settings } from "./pixel/settings";

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const packsForm = useRef<HTMLFormElement>(null);
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
    const settings = new Settings(sound);
    const account = new AccountPanel(form.current!, input);
    /** The title menu: its lines, and the one Enter acts on. */
    const menu = { items: ["Descend", "Packs", "Sign in"], choice: 0 };
    const packs = new PacksPanel(packsForm.current!, input, {
      dive: (pack) => void start(game, pack),
      signIn: () => account.show(),
    });
    const choose = (line: number) => {
      if (line === 0) pressEnter(game);
      else if (line === 1) packs.show(account.account !== null);
      else account.show();
    };
    // In development, let the browser console (and test scripts) reach the game.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, settings, account, packs } });

    void fetch("/api/config")
      .then((res) => res.json() as Promise<Config>)
      .then((config) => config.devMode && setDev({ game, scene, frame }));

    const onKey = (event: KeyboardEvent) => {
      // While a keyboard is still composing a letter (as for Japanese or Chinese), Enter picks the letter; it sends nothing.
      if (event.isComposing) return;
      if (game.phase === "title" && !settings.open && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        const line = menu.choice + (event.key === "ArrowUp" ? -1 : 1);
        menu.choice = Math.max(0, Math.min(menu.items.length - 1, line));
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (settings.open) {
        settings.open = false; // with the settings open, either key only closes them
        return;
      }
      if (event.key !== "Enter") return;
      if (game.phase === "title") return choose(menu.choice);
      if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
      pressEnter(game);
      if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
    };
    // Keep the typing focus wherever the player clicks or taps.
    const keepFocus = (event: MouseEvent) => {
      // The controls of the account and packs panels take the focus themselves.
      if (form.current!.contains(event.target as Node) || packsForm.current!.contains(event.target as Node)) return;
      if (event.target !== input) event.preventDefault();
      if (!account.open && !packs.open) input.focus();
    };
    // A press that takes hold of a slider in the settings keeps it until the pointer lifts.
    const onPointer = (event: PointerEvent) => {
      const scale = canvas.clientWidth / frame.width;
      const x = event.clientX / scale;
      const y = event.clientY / scale;
      if (event.type === "pointerdown") {
        const line = scene.menuAt(x, y);
        // A press that opens or closes the settings does nothing else.
        const settingsWereOpen = settings.open;
        if (account.open) account.press(frame, x, y);
        else if (packs.open) packs.press(frame, x, y);
        else if (settings.press(frame, x, y)) canvas.setPointerCapture(event.pointerId);
        else if (game.phase === "title" && !settingsWereOpen && !settings.open && menu.items[line]) choose(line);
      }
      if (canvas.hasPointerCapture(event.pointerId)) settings.drag(frame, x);
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
      }
      if ((game.phase === "done") !== done) {
        done = !done;
        setSurfaced(done);
      }
      display.fit(frame);
      // Once the logbook has faded in it hides the sea, which need not be drawn.
      if (!done || game.phaseTime < 1) {
        menu.items[2] = account.account?.username ?? "Sign in";
        const lights = scene.draw(frame, game, menu, dt, now / 1000);
        settings.draw(frame);
        account.draw(frame, canvas.clientWidth / frame.width, now / 1000);
        packs.draw(frame, canvas.clientWidth / frame.width);
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
      <form ref={form} className="panel" aria-label="Account" hidden>
        <input name="username" aria-label="Name" autoComplete="username" maxLength={USERNAME_MAX} autoCapitalize="off" spellCheck={false} />
        <input name="password" type="password" aria-label="Password" maxLength={PASSWORD_MAX} />
        <button name="send" />
        <button name="other" type="button" />
      </form>
      <form ref={packsForm} className="panel" aria-label="Packs" hidden>
        <input name="file" type="file" accept=".json,application/json" aria-label="Add a pack" />
        <button name="button" type="button" />
      </form>
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
