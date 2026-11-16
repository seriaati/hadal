import { useEffect, useRef, useState } from "react";
import type { Config } from "../shared/types";
import { DevMenu, type DevTools } from "./DevMenu";
import { Logbook } from "./Logbook";
import { Sound } from "./sound";
import { createGame, pressEnter, tick, type Game as Dive } from "./state";
import { Display, Frame } from "./pixel/frame";
import { Scene } from "./pixel/scene";
import { Settings } from "./pixel/settings";

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
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
    // In development, let the browser console (and test scripts) reach the game.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display, sound, settings } });

    void fetch("/api/config")
      .then((res) => res.json() as Promise<Config>)
      .then((config) => config.devMode && setDev({ game, scene, frame }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (settings.open) {
        settings.open = false; // with the settings open, either key only closes them
        return;
      }
      if (event.key !== "Enter") return;
      if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
      pressEnter(game);
      if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
    };
    // Keep the typing focus wherever the player clicks or taps.
    const keepFocus = (event: MouseEvent) => {
      if (event.target !== input) event.preventDefault();
      input.focus();
    };
    // A press that takes hold of a slider in the settings keeps it until the pointer lifts.
    const onPointer = (event: PointerEvent) => {
      const scale = canvas.clientWidth / frame.width;
      const x = event.clientX / scale;
      if (event.type === "pointerdown" && settings.press(frame, x, event.clientY / scale)) canvas.setPointerCapture(event.pointerId);
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
      tick(game, dt);
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
        const lights = scene.draw(frame, game, dt, now / 1000);
        settings.draw(frame);
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
      <input ref={keys} className="keys" aria-label="Your answer" maxLength={40} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {dev && <DevMenu {...dev} />}
    </main>
  );
}
