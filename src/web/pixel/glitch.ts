import type { Game } from "../state";
import { FONTS, drawText, measure, wrap } from "./font";
import { hash, type Frame } from "./frame";

// A chaos dive is seen as if on an old tape that is failing: grain, scanlines, colours that slip off what is bright, a
// tracking band, and faults that tear, freeze, roll, melt and shatter the picture, worse the deeper and the shorter of air.

/** A palette colour one step darker, by index. */
const DARKER = [0, 0, 1, 2, 3, 4, 5, 6, 2, 8, 9, 10, 1, 12, 13, 14, 15, 2, 12, 1, 19, 20];
/** The colours of a band gone wrong: the sea in the reds of a warning lamp. */
const WRONG = [12, 12, 12, 12, 13, 13, 18, 14, 12, 13, 14, 15, 1, 4, 9, 10, 7, 3, 9, 12, 13, 14];
/** Colours bright enough for the tape's colours to slip off them. */
const BRIGHT = new Set([7, 10, 11, 14, 15, 16, 18]);
/**
 * Faults start at most this often, static stays dark, and nothing bright fills the screen: fast, large flashes can bring
 * on seizures in people prone to them.
 */
const MOST_PER_SECOND = 3;
/** Static: mostly black, some dim specks, a few pale ones. */
const speck = () => {
  const r = Math.random();
  return r < 0.55 ? 0 : r < 0.8 ? 3 : r < 0.94 ? 5 : 6;
};

/**
 * What the black screen says when a chaos dive is lost, one line picked at random. A line that `scares` ends with the eyes
 * bursting out of the dark.
 */
export const LAST_WORDS: { text: string; scares?: boolean }[] = [
  { text: "the sea is still watching you" },
  { text: "the sea stares back at you" },
  { text: "a little too confident, huh?", scares: true },
  { text: "nobody is coming for you" },
  { text: "you were never alone down here" },
  { text: "did you hear that?", scares: true },
  { text: "the lamps go out one by one" },
  { text: "it knows your name now" },
  { text: "the dark was patient" },
  { text: "something kept your lantern" },
  { text: "you will come back. they always do" },
  { text: "the line is cut. no one is pulling" },
  { text: "down here, nobody hears the bell" },
  { text: "it was waiting at this depth" },
  { text: "your air was never yours" },
  { text: "look behind you", scares: true },
  { text: "it was right next to you", scares: true },
  { text: "you should not have looked down", scares: true },
  { text: "hold your breath", scares: true },
  { text: "it's still here", scares: true },
];
/**
 * A lost dive, in seconds from the air running out: the static rises, the set switches off, the screen is dark, the last
 * words are typed, and for some of them, after a moment's silence once the last letter is down, the eyes come. The
 * logbook follows at `LOST_SECONDS` (7.5), time enough for the longest line that scares.
 */
const STATIC_AT = 0.8;
export const OFF_AT = 2.1;
export const DARK_AT = 3;
const WORDS_AT = 3.4;
const LETTERS_PER_SECOND = 16;
const SCARE_PAUSE = 1;
export const SCARE_FOR = 0.7;

/** When the eyes come after a line that scares, in seconds from the dive being lost: once it is typed, and a moment of silence has passed. */
export const scareAt = (text: string) => WORDS_AT + text.length / LETTERS_PER_SECOND + SCARE_PAUSE;

