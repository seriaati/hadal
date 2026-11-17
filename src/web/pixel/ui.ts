import { FONTS, drawText, measure, pitch, plain, wrap } from "./font";
import { dither, type Frame } from "./frame";
import type { Scene } from "./scene";

// The parts every panel is built from and the one way of controlling them: see docs/UI.md.

/** Anything that is pressed: a row of a list, a button, a link. They all look alike. */
export type Press = {
  kind: "press";
  id: string;
  label: string;
  press?: () => void;
  /** Pressing it opens the device's file chooser instead, and the chosen file comes here. */
  file?: (file: File) => void;
  /** What a screen reader says, where the label alone would not tell. */
  says?: string;
  /** Pressing it sends the form, which is what tells a password manager that a password was used. */
  submit?: boolean;
  quiet?: boolean;
  danger?: boolean;
  /** Set against the right edge of its row. */
  right?: boolean;
  /** Called when the focus leaves it. */
  left?: () => void;
};
export type Field = { kind: "field"; id: string; label: string; max: number; dots?: boolean; password?: boolean; autocomplete: string };
export type Slider = { kind: "slider"; id: string; label: string; value: number; set: (value: number) => void };
export type Note = { kind: "note"; text: string; bad?: boolean };
export type Wait = { kind: "wait"; text: string; done: number; of: number };
export type Part = Press | Field | Slider | Note | Wait | { kind: "gap" };
type Control = Press | Field | Slider;
/** One screen of a panel: its name, and its rows from the top. While `busy`, presses wait. */
export type Step = { title: string; rows: (Part | Part[])[]; busy?: boolean };

/** Where a part is, from the top left of its step. */
export type Placed = { part: Part; row: number; x: number; y: number; w: number; h: number; lines: string[] };
export type Move = "up" | "down" | "left" | "right" | "next" | "previous";

/** The height of a line on a large screen. */
const LINE = 12;
const HEAD = 14;
/** Room before the words of a line for the mark of the focus. */
const INDENT = 7;
const STEPS = 20;
const TRACK = STEPS * 3;
const MARK = ["a..", "aa.", "aaa", "aa.", "a.."];

const isControl = (part: Part): part is Control => part.kind === "press" || part.kind === "field" || part.kind === "slider";
const kindOf = (part: Control) => (part.kind === "press" ? (part.file ? "file" : part.submit ? "submit" : "press") : part.kind);
const natural = (part: Part) => INDENT + (part.kind === "press" ? measure(FONTS.tiny, plain(part.label)) : 0) + 2;

/** The mark of the focus: drawn before the line that has it, here and in the title menu. */
export function drawMark(frame: Frame, x: number, y: number) {
  frame.emit = 220;
  frame.sprite(MARK, x, y);
  frame.emit = 0;
}

/** Set a step out in a column of a given width, with lines of a given height. */
export function lay(step: Step, width: number, line: number): { placed: Placed[]; height: number } {
  const placed: Placed[] = [];
  let y = HEAD + ((line - LINE) >> 1);
  step.rows.forEach((row, index) => {
    const parts = Array.isArray(row) ? row : [row];
    let x = 0;
    let tall = 0;
    parts.forEach((part, i) => {
      let lines: string[] = [];
      let h = line;
      if (part.kind === "gap") h = 8;
      else if (part.kind === "field") h = line + 10;
      else if (part.kind === "note" || part.kind === "wait") {
        const text = plain(part.text);
        lines = wrap(FONTS.tiny, text, width - INDENT);
        h = lines.length * pitch(FONTS.tiny, text, 8) + (part.kind === "wait" ? 16 : 3);
      }
      let w = width - x;
      if (parts.length > 1) {
        const next = parts[i + 1];
        w = natural(part);
        if (part.kind === "press" && part.right) x = width - w;
        else if (next?.kind === "press" && next.right) w = width - natural(next) - 4 - x;
      }
      placed.push({ part, row: index, x, y, w, h, lines });
      x += w + 8;
      tall = Math.max(tall, h);
    });
    y += tall;
  });
  return { placed, height: y };
}

/** Where the focus goes from one control: along its row, round the whole step, or to the nearest thing in the row above or below. */
export function move(placed: Placed[], from: Placed, way: Move): Placed | undefined {
  const controls = placed.filter((spot) => isControl(spot.part));
  const at = controls.indexOf(from);
  if (way === "next" || way === "previous") return controls[(at + (way === "next" ? 1 : -1) + controls.length) % controls.length];
  if (way === "left" || way === "right") {
    const beside = controls[at + (way === "right" ? 1 : -1)];
    return beside?.row === from.row ? beside : undefined;
  }
  const rows = [...new Set(controls.map((spot) => spot.row))];
  const row = rows[(rows.indexOf(from.row) + (way === "down" ? 1 : -1) + rows.length) % rows.length];
  return controls.filter((spot) => spot.row === row).reduce((a, b) => (Math.abs(b.x - from.x) < Math.abs(a.x - from.x) ? b : a));
}

