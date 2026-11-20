import { FONTS, drawText, measure, pitch, plain, wrap } from "./font";
import { dither, type Frame } from "./frame";
import { t } from "../language";
import type { Scene } from "./scene";

// The parts every panel is built from and the one way of controlling them: see docs/UI.md.

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
  right?: boolean;
  /** Called when the focus leaves it. */
  left?: () => void;
  /** A setting it stands for, shown at the right of the line; `on`, if given, puts a pip before it. */
  value?: string;
  on?: boolean;
  /** Left and Right change the setting, as on a slider. */
  shift?: (way: -1 | 1) => void;
};
export type Field = { kind: "field"; id: string; label: string; max: number; dots?: boolean; password?: boolean; autocomplete: string; start?: string };
/**
 * A level from 0 to 1 in `steps` steps (20 if not given). With `colors` it is a choice among
 * them, one pip of each colour; otherwise a track of pips, with `text` at its right if given.
 */
export type Slider = { kind: "slider"; id: string; label: string; value: number; set: (value: number) => void; steps?: number; colors?: number[]; text?: string };
export type Note = { kind: "note"; text: string; bad?: boolean };
export type Wait = { kind: "wait"; text: string; done: number; of: number };
/** One of the people in a room. Only read, unless it has `press`: the host's way to the step of another player. */
export type Player = { kind: "player"; name: string; color: number; note: string; host?: boolean; id?: string; press?: () => void; says?: string };
export type Part = Press | Field | Slider | Note | Wait | Player | { kind: "gap" };
type Control = Press | Field | Slider | (Player & { id: string; press: () => void });
/**
 * While `busy`, presses wait. `back` replaces going one step back when the player asks to (by
 * Escape, Left, the `‹` or a press outside; `head` when it was on the `‹`), and `escape` replaces it on Escape alone. `code`
 * follows the name in pale letters: a room's code, which has to be read out, and which a press copies.
 * `foot` comes after the rows; when the step is too long for its room it stays at the bottom and only the rows scroll.
 * With `sure`, the name asks "Sure?" in its place, and `sure` is called when the focus leaves it.
 */
export type Step = {
  title: string;
  code?: { text: string; copy: () => void };
  rows: (Part | Part[])[];
  foot?: (Part | Part[])[];
  busy?: boolean;
  back?: (head: boolean) => void;
  escape?: () => void;
  sure?: () => void;
};

/** Where a part is, from the top left of its step. */
export type Placed = { part: Part; row: number; x: number; y: number; w: number; h: number; lines: string[] };
export type Move = "up" | "down" | "left" | "right" | "next" | "previous";

/** The height of a line on a large screen. */
const LINE = 12;
const HEAD = 14;
/** Rows scrolled above this line of a step are hidden: the step's name stays. */
const INSET = 12;
/** A step climbs over the diver only to keep this much room on a screen too short for it. */
const ROOM = 64;
/** Room before the words of a line for the mark of the focus. */
const INDENT = 7;
const STEPS = 20;
const MARK = ["a..", "aa.", "aaa", "aa.", "a.."];
const CROWN = [".....", "..x..", "x.x.x", "xxxxx", "xxxxx"];

const isControl = (part: Part): part is Control =>
  part.kind === "press" || part.kind === "field" || part.kind === "slider" || (part.kind === "player" && !!part.id && !!part.press);
const kindOf = (part: Control) => (part.kind === "press" ? (part.file ? "file" : part.submit ? "submit" : "press") : part.kind === "player" ? "press" : part.kind);
const natural = (part: Part) => INDENT + (part.kind === "press" ? measure(FONTS.tiny, plain(part.label)) : 0) + 2;

export function drawMark(frame: Frame, x: number, y: number) {
  frame.emit = 220;
  frame.sprite(MARK, x, y);
  frame.emit = 0;
}

/** The mark of a room's host, beside their name. */
export function drawCrown(frame: Frame, x: number, y: number, color: number) {
  CROWN.forEach((row, j) => [...row].forEach((char, i) => char === "x" && frame.put(x + i, y + j, color)));
}

/**
 * `kept` holds, by the control the words follow, the most room the words after each control
 * have taken while the step is open: what is said there and then goes keeps its room, so the
 * lines after it do not jump back and forth.
 */
