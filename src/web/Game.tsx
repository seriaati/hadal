import { useEffect, useRef } from "react";
import { createGame, pressEnter, tick } from "./state";
import { Display, Frame } from "./pixel/frame";
import { Scene } from "./pixel/scene";

/** The whole game is drawn on canvas. A hidden text field takes the typing, so phones get a keyboard. */
export function Game() {
  const pixels = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = keys.current!;
    const game = createGame();
    const scene = new Scene();
    const frame = new Frame();
    const display = new Display(pixels.current!, glow.current!);
    // In development, let the browser console (and test scripts) reach the game.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { hadal: { game, scene, frame, display } });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (game.phase === "ask") game.input = input.value; // include keys typed since the last frame
      pressEnter(game);
      if (game.phase === "ask") input.value = game.input; // an answer that was sent leaves the field empty
    };
    // Keep the typing focus wherever the player clicks or taps.
    const keepFocus = (event: MouseEvent) => {
      if (event.target !== input) event.preventDefault();
      input.focus();
    };
    input.addEventListener("keydown", onKey);
    addEventListener("mousedown", keepFocus);

    let last = performance.now();
    let request = requestAnimationFrame(function loop(now) {
      request = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (game.phase === "ask") game.input = input.value;
      else input.value = "";
      tick(game, dt);
      display.fit(frame);
      display.present(frame, scene.draw(frame, game, dt, now / 1000));
    });

    return () => {
      cancelAnimationFrame(request);
      input.removeEventListener("keydown", onKey);
      removeEventListener("mousedown", keepFocus);
    };
  }, []);

  return (
    <main className="stage">
      <canvas ref={pixels} className="pixels" />
      <canvas ref={glow} className="glow" />
      <input ref={keys} className="keys" aria-label="Your answer" maxLength={40} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} />
    </main>
  );
}
