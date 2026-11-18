import type { Finish, Mode } from "../../shared/room";
import { METERS_PER_POINT } from "../../shared/types";
import { formatMeters, lightOf, zoneAt } from "../depth";
import { t } from "../language";
import { CHAOS_AIR_SECONDS, lostDive, type Game } from "../state";
import { FONTS, drawText, fit, measure, pitch, plain, rise, wrap, type Font } from "./font";
import { dither, hash, type Frame, type Light } from "./frame";
import { FRY, LAMP_DEAD, LAMP_LIT, SUIT_COLORS } from "./scene";
import { drawMark } from "./ui";

export type RoomLog = { mode: Mode; divers: (Finish & { name: string; suit: number })[] };
export type Log = Game | RoomLog;
export const isRoom = (log: Log): log is RoomLog => "divers" in log;

/** `answer` is null when the air ran out first. */
export type Hung = { prompt: string; pack: string | null; answer: string | null; rarity: number };
type Diver = RoomLog["divers"][number];
/** A string of lamps on screen: `count` lamps of one line from its `from`th, hung on a rope at `y`. */
type Row = { line: number; from: number; count: number; y: number; sag: number };
type Spot = { line: number; lamp: number } | "back";

/** How long the sea takes to fade to black once the divers are back at the surface, and each lamp to rise into its row. */
export const FADE_SECONDS = 1;
const RISE_SECONDS = 0.7;
/** When the first lamp starts to rise, and the most time between one lamp and the next. */
const RISE_FROM = 0.35;
const STAGGER = 0.06;
/** A lamp's chain hangs from the rope, and the lamp under it. */
const CHAIN = 4;
const UNDER = [".a.", "aaa"];
/** The small lamps of a room's rows on a wide screen, where six rows of full lamps would not fit. */
const PIP_LIT = [".R.", "aca", "aca", ".R."];
const PIP_DEAD = [".5.", "5.5", "5.5", ".5."];
/** A lit lamp of a chaos dive that sputters, for a moment nearly out. */
const LAMP_SPUTTER = [".rRo.", "rRRRo", ".RoR.", ".ooo.", ".RoR.", "rRRRo"];
/** The bloodshot eyes that watch a chaos dive's end: open, with the pupil to the left, middle or right; and shut. */
const EYE = (look: number) => [".7x7.", ["x0x77", "7x0x7", "77x0x"][look + 1]!, ".777."];
const EYE_SHUT = [".....", ".rrr.", "....."];
/** Where the eyes open, as shares of the screen's width and height: in the dark the words and lamps leave free. */
const EYES_WIDE: [number, number][] = [[0.08, 0.12], [0.84, 0.17], [0.05, 0.62], [0.9, 0.68], [0.18, 0.9], [0.76, 0.92]];
const EYES_NARROW: [number, number][] = [[0.12, 0.05], [0.8, 0.08], [0.06, 0.42], [0.88, 0.46], [0.18, 0.8], [0.76, 0.84]];

const { tiny, medium, large } = FONTS;
const amber = (tall: number) => (row: number) => (row < tall * 0.3 ? 16 : row < tall * 0.8 ? 15 : 14);
const mint = (tall: number) => (row: number) => (row < tall * 0.22 ? 11 : row < tall * 0.8 ? 10 : 9);
const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * The screen that ends a dive: the sea fades to black, and the lamps that were hung rise out of it into a row on a
 * line, each burning as brightly as its answer was rare. The one in focus says what lit it. In a room every diver has
 * a row of their own, the winner's first. Left and Right move along a row, Up and Down between rows and to the line
 * that leads back.
 */
export class Ending {
  /** Every line of lamps: the player's own, or one for each diver of the room in the order they finished. */
  private lines: Hung[][];
  private divers: Diver[] = [];
  focus: Spot;
  /** In a room whose rows are longer than the screen, the first lamp shown. */
  private offset = 0;
  /** Where the lamps and the line back were last drawn, for the pointer. */
  private spots: { spot: Spot; x: number; y: number; w: number; h: number }[] = [];
  /** The span the words take on each row of the frame, which the tape of a chaos dive leaves readable. */
  wordsFrom = new Int16Array(0);
  wordsTo = new Int16Array(0);
  /** Where the focus is on the frame: the tape's faults gather there, and the eyes look at it. */
  point = { x: 0, y: 0 };