export function lay(step: Step, width: number, line: number, kept?: Map<string, number>): { placed: Placed[]; height: number } {
  const placed: Placed[] = [];
  let y = HEAD + ((line - LINE) >> 1);
  let after = "";
  let said = 0;
  const keep = () => {
    if (!kept) return;
    const room = Math.max(kept.get(after) ?? 0, said);
    kept.set(after, room);
    y += room - said;
    said = 0;
  };
  step.rows.forEach((row, index) => {
    const parts = Array.isArray(row) ? row : [row];
    const words = parts.every((part) => part.kind === "note");
    if (!words) keep();
    let x = 0;
    let tall = 0;
    parts.forEach((part, i) => {
      let lines: string[] = [];
      let h = line;
      if (part.kind === "gap") h = 8;
      else if (part.kind === "player") h = part.press ? line : 9;
      else if (part.kind === "field") h = line + 10;
      else if (part.kind === "note" || part.kind === "wait") {
        const text = plain(part.text);
        lines = wrap(FONTS.tiny, text, width - INDENT);
        h = lines.length * pitch(FONTS.tiny, text, 8) + (part.kind === "wait" ? 16 : 3);
      }
      let w = width - x;
      if (parts.length > 1) {
        const next = parts[i + 1];
        // The parts set against the right edge stand side by side there, in their order.
        const after = (from: number) => parts.slice(from).reduce((sum, one) => sum + natural(one) + 8, -8);
        w = natural(part);
        if (part.kind === "press" && part.right) x = width - after(i);
        else if (next?.kind === "press" && next.right) w = width - after(i + 1) - 4 - x;
      }
      placed.push({ part, row: index, x, y, w, h, lines });
      x += w + 8;
      tall = Math.max(tall, h);
    });
    y += tall;
    if (words) said += tall;
    else after = parts.find(isControl)?.id ?? after;
  });
  keep();
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
 * Where the top of a step stands, between `ceiling` and `bottom`, and how far it is scrolled.
 * `held` is where the step stood last frame and how far the line in focus has moved down in it
 * since: the step moves, or else scrolls, so that the line stays where it was.
 */
export function view(height: number, wish: number, ceiling: number, bottom: number, scroll: number, held?: { top: number; by: number }) {
  const top = Math.max(ceiling, Math.min(held ? held.top - held.by : wish, bottom - height));
  const most = Math.max(0, height - (bottom - top));
  return { top, scroll: Math.max(0, Math.min(most, scroll + (held ? top - held.top + held.by : 0))) };
}

/**
 * Whatever panel is open. A panel is a stack of steps, each a function that says what the
 * step holds right now; it is asked again every frame, so a panel only keeps its own state.
 * Every control is a real but invisible HTML control laid over its drawing, so the focus on
 * screen is the browser's own, and passwords, phone keyboards and screen readers work.
 */
export class Ui {
  private steps: { build: () => Step; focus: string; kept: Map<string, number>; footKept: Map<string, number> }[] = [];
  private step: Step = { title: "", rows: [] };
  private parts = new Map<string, Control>();
  private controls = new Map<string, HTMLInputElement | HTMLButtonElement>();
  /** What was typed in the fields of steps that are not on screen, until the panel closes. */
  private kept = new Map<string, string>();
  private placed: Placed[] = [];
  private box = { x: 0, y: 0, w: 0, h: 0 };
  /** Where the step on screen was last drawn: its top, and where each of its controls stood in it. */
  private held: { step: object; left: number; bottom: number; top: number; at: Map<string, number> } | null = null;
  /** The control to give the focus as soon as it exists. */
  private wanted = "";
  /** The step's name, which goes back, and the code after it, which copies it. */
  private leave = document.createElement("button");
  private copier = document.createElement("button");
  /** The form is the box a long step scrolls in; this gives it the step's height. */
  private sizer = document.createElement("div");
  /** The control the pointer gave the focus to, which is not scrolled to: it is under the pointer already. */
  private pointed: Element | null = null;
  /** The control that had the focus when the step was last drawn. */
  private seen = "";

  /** `takeKeys` hands the keys back to the game when the panel closes. */
  constructor(
    private form: HTMLFormElement,
    private takeKeys: () => void,
  ) {
    Object.assign(this.leave, { type: "button", tabIndex: -1 });
    Object.assign(this.copier, { type: "button", tabIndex: -1 });
    // The step's name and code stand above the box that scrolls.
    this.leave.style.position = this.copier.style.position = "fixed";
    this.sizer.className = "sizer";
    // A press on the form between its lines would take the focus from the line that has it.
    form.addEventListener("mousedown", (event) => event.target === form && event.preventDefault());
    this.leave.addEventListener("click", () => {
      this.retreat(true);
      this.sync();
      if (this.step.sure) return void this.leave.focus({ preventScroll: true });
      // The focus goes to the step it leads back to, not to the name of that step.
      if (document.activeElement !== this.leave) return;
      this.leave.blur();
      this.sync();
    });
    this.leave.addEventListener("blur", () => this.step.sure?.());
    this.copier.addEventListener("click", () => {
      this.copier.focus({ preventScroll: true });
      this.step.code?.copy();
      this.sync();
    });
    for (const control of [this.leave, this.copier]) this.hover(control);
    form.append(this.sizer, this.leave, this.copier);
    form.addEventListener("keydown", (event) => this.key(event));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.act((event.submitter as HTMLElement | null)?.dataset.id ?? "");
    });
  }

  get open(): boolean {
    return this.steps.length > 0;
  }

  get top(): (() => Step) | undefined {
    return this.steps.at(-1)?.build;
  }

  holds(build: () => Step): boolean {
    return this.steps.some((step) => step.build === build);
  }

  go(build: () => Step, focus = "") {
    const top = this.steps.at(-1);
    if (top) top.focus = (document.activeElement as HTMLElement | null)?.dataset.id ?? "";
    this.steps.push({ build, focus: "", kept: new Map(), footKept: new Map() });
    this.wanted = focus;
    this.sync();
  }

  /** The player asks to go one step back. */
  private retreat(head = false) {
    if (this.step.back) this.step.back(head);
    else this.back();
  }

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
    this.takeKeys();
  }

  focus(id: string) {
    this.wanted = id;
  }

  value(id: string): string {
    return this.controls.get(id)?.value ?? this.kept.get(id) ?? "";
  }

  clear(id: string) {
    this.kept.delete(id);
    const field = this.controls.get(id);
    if (field) field.value = "";
  }

  /** A press outside the panel's words goes one step back. */
  press(x: number, y: number) {
    const { x: left, y: top, w, h } = this.box;
    if (x < left - 14 || x >= left + w + 12 || y < top - 10 || y >= top + h + 10) this.retreat();
  }

  private act(id: string) {
    const part = this.parts.get(id);
    if ((part?.kind !== "press" && part?.kind !== "player") || this.step.busy) return;
    part.press?.();
    this.sync();
  }

  /** Ask the step what it holds now, and make the controls on the page match. */
  private sync() {
    const top = this.steps.at(-1);
    this.form.hidden = !top;
    this.step = top?.build() ?? { title: "", rows: [] };
    const parts = [...this.step.rows, ...(this.step.foot ?? [])].flat().filter(isControl);
    this.parts = new Map(parts.map((part) => [part.id, part]));
    this.copier.hidden = !this.step.code;
    this.leave.ariaLabel = this.step.sure ? t().packs.sure : t().page.back;
    this.copier.ariaLabel = t().page.copyLink(this.step.code?.text ?? "");
    for (const [id, control] of this.controls) {
      const part = this.parts.get(id);
      if (part && kindOf(part) === control.dataset.kind) continue;
      if (control.dataset.kind === "field" && top) this.kept.set(id, control.value);
      control.remove();
      this.controls.delete(id);
    }
    let before: Element = this.copier;
    for (const part of parts) {
      const control = this.controls.get(part.id) ?? this.make(part);
      control.ariaLabel = part.kind === "press" ? (part.says ?? part.label) : part.kind === "player" ? (part.says ?? part.name) : part.label;
      if (part.kind === "slider" && Number(control.value) !== part.value) control.value = String(part.value);
      if (part.kind === "field" && control instanceof HTMLInputElement) control.autocomplete = part.autocomplete as AutoFill;
      // The controls stand in the page in reading order. One that is already in place is left alone: moving it would cost it the focus.
      if (control.previousElementSibling !== before) before.after(control);
      before = control;
    }
    const wanted = this.controls.get(this.wanted);
    this.wanted = "";
    const active = document.activeElement;
    if (wanted) wanted.focus({ preventScroll: true });
    else if (top && active?.parentElement !== this.form) this.controls.get(parts[0]?.id ?? "")?.focus({ preventScroll: true });
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
        control.focus({ preventScroll: true });
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
      Object.assign(control, { type: "range", min: "0", max: "1", step: String(1 / (part.steps ?? STEPS)) });
      control.addEventListener("input", () => {
        const now = this.parts.get(id);
        if (now?.kind === "slider") now.set(Number(control.value));
      });
    } else if (part.kind === "field") {
      Object.assign(control, { type: part.password ? "password" : "text", maxLength: part.max, autocapitalize: "off", spellcheck: false });
      control.value = this.kept.get(id) ?? part.start ?? "";
      this.kept.delete(id);
    }
    // A field takes the focus only when it is clicked (or reached by the keys): typing must be asked for (owner, after play).
    if (kind !== "field") this.hover(control);
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
      // A key that is held down acts once: the second Escape of a pair must be meant.
      if (event.repeat) return;
      return this.step.escape ? this.step.escape() : this.retreat();
    }
    const head = [this.leave, this.copier].indexOf(document.activeElement as HTMLButtonElement);
    if (head >= 0) return this.headKey(event, head === 1);
    const here = this.placed.find((spot) => isControl(spot.part) && this.controls.get(spot.part.id) === document.activeElement);
    if (!here) return;
    const go = (way: Move) => {
      event.preventDefault();
      const to = move(this.placed, here, way)?.part;
      if (to && isControl(to)) this.controls.get(to.id)?.focus({ preventScroll: true });
    };
    if (event.key === "Tab") go(event.shiftKey ? "previous" : "next");
    else if (event.key === "ArrowUp") go("up");
    else if (event.key === "ArrowDown") go("down");
    else if (here.part.kind === "press" && here.part.shift && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      if (!this.step.busy) here.part.shift(event.key === "ArrowLeft" ? -1 : 1);
      this.sync();
    }
    else if ((here.part.kind === "press" || here.part.kind === "player") && event.key === "ArrowLeft") {
      if (move(this.placed, here, "left")) go("left");
      else {
        event.preventDefault();
        this.retreat();
      }
    }
    else if ((here.part.kind === "press" || here.part.kind === "player") && event.key === "ArrowRight") go("right");
    else if (here.part.kind === "field" && event.key === "Enter") {
      // Enter in a field goes on to the next field, or after the last one presses what follows.
      event.preventDefault();
      const after = this.placed.slice(this.placed.indexOf(here) + 1).map((spot) => spot.part).filter(isControl);
      const next = after[0]?.kind === "field" ? after[0] : after.find((part) => part.kind === "press");
      const control = next && this.controls.get(next.id);
      if (next?.kind === "field") control?.focus({ preventScroll: true });
      else control?.click();
    }
  }

  /** Enter needs no handling here: the name and the code are buttons. */
  private headKey(event: KeyboardEvent, code: boolean) {
    const controls = this.placed.map((spot) => spot.part).filter(isControl);
    const to =
      event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey) ? this.controls.get(controls[0]?.id ?? "")
      : event.key === "ArrowUp" || event.key === "Tab" ? this.controls.get(controls.at(-1)?.id ?? "")
      : event.key === "ArrowRight" && !code && this.step.code ? this.copier
      : event.key === "ArrowLeft" && code ? this.leave
      : undefined;
    if (to) {
      event.preventDefault();
      to.focus({ preventScroll: true });
    } else if (event.key === "ArrowLeft" && !code) {
      event.preventDefault();
      this.retreat(true);
    }
  }

  /** `scale` is how many screen pixels a pixel of the frame takes. */
  draw(frame: Frame, scene: Scene, scale: number, time: number, dive: boolean) {
    scene.hush = null;
    if (!this.open) return;
    this.sync();
    const { tiny } = FONTS;
    const { width: W, height: H } = frame;
    // On a wide screen the words take the column to the right of the diver (of the divers of a room), on a narrow one the room below.
    const wide = W >= 300;
    const left = wide ? (scene.crew ? 184 : 170) : 10;
    const width = W - left - (wide ? 8 : 10);
    const bottom = H - (dive ? 28 : 8);
    const step = this.steps.at(-1)!;
    const under = dive ? scene.hudBottom + 8 : 0;
    const wish = wide ? Math.max(dive ? 50 : scene.base - 4, under) : Math.max(scene.base + 38, under);
    const ceiling = Math.max(8, Math.min(wish, bottom - ROOM));
    // A line is tall enough for a fingertip (40 screen pixels), unless smaller lines spare the step from scrolling.
    const whole = { ...this.step, rows: [...this.step.rows, ...(this.step.foot ?? [])] };
    let line = Math.max(LINE, Math.ceil(40 / scale));
    let laid = lay(whole, width, line, step.kept);
    const small = laid.height > bottom - ceiling ? lay(whole, width, LINE, step.kept) : null;
    if (small && small.height <= bottom - ceiling) [laid, line] = [small, LINE];
    // A step that still has to scroll keeps its foot at the bottom, unless that would leave the rows above it too little room.
    let foot: Placed[] = [];
    let footHeight = 0;
    if (this.step.foot?.length && laid.height > bottom - ceiling) {
      const under = lay({ title: "", rows: this.step.foot }, width, line, step.footKept);
      if (bottom - ceiling - INSET - (under.height - HEAD) >= 2 * line) {
        laid = lay(this.step, width, line, step.kept);
        foot = under.placed.map((spot) => ({ ...spot, row: spot.row + this.step.rows.length }));
        footHeight = under.height - HEAD;
      }
    }
    // While a step is open the line in focus stays where it is when the step changes, so that what the pointer is
    // over does not move away from it: the step moves within its room, or else scrolls.
    const held = this.held?.step === step && this.held.left === left && this.held.bottom === bottom ? this.held : null;
    const active = document.activeElement;
    const id = (active as HTMLElement | null)?.dataset.id ?? "";
    const focused = laid.placed.find((spot) => isControl(spot.part) && spot.part.id === id);
    const was = held?.at.get(id);
    const by = focused && was !== undefined ? focused.y - was : 0;
    const where = view(laid.height + footHeight, wish, ceiling, bottom, held ? this.form.scrollTop / scale : 0, held ? { top: held.top, by } : undefined);
    const top = where.top;
    let scroll = where.scroll;
    const shown = Math.min(laid.height + footHeight, bottom - top);
    /** Where the rows that scroll end, and the foot begins. */
    const fold = top + shown - footHeight;
    // A line given the focus by the keys is brought into view; one the pointer gave it to is in view already.
    if (focused && (id !== this.seen || !held)) {
      if (active !== this.pointed) scroll = Math.max(focused.y + focused.h - (fold - top), Math.min(scroll, focused.y - INSET));
      this.pointed = null;
    }
    this.seen = id;
    this.held = { step, left, bottom, top, at: new Map(laid.placed.flatMap((spot) => (isControl(spot.part) ? [[spot.part.id, spot.y]] : []))) };
    this.placed = [...laid.placed, ...foot];
    this.box = { x: left, y: top, w: width, h: shown };
    if (!wide) scene.hush = [top - 12, top + shown + 8];

    // The form is laid over the rows of the step and scrolls them: the wheel, a finger and a screen reader move it.
    const from = wide ? left - 12 : 0;
    Object.assign(this.form.style, { left: `${from * scale}px`, top: `${(top + INSET) * scale}px`, width: `${(W - from) * scale}px`, height: `${(fold - top - INSET) * scale}px` });
    this.sizer.style.height = `${(laid.height - INSET) * scale}px`;
    if (scroll !== this.form.scrollTop / scale) this.form.scrollTop = scroll * scale;
    const shift = Math.round(scroll);

    // The water behind the words goes two shades darker, with a soft edge.
    const x0 = wide ? left - 12 : -99;
    const y0 = top - 10;
    const y1 = top + shown + 10;
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
      if (y + 6 >= frame.clipTop && y < frame.clipBottom) scene.cover(x, end, y, y + 6);
      return end;
    };
    const cover = (control: HTMLElement, x: number, y: number, w: number, h: number) =>
      Object.assign(control.style, { left: `${x * scale}px`, top: `${y * scale}px`, width: `${w * scale}px`, height: `${h * scale}px` });
    const blink = Math.floor(time * 2.5) % 2 === 0;

    const back = this.leave === document.activeElement;
    const head = this.step.sure ? 18 : back ? 16 : 6;
    frame.emit = back && !this.step.sure ? 70 : 0;
    say("‹", left + 1, top + 1, head);
    const named = say(plain(this.step.sure ? t().packs.sure : this.step.title), left + INDENT, top + 1, head);
    cover(this.leave, left - 3, top - 3, named - left + 5, 13);
    if (this.step.code) {
      const copying = this.copier === document.activeElement;
      frame.emit = copying ? 70 : 0;
      const end = say(this.step.code.text, named + 3, top + 1, copying ? 16 : 7);
      cover(this.copier, named + 2, top - 3, end - named + 3, 13);
    }
    frame.emit = 0;

    const spots = [...laid.placed.map((spot) => ({ ...spot, py: top + spot.y - shift, pinned: false })), ...foot.map((spot) => ({ ...spot, py: fold + spot.y - HEAD, pinned: true }))];
    for (const { part, x, y, w, h, lines, py, pinned } of spots) {
      frame.clipTop = pinned ? fold : top + INSET;
      frame.clipBottom = pinned ? bottom : fold;
      // The controls of the rows scroll with the form; those of a foot that stays are fixed where they are drawn.
      const place = (control: HTMLElement, x: number, w: number) => {
        control.style.position = pinned ? "fixed" : "";
        if (pinned) cover(control, x, py, w, h);
        else cover(control, x - from, y - INSET, w, h);
      };
      const px = left + x;
      const tx = px + INDENT;
      const ty = py + ((h - 5) >> 1);
      const control = isControl(part) ? this.controls.get(part.id) : undefined;
      const on = control !== undefined && control === document.activeElement;
      const mark = (at: number) => on && (!this.step.busy || blink) && drawMark(frame, px + 1, at);
      const lit = (text: string, color: number) => {
        frame.emit = on ? 70 : 0;
        say(text, tx, ty, on ? 16 : color);
        frame.emit = 0;
      };
      if (part.kind === "press") {
        const value = plain(part.value ?? "");
        // The setting stands against the right edge, after its pip.
        const room = value ? measure(tiny, value) + (part.on === undefined ? 0 : 5) + 8 : 0;
        let label = plain(part.label);
        while (label.length > 1 && measure(tiny, label) > w - INDENT - room) label = label.slice(0, -1);
        mark(ty);
        if (part.danger) say(label, tx, ty, 18);
        else lit(label, part.quiet ? 6 : 7);
        if (value) {
          const end = px + w;
          const from = end - measure(tiny, value);
          const pale = part.on !== false && !part.quiet;
          frame.emit = on && pale ? 70 : 0;
          say(value, from, ty, pale ? (on ? 16 : 7) : 6);
          if (part.on !== undefined) {
            frame.emit = on && part.on ? 150 : 0;
            for (let j = 0; j < 6; j++) frame.put(from - 5 + (j & 1), ty + 1 + (j >> 1), part.on ? (on ? 15 : 6) : 4);
          }
          frame.emit = 0;
        }
        place(control!, px, w);
      } else if (part.kind === "field") {
        const value = plain(control!.value);
        const caret = (control as HTMLInputElement).selectionStart ?? value.length;
        const typed = py + h - 11;
        const room = w - INDENT;
        let at = tx;
        mark(typed);
        say(part.label, tx, py + 2, on ? 7 : 6);
        if (part.dots) {
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
        place(control!, px, w);
      } else if (part.kind === "slider") {
        const steps = part.steps ?? STEPS;
        const chosen = Math.round(part.value * steps);
        mark(ty);
        lit(part.label, 7);
        if (part.colors) {
          // One pip of each colour; the chosen one stands in a frame, amber while the row has the focus.
          const track = px + w - part.colors.length * 9 + 2;
          part.colors.forEach((color, i) => {
            const x = track + i * 9;
            for (let j = 0; j < 25; j++) frame.put(x + (j % 5), ty + Math.floor(j / 5), color);
            if (i !== chosen) return;
            frame.emit = on ? 150 : 0;
            for (let k = -2; k < 7; k++) for (const j of [-2, 6]) frame.put(x + k, ty + j, on ? 15 : 7), frame.put(x + j, ty + k, on ? 15 : 7);
            frame.emit = 0;
          });
          place(control!, track - 2, part.colors.length * 9);
          continue;
        }
        const text = plain(part.text ?? "");
        let end = px + w;
        if (text) {
          frame.emit = on ? 70 : 0;
          say(text, end - measure(tiny, text), ty, on ? 16 : 7);
          frame.emit = 0;
          end -= measure(tiny, text) + 5;
        }
        const track = end - steps * 3;
        const tall = h > LINE ? 5 : 3;
        for (let i = 0; i < steps; i++) {
          const full = i < chosen;
          frame.emit = on && full ? 150 : 0;
          for (let j = 0; j < tall * 2; j++) frame.put(track + i * 3 + (j & 1), py + ((h - tall) >> 1) + (j >> 1), full ? (on ? 15 : 6) : 4);
        }
        frame.emit = 0;
        place(control!, track, end - track - 1);
      } else if (part.kind === "player") {
        mark(ty);
        for (let j = 0; j < 15; j++) frame.put(tx + (j % 3), ty + Math.floor(j / 3), part.color);
        frame.emit = on ? 70 : 0;
        let end = say(plain(part.name), tx + 6, ty, on ? 16 : 7) + 4;
        frame.emit = 0;
        if (part.host) {
          drawCrown(frame, end, ty, 6);
          if (ty + 6 >= frame.clipTop && ty < frame.clipBottom) scene.cover(end, end + 5, ty, ty + 6);
          end += 9;
        }
        say(plain(part.note), end, ty, 6);
        if (control) place(control, px, w);
      } else if (part.kind === "note" || part.kind === "wait") {
        const gap = pitch(tiny, plain(part.text), 8);
        lines.forEach((line, i) => say(line, tx, py + 1 + i * gap, part.kind === "wait" ? 7 : part.bad ? 18 : 6));
        if (part.kind === "note") continue;
        // One pip for each piece of the work that is done, and the next one blinks. Past 10 pieces a pip stands for a tenth of the work.
        const pips = py + lines.length * gap + 5;
        const count = Math.min(part.of, 10);
        const done = Math.floor((part.done * count) / part.of);
        for (let i = 0; i < count; i++) {
          const color = i < done ? 10 : i === done && blink ? 9 : 4;
          frame.emit = color === 4 ? 0 : 150;
          for (let j = 0; j < 12; j++) frame.put(tx + i * 6 + (j & 3), pips + (j >> 2), color);
        }
        frame.emit = 0;
        say(t().packs.progress(Math.min(part.of, part.done + 1), part.of), tx + count * 6 + 4, pips - 1, 6);
      }
    }
    // A step too long for its room has a bar at the right edge that shows how far it is scrolled.
    if (laid.height > fold - top) {
      const room = fold - top - INSET;
      const thumb = Math.max(4, Math.round((room * room) / (laid.height - INSET)));
      const at = top + INSET + Math.round(((room - thumb) * scroll) / (laid.height - (fold - top)));
      for (let y = top + INSET; y < fold; y++) frame.put(left + width + 3, y, y >= at && y < at + thumb ? 6 : 4);
    }
    frame.clipTop = 0;
    frame.clipBottom = Infinity;
  }

  /** A pointer that only rests over a control does not take the focus back from the keys. */
  private hover(control: HTMLElement) {
    control.addEventListener("pointermove", (event) => {
      if (!(event.pointerType === "mouse" && (event.movementX || event.movementY) && document.activeElement !== control)) return;
      this.pointed = control;
      control.focus({ preventScroll: true });
    });
  }
}