/**
 * Whatever panel is open. A panel is a stack of steps, each a function that says what the
 * step holds right now; it is asked again every frame, so a panel only keeps its own state.
 * Every control is a real but invisible HTML control laid over its drawing, so the focus on
 * screen is the browser's own, and passwords, phone keyboards and screen readers work.
 */
export class Ui {
  private steps: { build: () => Step; focus: string }[] = [];
  private step: Step = { title: "", rows: [] };
  private parts = new Map<string, Control>();
  private controls = new Map<string, HTMLInputElement | HTMLButtonElement>();
  /** What was typed in the fields of steps that are not on screen, until the panel closes. */
  private kept = new Map<string, string>();
  private placed: Placed[] = [];
  private box = { x: 0, y: 0, w: 0, h: 0 };
  /** The control to give the focus as soon as it exists. */
  private wanted = "";
  private leave = document.createElement("button");

  /** `typing` is what takes the keys while no panel is open. */
  constructor(
    private form: HTMLFormElement,
    private typing: HTMLElement,
  ) {
    Object.assign(this.leave, { type: "button", tabIndex: -1, ariaLabel: "Back" });
    this.leave.addEventListener("click", () => this.back());
    form.append(this.leave);
    form.addEventListener("keydown", (event) => this.key(event));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.act((event.submitter as HTMLElement | null)?.dataset.id ?? "");
    });
  }

  get open(): boolean {
    return this.steps.length > 0;
  }

  /** The step on screen, as the function that was given for it. */
  get top(): (() => Step) | undefined {
    return this.steps.at(-1)?.build;
  }

  /** Go one step in, with the focus on its first control or on the one named. */
  go(build: () => Step, focus = "") {
    const top = this.steps.at(-1);
    if (top) top.focus = (document.activeElement as HTMLElement | null)?.dataset.id ?? "";
    this.steps.push({ build, focus: "" });
    this.wanted = focus;
    this.sync();
  }

  /** One step back: to the step before, with the focus where it was, or out of the panel. */
  back() {
    this.steps.pop();
    const top = this.steps.at(-1);
    if (!top) return this.close();
    this.wanted = top.focus;
    this.sync();
  }

  close() {
    this.steps = [];
    this.kept.clear();
    this.sync();
    this.typing.focus();
  }

  /** Give a control of the step on screen the focus, once it is there. */
  focus(id: string) {
    this.wanted = id;
  }

  /** What is typed in a field. */
  value(id: string): string {
    return this.controls.get(id)?.value ?? this.kept.get(id) ?? "";
  }

  clear(id: string) {
    this.kept.delete(id);
    const field = this.controls.get(id);
    if (field) field.value = "";
  }

  /** A press on the game at a point of the frame: outside the words, it goes one step back. */
  press(x: number, y: number) {
    const { x: left, y: top, w, h } = this.box;
    if (x < left - 14 || x >= left + w + 12 || y < top - 10 || y >= top + h + 10) this.back();
  }

  private act(id: string) {
    const part = this.parts.get(id);
    if (part?.kind !== "press" || this.step.busy) return;
    part.press?.();
    this.sync();
  }

  /** Ask the step what it holds now, and make the controls on the page match. */
  private sync() {
    const top = this.steps.at(-1);
    this.form.hidden = !top;
    this.step = top?.build() ?? { title: "", rows: [] };
    const parts = this.step.rows.flat().filter(isControl);
    this.parts = new Map(parts.map((part) => [part.id, part]));
    for (const [id, control] of this.controls) {
      const part = this.parts.get(id);
      if (part && kindOf(part) === control.dataset.kind) continue;
      if (control.dataset.kind === "field" && top) this.kept.set(id, control.value);
      control.remove();
      this.controls.delete(id);
    }
    let before: Element = this.leave;
    for (const part of parts) {
      const control = this.controls.get(part.id) ?? this.make(part);
      control.ariaLabel = part.kind === "press" ? (part.says ?? part.label) : part.label;
      if (part.kind === "slider" && Number(control.value) !== part.value) control.value = String(part.value);
      if (part.kind === "field" && control instanceof HTMLInputElement) control.autocomplete = part.autocomplete as AutoFill;
      // The controls stand in the page in reading order. One that is already in place is left alone: moving it would cost it the focus.
      if (control.previousElementSibling !== before) before.after(control);
      before = control;
    }
    const wanted = this.controls.get(this.wanted);
    this.wanted = "";
    const active = document.activeElement;
    if (wanted) wanted.focus();
    else if (top && (active?.parentElement !== this.form || active === this.leave)) this.controls.get(parts[0]?.id ?? "")?.focus();
  }

  private make(part: Control) {
    const id = part.id;
    const kind = kindOf(part);
    const control = document.createElement(kind === "press" || kind === "submit" ? "button" : "input");
    control.dataset.id = id;
    control.dataset.kind = kind;
    if (control instanceof HTMLButtonElement) {
      control.type = kind === "submit" ? "submit" : "button";
      // A tap does not give a button the focus on every phone; the mark should follow the finger.
      control.addEventListener("click", () => {
        control.focus();
        if (kind === "press") this.act(id);
      });
    } else if (part.kind === "press") {
      Object.assign(control, { type: "file", accept: ".json,application/json" });
      control.addEventListener("change", () => {
        const file = control.files?.[0];
        control.value = ""; // so that the same file can be chosen again once it is mended
        const now = this.parts.get(id);
        if (file && now?.kind === "press") now.file?.(file);
        this.sync();
      });
    } else if (part.kind === "slider") {
      Object.assign(control, { type: "range", min: "0", max: "1", step: String(1 / STEPS) });
      control.addEventListener("input", () => {
        const now = this.parts.get(id);
        if (now?.kind === "slider") now.set(Number(control.value));
      });
    } else {
      Object.assign(control, { type: part.password ? "password" : "text", maxLength: part.max, autocapitalize: "off", spellcheck: false });
      control.value = this.kept.get(id) ?? "";
      this.kept.delete(id);
    }
    // Moving the pointer over a control gives it the focus. A pointer that only rests there does not take it back from the keys.
    (control as HTMLElement).addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse" && (event.movementX || event.movementY) && document.activeElement !== control) control.focus();
    });
    control.addEventListener("blur", () => {
      const now = this.parts.get(id);
      if (now?.kind === "press") now.left?.();
    });
    this.controls.set(id, control);
    return control;
  }

  private key(event: KeyboardEvent) {
    // While a keyboard is still composing a letter (as for Japanese or Chinese), its keys are its own.
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      return this.back();
    }
    const here = this.placed.find((spot) => isControl(spot.part) && this.controls.get(spot.part.id) === document.activeElement);
    if (!here) return;
    const go = (way: Move) => {
      event.preventDefault();
      const to = move(this.placed, here, way)?.part;
      if (to && isControl(to)) this.controls.get(to.id)?.focus();
    };
    if (event.key === "Tab") go(event.shiftKey ? "previous" : "next");
    else if (event.key === "ArrowUp") go("up");
    else if (event.key === "ArrowDown") go("down");
    else if (here.part.kind === "press" && event.key === "ArrowLeft") go("left");
    else if (here.part.kind === "press" && event.key === "ArrowRight") go("right");
    else if (here.part.kind === "field" && event.key === "Enter") {
      // Enter in a field goes on to the next field, or after the last one presses what follows.
      event.preventDefault();
      const after = this.placed.slice(this.placed.indexOf(here) + 1).map((spot) => spot.part).filter(isControl);
      const next = after[0]?.kind === "field" ? after[0] : after.find((part) => part.kind === "press");
      const control = next && this.controls.get(next.id);
      if (next?.kind === "field") control?.focus();
      else control?.click();
    }
  }

  /** Draw the step on screen and lay each control over its drawing. `scale` is how many screen pixels a pixel of the frame takes. */
  draw(frame: Frame, scene: Scene, scale: number, time: number, dive: boolean) {
    scene.hush = null;
    if (!this.open) return;
    this.sync();
    const { tiny } = FONTS;
    const { width: W, height: H } = frame;
    // On a wide screen the words take the column to the right of the diver, on a narrow one the room below.
    const wide = W >= 300;
    const left = wide ? 170 : 10;
    const width = W - left - (wide ? 8 : 10);
    const bottom = H - (dive ? 28 : 8);
    // A line is tall enough for a fingertip (40 screen pixels) wherever the step then still fits the screen.
    let laid = lay(this.step, width, Math.max(LINE, Math.ceil(40 / scale)));
    if (laid.height > bottom - 8) laid = lay(this.step, width, LINE);
    const under = dive ? scene.hudBottom + 8 : 0;
    const wish = wide ? Math.max(dive ? 50 : scene.base - 4, under) : Math.max(scene.base + 38, under);
    const top = Math.max(8, Math.min(wish, bottom - laid.height));
    this.placed = laid.placed;
    this.box = { x: left, y: top, w: width, h: laid.height };
    if (!wide) scene.hush = [top - 12, top + laid.height + 8];

    // The water behind the words goes two shades darker, with a soft edge.
    const x0 = wide ? left - 12 : -99;
    const y0 = top - 10;
    const y1 = top + laid.height + 10;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = Math.max(0, x0); x < W; x++) {
        const depth = Math.min(x - x0, y - y0, y1 - 1 - y);
        if (depth < 10 && !dither(x, y, (depth + 1) / 11)) continue;
        const color = frame.color[y * W + x]!;
        if (color >= 2 && color <= 5) frame.color[y * W + x] = Math.max(1, color - 2);
      }
    }

    const say = (text: string, x: number, y: number, color: number) => {
      const end = drawText(frame, tiny, text, x, y, color);
      scene.cover(x, end, y, y + 6);
      return end;
    };
    const cover = (control: HTMLElement, x: number, y: number, w: number, h: number) =>
      Object.assign(control.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${w * scale}px`, height: `${h * scale}px` });
    const blink = Math.floor(time * 2.5) % 2 === 0;

    say("‹", left + 1, top + 1, 6);
    cover(this.leave, left - 3, top - 3, say(plain(this.step.title), left + INDENT, top + 1, 6) - left + 8, 13);

    for (const { part, x, y, w, h, lines } of laid.placed) {
      const px = left + x;
      const py = top + y;
      const tx = px + INDENT;
      const ty = py + ((h - 5) >> 1);
      const control = isControl(part) ? this.controls.get(part.id) : undefined;
      const on = control !== undefined && control === document.activeElement;
      // While the panel waits for an answer, the mark blinks.
      const mark = (at: number) => on && (!this.step.busy || blink) && drawMark(frame, px + 1, at);
      const lit = (text: string, color: number) => {
        frame.emit = on ? 70 : 0;
        say(text, tx, ty, on ? 16 : color);
        frame.emit = 0;
      };
      if (part.kind === "press") {
        let label = plain(part.label);
        while (label.length > 1 && measure(tiny, label) > w - INDENT) label = label.slice(0, -1);
        mark(ty);
        if (part.danger) say(label, tx, ty, 18);
        else lit(label, part.quiet ? 6 : 7);
        cover(control!, px, py, w, h);
      } else if (part.kind === "field") {
        const value = plain(control!.value);
        const caret = (control as HTMLInputElement).selectionStart ?? value.length;
        const typed = py + h - 11;
        const room = w - INDENT;
        let at = tx;
        mark(typed);
        say(part.label, tx, py + 2, on ? 7 : 6);
        if (part.dots) {
          // A password or a key is a row of dots, as many as fit.
          const dots = Math.min(value.length, Math.floor(room / 4));
          for (let i = 0; i < dots; i++) for (let j = 0; j < 4; j++) frame.put(tx + i * 4 + (j & 1), typed + 2 + (j >> 1), 7);
          at += Math.min(caret, dots) * 4;
        } else {
          // Of typing too long for the line, the end is shown: the part being typed.
          let cut = 0;
          while (measure(tiny, value.slice(cut)) > room - 2) cut++;
          say(value.slice(cut), tx, typed, 7);
          if (caret > cut) at += measure(tiny, value.slice(cut, caret)) + 1;
        }
        frame.emit = on ? 120 : 0;
        for (let i = tx; i < px + w; i++) frame.put(i, typed + 7, on ? 15 : 4);
        frame.emit = 200;
        if (on && blink) for (let j = -1; j < 6; j++) frame.put(at, typed + j, 16);
        frame.emit = 0;
        cover(control!, px, py, w, h);
      } else if (part.kind === "slider") {
        const track = px + w - TRACK;
        const tall = h > LINE ? 5 : 3;
        mark(ty);
        lit(part.label, 7);
        for (let i = 0; i < STEPS; i++) {
          const full = i < Math.round(part.value * STEPS);
          frame.emit = on && full ? 150 : 0;
          for (let j = 0; j < tall * 2; j++) frame.put(track + i * 3 + (j & 1), py + ((h - tall) >> 1) + (j >> 1), full ? (on ? 15 : 6) : 4);
        }
        frame.emit = 0;
        cover(control!, track, py, TRACK - 1, h);
      } else if (part.kind === "note" || part.kind === "wait") {
        const gap = pitch(tiny, plain(part.text), 8);
        lines.forEach((line, i) => say(line, tx, py + 1 + i * gap, part.kind === "wait" ? 7 : part.bad ? 18 : 6));
        if (part.kind === "note") continue;
        // One pip for each piece of the work that is done, and the next one blinks.
        const pips = py + lines.length * gap + 5;
        for (let i = 0; i < part.of; i++) {
          const color = i < part.done ? 10 : i === part.done && blink ? 9 : 4;
          frame.emit = color === 4 ? 0 : 150;
          for (let j = 0; j < 12; j++) frame.put(tx + i * 6 + (j & 3), pips + (j >> 2), color);
        }
        frame.emit = 0;
        say(`prompt ${Math.min(part.of, part.done + 1)} of ${part.of}`, tx + part.of * 6 + 4, pips - 1, 6);
      }
    }
  }
}