  constructor(
    private log: Log,
    /** In a room, the diver whose row has the focus first: the player's own, or the winner for one who only watched. */
    follow?: number,
  ) {
    if (isRoom(log)) {
      this.divers = log.divers.toSorted((a, b) => a.place - b.place);
      this.lines = this.divers.map((diver) => diver.said.map((said) => ({ prompt: said.prompt, pack: null, answer: said.answer, rarity: said.rarity })));
    } else {
      this.lines = [log.prompts.slice(0, log.results.length).map((prompt, i) => {
        const result = log.results[i]!;
        return { prompt: prompt.text, pack: prompt.pack, answer: result.correct ? result.answer : null, rarity: result.correct ? result.rarity : 0 };
      })];
    }
    // The focus starts on the rarest lamp of the player's own line: the answer to remember.
    const line = Math.max(0, this.divers.findIndex((diver) => diver.id === follow));
    const lamps = this.lines[line] ?? [];
    const rarest = lamps.reduce((best, hung, i) => (hung.rarity > (lamps[best]?.rarity ?? -1) ? i : best), 0);
    this.focus = lamps.length ? { line, lamp: rarest } : "back";
  }

  get focused(): Hung | null {
    return this.focus === "back" ? null : this.lines[this.focus.line]![this.focus.lamp]!;
  }

  /** Says whether the focus moved. */
  move(way: "up" | "down" | "left" | "right", frame: Frame): boolean {
    const rows = this.rows(frame);
    const was = this.focus;
    const at = rows.findIndex((row) => was !== "back" && row.line === was.line && was.lamp >= row.from && was.lamp < row.from + row.count);
    if (way === "left" || way === "right") {
      if (was === "back") return false;
      const lamp = was.lamp + (way === "left" ? -1 : 1);
      if (lamp < 0 || lamp >= this.lines[was.line]!.length) return false;
      this.focus = { line: was.line, lamp };
    } else {
      // Up and Down go round: from the last row to the line back, and from there to the first row.
      const stops = [...rows.map((_, i) => i), -1];
      const from = was === "back" ? stops.length - 1 : at;
      const next = stops[(from + (way === "up" ? -1 : 1) + stops.length) % stops.length]!;
      if (next === -1) this.focus = "back";
      else {
        const row = rows[next]!;
        // The lamp in the same column, or the row's last if it is shorter.
        const column = was === "back" ? 0 : was.lamp - rows[at]!.from;
        this.focus = { line: row.line, lamp: row.from + Math.max(0, Math.min(row.count - 1, column)) };
      }
    }
    return true;
  }

  at(x: number, y: number): Spot | null {
    return this.spots.find((spot) => x >= spot.x && x < spot.x + spot.w && y >= spot.y && y < spot.y + spot.h)?.spot ?? null;
  }

  choose(spot: Spot) {
    this.focus = spot;
  }

  /** A single player's line breaks into rows of five on a narrow screen; a room has a row for each diver. */
  private rows(frame: Frame): Row[] {
    const { width: W, height: H } = frame;
    const wide = W >= 300;
    if (!this.divers.length) {
      const count = this.lines[0]!.length;
      const per = wide ? count : 5;
      const top = (wide ? 10 : 40) + 40 + (isRoom(this.log) || !this.log.chaos ? 0 : 6);
      return Array.from({ length: Math.ceil(count / per) }, (_, i) => ({ line: 0, from: i * per, count: Math.min(per, count - i * per), y: top + i * 60, sag: 8 }));
    }
    const { top, pitch } = this.roomLayout(frame);
    const shown = this.columns(W).shown;
    return this.divers.map((_, line) => ({ line, from: this.offset, count: Math.max(0, Math.min(shown, this.lines[line]!.length - this.offset)), y: top + line * pitch, sag: 2 }));
  }