type Kind = "tear" | "wrong" | "static" | "stick" | "roll" | "melt" | "shatter";
type Fault = { kind: Kind; top: number; rows: number; left: number; width: number; shift: number; age: number; life: number; seed: number };
type Point = { x: number; y: number };
type Layers = [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

/**
 * How badly a chaos dive is failing, from 0 to 1: noticeably from the start, more the deeper the diver is (`depth` in
 * metres, as shown) and the shorter of air (`panic`, from 0 to 1), and all the way once the dive is lost.
 */
export function strength(game: Game, depth: number, panic: number): number {
  if (!game.chaos || game.phase === "title" || game.phase === "done") return 0;
  if (game.phase === "lost") return 1;
  return Math.min(1, 0.25 + 0.4 * Math.min(1, depth / 9000) + 0.45 * panic);
}

export class Glitch {
  /** How bad it is now, from 0 to 1, and how many faults and losses of signal have begun: the sound follows them. */
  level = 0;
  count = 0;
  losses = 0;
  /** Seconds of signal loss left, while the picture is lost in static. */
  lost = 0;
  /** Seconds since a chaos dive was lost, or -1 while it is not. */
  lostFor = -1;
  /** In a lost dive: its last words, how many of their letters are typed so far, and whether the eyes have come. */
  words: (typeof LAST_WORDS)[number] = LAST_WORDS[0]!;
  typed = 0;
  scared = false;
  private faults: Fault[] = [];
  private wait = 0;
  private nextLoss = 8;
  /** Whether something shows through the static of this loss of signal. */
  private apparition = false;
  private tape = 0;
  private still: Layers | null = null;

  /** Whether a lost dive's set has been switched off: no light shows from then on. */
  get blackout(): boolean {
    return this.lostFor >= OFF_AT;
  }

  /** A hard burst of faults at once, as a chaos dive begins. */
  cut(height: number, focus: Point) {
    this.tape = 0;
    this.nextLoss = 8;
    for (const kind of ["stick", "tear", "tear", "tear"] as const) this.start(1, height, focus, kind);
    this.wait = 1 / MOST_PER_SECOND;
  }

  /** Start and end faults. Many fall about `focus`, the diver: deep down the rest of the screen is too dark to show them. */
  update(dt: number, level: number, height: number, focus: Point, game: Game) {
    this.level = level;
    this.tape = level > 0 ? this.tape + dt : 0;
    const lostFor = game.chaos && game.phase === "lost" ? game.phaseTime : -1;
    if (lostFor >= 0 && this.lostFor < 0) this.words = LAST_WORDS[Math.floor(Math.random() * LAST_WORDS.length)]!;
    this.lostFor = lostFor;
    this.typed = lostFor < WORDS_AT ? 0 : Math.min(this.words.text.length, Math.floor((lostFor - WORDS_AT) * LETTERS_PER_SECOND));
    this.scared = !!this.words.scares && lostFor >= scareAt(this.words.text) && lostFor < scareAt(this.words.text) + SCARE_FOR;
    for (const fault of this.faults) fault.age += dt;
    this.faults = this.faults.filter((fault) => fault.age < fault.life);
    this.lost = Math.max(0, this.lost - dt);
    if (level <= 0) {
      this.faults = [];
      this.lost = 0;
      return;
    }
    // A dive that is lost loses its signal for good, once "Out of air" has been seen.
    if (lostFor >= STATIC_AT && lostFor < DARK_AT && this.lost <= 0) this.loseSignal(DARK_AT - lostFor, false);

    this.nextLoss -= dt;
    this.wait -= dt;
    if (this.wait > 0) return;
    if (this.nextLoss <= 0 && game.phase !== "drop") {
      this.loseSignal(0.4 + 0.9 * level, Math.random() < 0.3 + 0.4 * level);
      this.nextLoss = (24 - 16 * level) * (0.6 + Math.random() * 0.8);
    } else {
      const kinds: Kind[] = ["tear", "tear", "wrong", "static"];
      if (level > 0.3) kinds.push("stick", "melt");
      // Rolling moves the whole picture, so it is kept for when the dive is going badly.
      if (level > 0.6) kinds.push("roll");
      if (level > 0.5) kinds.push("shatter", "melt", "tear");
      this.start(level, height, focus, kinds[Math.floor(Math.random() * kinds.length)]!);
    }
    // From a fault every second or two at the start to the most there may be.
    const rate = 0.6 + (MOST_PER_SECOND - 0.6) * level;
    this.wait = Math.max(1 / MOST_PER_SECOND, -Math.log(1 - Math.random()) / rate);
  }

  private loseSignal(seconds: number, apparition: boolean) {
    this.lost = seconds;
    this.apparition = apparition;
    this.losses++;
  }

  private start(level: number, height: number, focus: Point, kind: Kind) {
    const near = Math.random() < 0.6;
    const big = kind === "roll" || kind === "melt" || kind === "shatter";
    const rows = kind === "wrong" ? 1 + Math.floor(Math.random() * 4) : big ? 40 + Math.floor(Math.random() * 50 * level) : 3 + Math.floor(Math.random() * (6 + 36 * level));
    const width = big ? 50 + Math.floor(Math.random() * 90) : 14 + Math.floor(Math.random() * 50);
    const reach = 3 + Math.floor(Math.random() * (4 + 36 * level));
    const life = kind === "stick" ? 0.1 + Math.random() * 0.25 : big ? 0.5 + Math.random() * 0.6 : 0.06 + Math.random() * (0.1 + 0.3 * level);
    this.faults.push({
      kind,
      top: Math.floor(near ? focus.y - rows / 2 + (Math.random() - 0.5) * 50 : Math.random() * Math.max(1, height - rows)),
      rows,
      left: Math.floor(near ? focus.x - width / 2 + (Math.random() - 0.5) * 40 : Math.random() * 400),
      width,
      shift: Math.random() < 0.5 ? -reach : reach,
      age: 0,
      life,
      seed: Math.floor(Math.random() * 1e6),
    });
    if (kind === "stick") this.still = null;
    this.count++;
  }

  /** Lay the tape over the frame. `wordsFrom` and `wordsTo` give, for each row, the span the words take, which stays readable. */
  apply(frame: Frame, wordsFrom: Int16Array, wordsTo: Int16Array, time: number, focus: Point) {
    if (this.level <= 0) return;
    const { width: W, height: H } = frame;
    const free = (x: number, y: number) => x < wordsFrom[y]! || x > wordsTo[y]!;
    const layers: Layers = [frame.color, frame.glowColor, frame.glowStrength, frame.shade];
    const copy = (to: number, from: Layers, at: number) => {
      for (let k = 0; k < 4; k++) layers[k]![to] = from[k]![at]!;
    };
    const blank = (i: number, color = 0) => {
      frame.color[i] = color;
      frame.glowColor[i] = 0;
      frame.shade[i] = 0;
    };

    // ---- a frozen picture
    if (!this.faults.some((fault) => fault.kind === "stick")) this.still = null;
    else if (!this.still) this.still = layers.map((layer) => layer.slice()) as Layers;
    else for (let i = 0; i < W * H; i++) if (free(i % W, Math.floor(i / W))) copy(i, this.still, i);

    // ---- faults that move the picture read it as it was before they began moving it
    const before = layers.map((layer) => layer.slice()) as Layers;
    for (const fault of this.faults) {
      const t = fault.age / fault.life;
      const top = Math.max(0, fault.top);
      const bottom = Math.min(H, fault.top + fault.rows);
      const left = Math.max(0, fault.kind === "wrong" || fault.kind === "tear" || fault.kind === "roll" ? 0 : fault.left % W);
      const right = Math.min(W, fault.kind === "wrong" || fault.kind === "tear" || fault.kind === "roll" ? W : left + fault.width);
      if (fault.kind === "tear") {
        // Rows torn sideways, each by a little more or less.
        for (let y = top; y < bottom; y++) {
          const shift = Math.round(fault.shift * (0.6 + 0.4 * hash(y, fault.seed)));
          for (let x = 0; x < W; x++) {
            const from = x - shift;
            if (free(x, y) && from >= 0 && from < W && free(from, y)) copy(y * W + x, before, y * W + from);
          }
        }
      } else if (fault.kind === "roll") {
        // The picture loses its hold and rolls up, a black bar between one frame and the next.
        const offset = Math.round(Math.sin(Math.PI * t) * H * 0.12 * (fault.shift > 0 ? 1 : 0.6));
        for (let y = 0; y < H; y++) {
          const from = (y + offset) % H;
          const seam = (H - offset + H) % H;
          for (let x = 0; x < W; x++) {
            if (!free(x, y) || !free(x, from)) continue;
            if (y >= seam - 3 && y < seam + 3) blank(y * W + x);
            else copy(y * W + x, before, from * W + x);
          }
        }
      } else if (fault.kind === "melt") {
        // The picture runs down like wet paint, each column at its own pace.
        for (let x = left; x < right; x++) {
          const drip = Math.round(hash(x, fault.seed) ** 2 * 50 * Math.sin((Math.PI / 2) * Math.min(1, t * 1.6)));
          for (let y = bottom - 1; y >= top; y--) {
            const from = Math.max(top, y - drip);
            if (free(x, y) && free(x, from)) copy(y * W + x, before, from * W + x);
          }
        }
      } else if (fault.kind === "shatter") {
        // The picture breaks into blocks that fall away, leaving the dark behind them.
        const size = 6 + (fault.seed % 7);
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (free(x, y)) blank(y * W + x);
        for (let by = top; by < bottom; by += size) {
          for (let bx = left; bx < right; bx += size) {
            const k = hash(bx, by + fault.seed);
            const a = fault.age;
            const dx = Math.round((k - 0.5) * 60 * a);
            const dy = Math.round((10 + 30 * hash(by, bx + fault.seed)) * a + 0.5 * 160 * a * a);
            for (let y = by; y < Math.min(bottom, by + size); y++) {
              for (let x = bx; x < Math.min(right, bx + size); x++) {
                const tx = x + dx;
                const ty = y + dy;
                if (tx >= 0 && tx < W && ty >= 0 && ty < H && free(tx, ty) && free(x, y)) copy(ty * W + tx, before, y * W + x);
              }
            }
          }
        }
      } else {
        // A thin line in the wrong colours, or a patch of static.
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            if (!free(x, y)) continue;
            const i = y * W + x;
            if (fault.kind === "static") blank(i, speck());
            else blank(i, WRONG[frame.color[i]!]!);
          }
        }
      }
    }

    // ---- the signal lost: the picture drowns in static, and sometimes something looks out of it
    const at = this.lostFor;
    if (this.lost > 0) {
      const thick = at >= 0 ? Math.min(1, (at - STATIC_AT) / 1) : 0.85;
      for (let y = 0; y < H; y++) {
        const streak = hash(y, Math.floor(time * 24)) < 0.08;
        for (let x = 0; x < W; x++) {
          if (free(x, y) && Math.random() < thick) blank(y * W + x, streak && Math.random() < 0.5 ? 5 : speck());
        }
      }
      if (this.apparition) this.stare(frame, free, time, focus, false);
    }

    // ---- the tape itself, all along
    const level = this.level;
    // Its colours slip off whatever is bright: red to the left, teal to the right.
    const slip = level > 0.55 ? 2 : 1;
    for (let y = 0; y < H; y++) {
      for (let x = slip; x < W - slip; x++) {
        if (!BRIGHT.has(before[0][y * W + x]!)) continue;
        if (frame.color[y * W + x - slip]! <= 4) frame.color[y * W + x - slip] = 12;
        if (frame.color[y * W + x + slip]! <= 4) frame.color[y * W + x + slip] = 8;
      }
    }
    // Scanlines, and grain that never sits still.
    for (let y = 1; y < H; y += 2) for (let x = 0; x < W; x++) if (free(x, y)) frame.color[y * W + x] = DARKER[frame.color[y * W + x]!]!;
    for (let n = Math.round(W * H * 0.004 * (0.5 + level)); n > 0; n--) {
      const x = Math.floor(Math.random() * W);
      const y = Math.floor(Math.random() * H);
      if (free(x, y)) frame.color[y * W + x] = 3 + Math.floor(Math.random() * 4);
    }
    // A tracking band near the foot of the screen: rows that jitter sideways, streaked with noise.
    const bandRows = Math.round(4 + 14 * level);
    const bandTop = Math.round(H - 14 - bandRows - 10 * Math.sin(time * 0.37));
    for (let y = Math.max(0, bandTop); y < Math.min(H, bandTop + bandRows); y++) {
      const shift = Math.round((hash(y, Math.floor(time * 20)) - 0.5) * (4 + 20 * level));
      const row = layers.map((layer) => layer.slice(y * W, (y + 1) * W)) as Layers;
      for (let x = 0; x < W; x++) {
        if (!free(x, y)) continue;
        const from = Math.min(W - 1, Math.max(0, x - shift));
        copy(y * W + x, row, from);
        if (Math.random() < 0.08 * level) frame.color[y * W + x] = speck();
      }
    }

    // ---- what the camera writes in the corner
    if (at < OFF_AT) this.caption(frame, time);

    // ---- a lost dive: the set switches off, the picture squeezed to a line, then to nothing
    if (at >= OFF_AT && at < DARK_AT) {
      const t = (at - OFF_AT) / (DARK_AT - OFF_AT);
      const keep = Math.max(0, Math.round((H / 2) * (1 - t * 2)));
      const reach = t < 0.5 ? W : Math.round(W * (1 - (t - 0.5) * 2));
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const line = Math.abs(y - H / 2) <= Math.max(0, keep) && Math.abs(x - W / 2) <= reach / 2;
          if (!line) blank(i);
          else if (keep <= 1) blank(i, 6);
        }
      }
      frame.glowStrength.fill(0);
    }
    // ---- then the dark, and the last words typed into it
    if (at >= DARK_AT) {
      for (let i = 0; i < W * H; i++) blank(i);
      frame.glowStrength.fill(0);
      if (this.scared) this.stare(frame, () => true, time, { x: W / 2, y: H / 2 }, true);
      else if (at < scareAt(this.words.text) || !this.words.scares) this.lastWords(frame, time);
    }
  }

  /** The last words of a lost dive, typed a letter at a time in the middle of the dark, trembling now and then. */
  private lastWords(frame: Frame, time: number) {
    const { width: W, height: H } = frame;
    const { medium } = FONTS;
    const lines = wrap(medium, this.words.text.slice(0, this.typed), W - 16);
    const top = Math.round(H / 2 - (lines.length * 12) / 2);
    lines.forEach((line, k) => {
      const shake = hash(k, Math.floor(time * 12)) < 0.12 ? (hash(k, Math.floor(time * 12) + 1) < 0.5 ? -1 : 1) : 0;
      drawText(frame, medium, line, Math.round((W - measure(medium, line)) / 2) + shake, top + k * 12, 7);
    });
  }

  /** "PLAY" and the tape's running time, as a camcorder writes them, or "TRACKING" while the signal is lost. */
  private caption(frame: Frame, time: number) {
    const { tiny } = FONTS;
    if (this.lost > 0) {
      if (Math.floor(time * 2.5) % 2 === 0) drawText(frame, tiny, "TRACKING", 6, 6, 7);
      return;
    }
    frame.sprite(["6..", "66.", "666", "66.", "6.."], 6, 6);
    drawText(frame, tiny, "PLAY", 11, 6, 7);
    const seconds = Math.floor(this.tape);
    const clock = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    drawText(frame, tiny, clock, 6, 14, 6);
  }

  /**
   * A pair of eyes, far too large, looking out of the static just above the diver (`focus`), clear of the words; or, as
   * the last thing of a lost dive (`close`), out of the dark in the middle of the screen, larger still.
   */
  private stare(frame: Frame, free: (x: number, y: number) => boolean, time: number, focus: Point, close: boolean) {
    const { width: W, height: H } = frame;
    const r = Math.max(6, Math.round(Math.min(W, H) * (close ? 0.17 : 0.07)));
    const gap = r * 3.2;
    const cx = Math.max(gap / 2 + r * 1.6, Math.min(W - gap / 2 - r * 1.6, focus.x));
    const cy = close ? focus.y : Math.max(r + 2, focus.y - r * 2.2);
    for (const side of [-1, 1]) {
      const ex = cx + (side * gap) / 2;
      for (let y = Math.round(cy - r); y <= cy + r; y++) {
        for (let x = Math.round(ex - r * 1.6); x <= ex + r * 1.6; x++) {
          const u = (x - ex) / (r * 1.6);
          const v = (y - cy) / r;
          if (u * u + v * v > 1 || x < 0 || y < 0 || x >= W || y >= H || !free(x, y)) continue;
          if (Math.random() < 0.25) continue; // the static shows through
          const d = Math.hypot(x - ex, y - cy);
          const vein = hash(Math.round(Math.atan2(y - cy, x - ex) * 6), 7) < 0.3 && d > r * 0.55;
          const i = y * W + x;
          frame.color[i] = d < r * 0.22 ? 0 : d < r * 0.5 ? 18 : vein ? 18 : 7;
          frame.glowColor[i] = frame.color[i] === 18 ? 19 : 0;
          frame.glowStrength[i] = frame.color[i] === 18 ? 60 : 0;
        }
      }
      // A tear of blood runs from each.
      const run = Math.round(r * 0.8 + ((time * 6) % (r * 2)));
      for (let j = 0; j < run; j++) {
        const x = Math.round(ex + side * r * 0.4);
        const y = Math.round(cy + r * 0.8 + j);
        if (y < H && x >= 0 && x < W && free(x, y)) frame.color[y * W + x] = j < run - 2 ? 12 : 18;
      }
    }
  }
}
