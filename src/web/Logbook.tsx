import caveat from "@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2";
import fredericka from "@fontsource/fredericka-the-great/files/fredericka-the-great-latin-400-normal.woff2";
import specialElite from "@fontsource/special-elite/files/special-elite-latin-400-normal.woff2";
import { useEffect, useRef, useState } from "react";
import { drawDive } from "./logbook/dive";
import { drawEntries } from "./logbook/entries";
import { DISPLAY, HAND, TYPED, createSheet, flatten, reseed, type Sheet } from "./logbook/sketch";
import { pressEnter, type Game } from "./state";

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

/** The summary of a finished dive, as two pages of a hand-drawn logbook laid over the game. */
export function Logbook({ dive }: { dive: Game | null }) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // The pages are drawn once when a dive ends, and stay as they are while the book fades out.
  // The book opens only when both are ready, so that drawing them takes nothing out of the fade.
  useEffect(() => {
    if (!dive) return;
    let closed = false;
    void fonts.then(() => {
      if (closed) return;
      reseed(Math.round(dive.depth));
      for (const [page, draw] of [[left, drawDive], [right, drawEntries]] as const) {
        const sheet: Sheet = createSheet();
        draw(sheet, dive);
        page.current!.replaceChildren(flatten(sheet));
      }
      requestAnimationFrame(() => setOpen(!closed));
    });
    return () => {
      closed = true;
      setOpen(false);
    };
  }, [dive]);

  return (
    <div className={open ? "logbook open" : "logbook"} onClick={() => dive && pressEnter(dive)}>
      <div className="book">
        <div className="page" ref={left} />
        <div className="page" ref={right} />
      </div>
    </div>
  );
}