  /**
   * A room's screen from the top: who won, a row for each diver (as far apart as fits), and the words about the lamp in
   * focus, halfway between the rows and the line back. On a wide screen the rows hang small lamps.
   */
  private roomLayout(frame: Frame) {
    const { width: W, height: H } = frame;
    const wide = W >= 300;
    const top = this.headHeight(W) + (wide ? 8 : 14);
    const back = H - (wide ? 14 : 22);
    const words = wide ? 52 : 72;
    const count = this.divers.length;
    const pitch = Math.max(12, Math.min(wide ? 20 : 34, Math.floor((back - words - 10 - top) / count)));
    const bottom = top + (count - 1) * pitch + (wide ? 10 : 14);
    return { top, pitch, small: wide, details: bottom + Math.max(6, Math.floor((back - words - bottom) / 2)) };
  }

  /** In a room: where the lamps start (after the names), how far apart they are, and how many fit. */
  private columns(W: number) {
    const names = W >= 300 ? 52 : 46;
    const most = Math.max(1, ...this.lines.map((lamps) => lamps.length));
    const room = W - names - 8;
    const gap = Math.max(8, Math.min(26, Math.floor(room / most)));
    return { left: names + 4, gap, shown: Math.floor(room / gap) };
  }

  private headHeight(W: number): number {
    const chaos = isRoom(this.log) && this.log.mode === "chaos";
    return 6 + wrap(medium, this.winnerWords(), W - 16).length * 11 + 8 + (chaos ? 8 : 0);
  }

  private detailsTop(frame: Frame): number {
    if (!this.divers.length) return this.rows(frame).at(-1)!.y + 50;
    return this.roomLayout(frame).details;
  }

  private winnerWords(): string {
    if (!isRoom(this.log)) return "";
    const won = this.divers.filter((diver) => diver.won).map((diver) => plain(diver.name));
    return t().ending.won(t().list(won), this.log.mode === "deepest");
  }

