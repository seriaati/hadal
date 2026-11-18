import caveat from "@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2";
import fredericka from "@fontsource/fredericka-the-great/files/fredericka-the-great-latin-400-normal.woff2";
import specialElite from "@fontsource/special-elite/files/special-elite-latin-400-normal.woff2";
import { useEffect, useRef, useState } from "react";
import { drawDive } from "./logbook/dive";
import { drawEntries } from "./logbook/entries";
import { isRoom, type Log } from "./logbook/log";
import { DISPLAY, HAND, TYPED, flatten, reseed } from "./logbook/sketch";

// The book's three faces are fetched as the game starts, because lettering drawn on canvas before
// its font has arrived stays in the wrong face. They are loaded here and not through the packages'
// stylesheets, which the bundler would inline whole (every script, every format) into the page's CSS.
const fonts = Promise.all(
  ([[HAND, caveat, "400 700"], [DISPLAY, fredericka, "400"], [TYPED, specialElite, "400"]] as const).map(([family, url, weight]) => {
    const face = new FontFace(family, `url(${url})`, { weight });
    document.fonts.add(face);
    return face.load();
  }),
);

/** Paint both pages. Painting all of it at once would freeze the game for half a second, so it stops at every `yield`. */
function* paint(log: Log, pages: HTMLElement[], narrow: boolean) {
  reseed(Math.round(isRoom(log) ? Math.max(...log.divers.map((diver) => diver.depth)) : log.depth));
  for (const [i, draw] of [drawDive, drawEntries].entries()) {
    const sheet = yield* draw(log, narrow);
    yield;
    pages[i]!.replaceChildren(flatten(sheet));
    yield;
  }
}

/**
 * The summary of a finished dive (a single player's, or a room's), as two pages of a hand-drawn logbook laid over
 * the game. It is given the dive as soon as that ends, opens once the diver has `surfaced`, and a click asks to `close` it.
 */
export function Logbook({ log, surfaced, close }: { log: Log | null; surfaced: boolean; close: () => void }) {
  const desk = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  /** An upright screen gets a layout of its own: the pages stacked, the writing larger. */
  const [narrow, setNarrow] = useState(false);
  const up = useRef(surfaced);
  up.current = surfaced;

  // The pages are painted once, while the diver is hauled up, and stay as they are while the book fades out.
  useEffect(() => {
    if (!log) return;
    let closed = false;
    void fonts.then(() => {
      if (closed) return;
      const upright = matchMedia("(max-aspect-ratio: 1/1)").matches;
      setNarrow(upright);
      desk.current!.scrollTop = 0;
      const steps = paint(log, [left.current!, right.current!], upright);
      const work = () => {
        if (closed) return;
        // On the way up, the game draws a frame between every two steps. At the surface nothing is left to keep smooth.
        do {
          if (steps.next().done) return setReady(true);
        } while (up.current);
        requestAnimationFrame(work);
      };
      work();
    });
    return () => {
      closed = true;
      setReady(false);
    };
  }, [log]);

  return (
    <div ref={desk} className={ready && surfaced ? "logbook open" : "logbook"} onClick={() => log && close()}>
      <div className={narrow ? "book narrow" : "book"}>
        <div className="page" ref={left} />
        <div className="page" ref={right} />
      </div>
    </div>
  );
}
