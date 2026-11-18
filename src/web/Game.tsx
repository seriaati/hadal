import { useEffect, useRef, useState } from "react";
import { MAX_ANSWER_LENGTH, type Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
import { Logbook } from "./Logbook";
import type { Log } from "./logbook/log";
import { Sound } from "./sound";
import { createGame, leave, pressEnter, start, tick } from "./state";
import { AccountPanel } from "./pixel/account";
import { drawable } from "./pixel/other";
import { Display, Frame } from "./pixel/frame";
import { MultiplayerPanel } from "./pixel/multiplayer";
import { PacksPanel } from "./pixel/packs";
import { Scene } from "./pixel/scene";
import { drawCog, overCog, settingsStep } from "./pixel/settings";
import { Ui, type Part, type Step } from "./pixel/ui";

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  /** The dive the logbook is drawn for (the player's own, or the room's), from the moment it ends, and whether the diver is back at the surface. */
  const [logged, setLogged] = useState<Log | null>(null);
  const [surfaced, setSurfaced] = useState(false);
  /** What a click on the open logbook does: it is set once the game is made. */
  const closeBook = useRef(() => {});
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
    const multiplayer = new MultiplayerPanel(ui, account, sound);
    // A room's logbook leads back to the room; a single player's, to the title.
    closeBook.current = () => (multiplayer.ending ? multiplayer.closeBook() : pressEnter(game));
    /** The dive on screen: the player's own, or the room's while the room dives. */
    let shown = game;
    /** The title menu: its lines, and the one Enter acts on. */
    const menu = { items: ["Descend", "Packs", "Multiplayer", "Sign in"], choice: 0 };
    const choose = (line: number) => {
      if (line === 0) pressEnter(game);
      else if (line === 1) packs.show();
      else if (line === 2) multiplayer.show();
      else account.show();
    };
    /** Whether the step about leaving the dive was opened with Escape: it then says what a second Escape does. */
    let byEscape = false;
    const leaveDive = () => {
      ui.close();
      if (multiplayer.diving) multiplayer.leaveDive();
      else leave(game);
      input.value = "";
    };
    /** In a dive, Escape or the cog asks whether to leave it. The settings are a line of this step. */
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
    /** What Escape and the cog open when nothing is open: the settings at the title, the way out of a dive in a dive. */
    const openMenu = (escape: boolean) => {
      byEscape = escape;
      if (shown.phase === "title") ui.go(settings);
      else if (shown.phase === "ask" || shown.phase === "verdict") ui.go(leaving);
    };
    // In development, let the browser console (and test scripts) reach the game.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, ui, account, packs, multiplayer, room: multiplayer.client } });

    void fetch("/api/config")
      .then((res) => res.json() as Promise<Config>)
      .then((config) => config.devMode && setDev({ game, scene, frame, multiplayer }));

    const onKey = (event: KeyboardEvent) => {
      // While a keyboard is still composing a letter (as for Japanese or Chinese), Enter picks the letter; it sends nothing.
      if (event.isComposing) return;
      // These keys come here only while no panel is open: an open panel has the focus and its own keys.
      if (shown.phase === "title" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        // From the last line Down goes to the first, as in every list of the game.
        menu.choice = (menu.choice + (event.key === "ArrowUp" ? -1 : 1) + menu.items.length) % menu.items.length;
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (multiplayer.ending) return multiplayer.closeBook();
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
    /** When the divers came back to the surface, in seconds. */
    let doneAt = 0;
    let last = performance.now();
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
      const log = multiplayer.ending?.log ?? (game.phase === "ascent" || game.phase === "done" ? game : null);
      if (log !== ended) {
        ended = log;
        setLogged(log);
        if (log) ui.close(); // the settings, if the dive ended while they were open
      }
      const up = multiplayer.ending ? multiplayer.surfaced : game.phase === "done";
      if (up !== done) {
        done = up;
        doneAt = now / 1000;
        setSurfaced(done);
      }
      display.fit(frame);
      // Once the logbook has faded in it hides the sea, which need not be drawn.
      if (!done || now / 1000 - doneAt < 1) {
        menu.items[3] = account.account?.username ?? "Sign in";
        multiplayer.update();
        shown = multiplayer.game(now / 1000) ?? game;
        // The diver whose turn it is sees their own typing at once, not as it comes back from the server.
        if (multiplayer.yours) shown.input = input.value;
        scene.crew = multiplayer.crew();
        scene.turn = multiplayer.turn();
        const lights = scene.draw(frame, shown, menu, dt, now / 1000, ui.open);
        drawCog(frame);
        ui.draw(frame, scene, canvas.clientWidth / frame.width, now / 1000, shown.phase !== "title");
        display.present(frame, lights);
      }
      sound.update(shown, scene, dt);
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
      <Logbook log={logged} surfaced={surfaced} close={() => closeBook.current()} />
      <input ref={keys} className="keys" aria-label="Your answer" maxLength={MAX_ANSWER_LENGTH} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {/* Whatever panel is open: `Ui` fills it with the controls of the step on screen. */}
      <form ref={form} className="panel" aria-label="Menu" hidden />
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