  /**
   * Draw the screen over the sea, `since` seconds after the divers surfaced. The sea already on the frame fades out,
   * and with it the lights it gave (`sea`). Returns the lights to lay over the frame.
   */
  draw(frame: Frame, sea: Light[], since: number, time: number): Light[] {
    const { width: W, height: H } = frame;
    const wide = W >= 300;
    const log = this.log;
    const chaos = isRoom(log) ? log.mode === "chaos" : log.chaos;
    const lost = !isRoom(log) && lostDive(log);
    if (this.wordsFrom.length !== H) {
      this.wordsFrom = new Int16Array(H);
      this.wordsTo = new Int16Array(H);
    }
    this.wordsFrom.fill(W);
    this.wordsTo.fill(-1);
    this.point = { x: W >> 1, y: H >> 1 };
    const fade = Math.min(1, since / FADE_SECONDS);
    // The dark: the deepest water, and snow drifting through it.
    frame.block = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) if (fade >= 1 || dither(x, y, fade)) frame.put(x, y, dither(x, y, 0.5 + 0.5 * Math.abs(y / H - 0.4)) ? 0 : 1);
    }
    for (let i = 0; i < (W * H) / 160; i++) {
      const k = hash(i, 7);
      const x = Math.floor(hash(i, 1) * W + Math.sin(time * 0.4 + k * 20) * 1.5);
      const y = Math.floor((hash(i, 2) * H + time * (2 + k * 4)) % H);
      if (fade >= 1 || dither(x, y, fade)) frame.put(x, y, k < 0.22 ? 4 : 3);
    }
    frame.block = -1;
    const lights: Light[] = sea.map((light) => ({ ...light, strength: light.strength * (1 - fade) }));

    if (this.divers.length && this.focus !== "back") {
      // A row too long for the screen moves along with the focus.
      const { shown } = this.columns(W);
      const lamp = this.focus.lamp;
      if (lamp < this.offset) this.offset = lamp;
      if (lamp >= this.offset + shown) this.offset = lamp - shown + 1;
    }
    const rows = this.rows(frame);
    this.spots = [];
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const stagger = Math.min(STAGGER, 0.8 / Math.max(1, total));
    const arrived = RISE_FROM + stagger * total + RISE_SECONDS;
    let order = 0;
    const room = this.divers.length > 0;
    const small = room && this.roomLayout(frame).small;
    const chain = small ? 2 : CHAIN;
    for (const row of rows) {
      const cols = this.columns(W);
      const gap = room ? cols.gap : Math.min(wide ? 28 : 34, Math.floor((W - 16) / Math.max(1, row.count)));
      const xs = Array.from({ length: row.count }, (_, k) => (room ? cols.left + k * gap + ((gap - 5) >> 1) : Math.round(W / 2 + (k - (row.count - 1) / 2) * gap) - 2));
      const left = room ? cols.left - 4 : 0;
      const ropeAt = (x: number) => row.y + Math.round(row.sag * (1 - ((x - (left + W) / 2) / ((W - left) / 2)) ** 2));
      // The line of a lost chaos dive is cut just after its last lamp, and the cut end hangs down.
      const cut = lost && row.from + row.count === this.lines[0]!.length ? xs.at(-1)! + 9 : W;
      // The rope shows as the sea goes; lamps that are lit warm it.
      if (since > RISE_FROM) {
        for (let x = left; x < cut; x++) {
          const near = since > arrived && xs.some((lx, k) => this.lines[row.line]![row.from + k]!.answer && Math.abs(lx + 2 - x) < 6);
          frame.put(x, ropeAt(x), near ? (x % 3 === 2 ? 13 : 14) : x % 3 === 2 ? 3 : 4);
        }
        if (cut < W) for (let j = 1; j < 12; j++) frame.put(cut + (j > 7 ? 1 : 0), ropeAt(cut) + j, j % 3 === 2 ? 3 : 4);
      }
      if (room) this.drawName(frame, row, since > arrived);
      xs.forEach((lx, k) => {
        const lamp = row.from + k;
        const hung = this.lines[row.line]![lamp]!;
        const on = this.focus !== "back" && this.focus.line === row.line && this.focus.lamp === lamp;
        const top = ropeAt(lx + 2);
        const t = Math.max(0, Math.min(1, (since - RISE_FROM - stagger * order++) / RISE_SECONDS));
        if (t <= 0) return;
        const y = Math.round(top + chain + 1 + (1 - ease(t)) * (H - top + 10));
        if (t >= 1) for (let j = 1; j <= chain; j++) frame.put(lx + 2, top + j, hung.answer ? (j % 2 ? 13 : 12) : 3);
        frame.block = 166;
        if (small) {
          frame.emit = hung.answer ? 60 + hung.rarity * 1.9 : 0;
          frame.sprite(hung.answer ? PIP_LIT : PIP_DEAD, lx + 1, y, hung.answer ? "ac" : undefined);
          frame.emit = 0;
          if (hung.answer) lights.push({ x: lx + 2.5, y: y + 2, radius: 6 + hung.rarity * 0.12, rgb: [255, 140, 60], strength: 0.06 + (hung.rarity / 100) * 0.25 });
        } else if (hung.answer && chaos && hash(lamp * 13 + 5, Math.floor(time * 9)) < 0.06) {
          // In chaos a lamp sputters now and then, as the diver's lantern did when the air ran low.
          frame.sprite(LAMP_SPUTTER, lx, y);
        } else if (hung.answer) {
          frame.emit = 100 + hung.rarity * 1.5;
          frame.sprite(LAMP_LIT, lx, y, "ac");
          if (!room) {
            frame.emit = 150;
            frame.sprite(FRY, lx + 1, y + 8);
          }
          frame.emit = 0;
          // Rows of a room hang close together, and their light would run into one glare.
          lights.push({ x: lx + 2.5, y: y + 3, radius: (12 + hung.rarity * 0.26) * (room ? 0.8 : 1.3), rgb: chaos ? [255, 90, 60] : [255, 140, 60], strength: (0.1 + (hung.rarity / 100) * 0.5) * (room ? 0.6 : 1) });
        } else frame.sprite(LAMP_DEAD, lx, y);
        frame.block = -1;
        if (on) this.point = { x: lx + 2, y: y + 3 };
        if (since < arrived) return;
        if (room) {
          if (on) {
            frame.emit = 220;
            frame.sprite(UNDER, lx + 1, y + (small ? 5 : 8));
            frame.emit = 0;
          }
          this.spots.push({ spot: { line: row.line, lamp }, x: lx + 2 - (gap >> 1), y: top - 2, w: gap, h: small ? 11 : 16 });
        } else {
          const label = String(lamp + 1);
          const ny = y + 14;
          if (on) drawMark(frame, lx + 3 - (measure(tiny, label) >> 1) - 6, ny);
          this.say(frame, tiny, label, lx + 3, ny, on ? 16 : hung.answer ? 6 : 4, true, on ? 70 : 0);
          this.spots.push({ spot: { line: row.line, lamp }, x: lx + 2 - (gap >> 1), y: top - 4, w: gap, h: 30 });
        }
      });
    }
    if (since < arrived) return lights;

    this.drawHead(frame);
    this.drawDetails(frame);
    const backY = H - (wide ? 14 : 22);
    const back = isRoom(this.log) ? t().ending.backToRoom : t().ending.backToTitle;
    const on = this.focus === "back";
    const bx = (W >> 1) - (measure(tiny, back) >> 1);
    if (on) drawMark(frame, bx - 6, backY);
    if (on) this.point = { x: W >> 1, y: backY + 2 };
    this.say(frame, tiny, back, bx, backY, on ? 16 : 7, false, on ? 70 : 0);
    // Room for a fingertip around the line.
    this.spots.push({ spot: "back", x: bx - 10, y: backY - 6, w: measure(tiny, back) + 20, h: 17 });
    if (chaos) this.drawEyes(frame, since - arrived, time, lost);
    return lights;
  }

  /**
   * The bloodshot eyes of a chaos dive's end, `since` seconds after its lamps have arrived: they open one after another in
   * the dark and follow the focus (more of them for a dive that was lost).
   */
  private drawEyes(frame: Frame, since: number, time: number, lost: boolean) {
    const { width: W, height: H } = frame;
    (W >= 300 ? EYES_WIDE : EYES_NARROW).slice(0, lost ? 6 : 3).forEach(([fx, fy], i) => {
      const open = since - 1.5 - i * 1.6;
      if (open < 0) return;
      const ex = Math.round(fx * W);
      const ey = Math.round(fy * H);
      const shut = open < 0.12 || hash(i * 7, Math.floor(time * 1.7)) < 0.08;
      const look = Math.max(-1, Math.min(1, Math.round((this.point.x - ex) / 40)));
      frame.emit = 50;
      for (const dx of [0, 8]) frame.sprite(shut ? EYE_SHUT : EYE(look), ex + dx, ey, "x");
      frame.emit = 0;
    });
  }

  private say(frame: Frame, font: Font, text: string, x: number, y: number, color: number | ((row: number) => number), center = false, glow = 0): number {
    frame.emit = glow;
    const from = center ? x - (measure(font, text) >> 1) : x;
    const end = drawText(frame, font, text, from, y, color);
    frame.emit = 0;
    for (let row = Math.max(0, y - 2); row <= Math.min(this.wordsFrom.length - 1, y + font.height + 2); row++) {
      this.wordsFrom[row] = Math.min(this.wordsFrom[row]!, from - 3);
      this.wordsTo[row] = Math.max(this.wordsTo[row]!, end + 2);
    }
    return end;
  }

  /** Returns the y under the last line. */
  private centred(frame: Frame, font: Font, text: string, y: number, color: number | ((row: number) => number), glow = 0, gap = font.height + 4): number {
    for (const line of wrap(font, text, frame.width - 16)) {
      this.say(frame, font, line, frame.width >> 1, y, color, true, glow);
      y += pitch(font, text, gap);
    }
    return y;
  }

  private drawHead(frame: Frame) {
    const W = frame.width;
    const log = this.log;
    if (isRoom(log)) {
      const y = this.centred(frame, medium, this.winnerWords(), 6, 16, 70, 11);
      const deepest = Math.max(0, ...this.divers.filter((diver) => diver.won).map((diver) => diver.depth));
      const under = this.centred(frame, tiny, `${formatMeters(deepest)} ~ ${zoneAt(deepest)}`, y + 1, 6);
      if (log.mode === "chaos") this.centred(frame, tiny, t().ending.chaosRoom, under - 1 + rise(tiny, t().ending.chaosRoom), 18);
      return;
    }
    const top = W >= 300 ? 10 : 40;
    const lamps = this.lines[0]!;
    this.say(frame, large, formatMeters(log.depth).toUpperCase(), W >> 1, top, amber(14), true, 255);
    const lit = this.centred(frame, tiny, t().ending.lampsLit(zoneAt(log.depth), lamps.filter((hung) => hung.answer).length, lamps.length), top + 18, 6);
    const chaos = lostDive(log) ? t().ending.signalLost : t().ending.chaosAir(CHAOS_AIR_SECONDS);
    if (log.chaos) this.centred(frame, tiny, chaos, lit - 1 + rise(tiny, chaos), 18);
  }

  /** In a room, the name at the head of each row: in the colour of their suit, amber for the winner, cream while in focus. */
  private drawName(frame: Frame, row: Row, ready: boolean) {
    if (!ready) return;
    const diver = this.divers[row.line]!;
    const on = this.focus !== "back" && this.focus.line === row.line;
    for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) frame.put(4 + k, row.y - 2 + j, SUIT_COLORS[diver.suit]!);
    let name = plain(diver.name);
    const room = this.columns(frame.width).left - 16;
    while (name.length > 1 && measure(tiny, name) > room) name = name.slice(0, -1);
    this.say(frame, tiny, name, 10, row.y - 2, on ? 16 : diver.won ? 15 : 7, false, on || diver.won ? 70 : 0);
  }

  private drawDetails(frame: Frame) {
    const hung = this.focused;
    if (!hung || this.focus === "back") return;
    const { width: W } = frame;
    let y = this.detailsTop(frame);
    if (this.divers.length) {
      const diver = this.divers[this.focus.line]!;
      const out = isRoom(this.log) && this.log.mode !== "deepest" ? (diver.out === null ? t().ending.stillIn : t().ending.outAt(diver.out)) : "";
      y = this.centred(frame, tiny, [plain(diver.name), formatMeters(diver.depth), t().ending.points(diver.points), out].filter(Boolean).join(" ~ "), y, 6);
    } else {
      y = this.centred(frame, tiny, `${plain(hung.pack ?? "")} ~ ${t().count(this.focus.lamp + 1, this.lines[0]!.length)}`, y, 6);
    }
    y = this.centred(frame, medium, plain(hung.prompt), y + 2, 7, 0, 11) + 3;
    const answer = hung.answer ? plain(hung.answer) : t().dive.outOfAir;
    const font = fit([large, medium, tiny], answer, W - 16);
    this.say(frame, font, answer, W >> 1, y, hung.answer ? mint(font.height) : 18, true, hung.answer ? 255 : 0);
    const gain = `+${formatMeters(hung.rarity * METERS_PER_POINT)}`;
    const note = `${gain} ~ ${lightOf(hung.rarity)}`;
    y += font.height + 5 + rise(tiny, hung.answer ? note : t().dive.noLight);
    if (!hung.answer) {
      this.centred(frame, tiny, t().dive.noLight, y, 18);
      return;
    }
    if (measure(tiny, note) <= W - 16) this.centred(frame, tiny, note, y, 10);
    else this.centred(frame, tiny, lightOf(hung.rarity), this.centred(frame, tiny, gain, y, 10) + rise(tiny, lightOf(hung.rarity)), 9);
  }
}
