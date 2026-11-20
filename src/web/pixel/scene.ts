import { MAX_HEARTS, MAX_PLAYERS, START_HEARTS, type Gone } from "../../shared/room";
import { METERS_PER_POINT } from "../../shared/types";
import { ZONES, formatMeters, lightOf } from "../depth";
import { t } from "../language";
import { ascentSeconds, fullAir, type Game, type Lamp } from "../state";
import { Ambient } from "./creatures";
import { FONTS, drawText, fit, measure, pitch, plain, rise, wrap, type Font } from "./font";
import { dither, hash, type Frame, type Light } from "./frame";
import { drawCrown, drawMark } from "./ui";

/**
 * The world row at a depth, on a curve: near the surface a metre is drawn larger than in the deep, so a common answer
 * early in a dive still moves the diver well down the screen, and a deep dive is not endlessly tall.
 */
function rowOf(depth: number): number {
  return Math.round(50 * (Math.sqrt(depth + 2000) - Math.sqrt(2000)));
}
function depthOf(row: number): number {
  return (row / 50 + Math.sqrt(2000)) ** 2 - 2000;
}
const CHAIN_X = 84;
const LAMP_X = 76;
const DIVER_X = 84;
/** World rows count down from the diver's position at 0 m. The waterline is just above it. */
const SURFACE_ROW = -14;
/** Rows of rock generated above row 0, so that array indices stay positive. */
const PAD = 300;
const ROWS = PAD + rowOf(11000) + 300;
/** Where a world row's rock is found. There is no floor: below the rock that was generated, the trench repeats. */
function rockAt(row: number): number {
  const r = row + PAD;
  return r < 1 ? 1 : r <= ROWS - 3 ? r : PAD + ((r - PAD) % (ROWS - 3 - PAD));
}

/** A `note` of something that went wrong is said in place of the line under the title. */
export type Menu = { items: string[]; choice: number; note?: string };
const MENU_ROW = 13;

export const LAMP_LIT = [".rRo.", "rRRRo", ".aca.", ".ccc.", ".aca.", "rRRRo"];
export const LAMP_DEAD = [".555.", "56665", "5...5", "5.x..", "5...5", "56665"];
export const LANTERN = [".rRo.", "rRRRo", ".aca.", "accca", ".aca.", "rRRRo", ".rRo."];
export const LANTERN_OUT = [".rrR.", "rrrrR", ".434.", "43334", ".434.", "rrrrR", ".rrR."];
/** A small light that stays with the lamp it woke at. */
export const FRY = [".m.", "mwm", "T.T"];
const ARROW = ["77777", ".777.", "..7.."];
/** Beside the name of a diver above or below the view. */
const UP = ["..6..", ".666.", "66666"];
const DOWN = ["66666", ".666.", "..6.."];
/** A heart of a diver in "longest", and one spent. */
const HEART = ["xx.xx", "xxxxx", "xxxxx", ".xxx.", "..x.."];
const SPENT = ["55.55", "5.5.5", "5...5", ".5.5.", "..5.."];
/**
 * The submarine of a chaos dive, bow to the right. Its warning lamps blink in two groups, "x" and "X"; the screw is
 * the first column. It holds the diver by the helmet in a clamp under its keel.
 */
const SUB = [
  "..........................x",
  "..........................5",
  ".......................4555556",
  "......................455555556",
  "......................45X555X56",
  "......................455555556",
  "......................455555556",
  "...............334444555555555555555555555566",
  "...........334444444455555555555555555555555555666",
  ".5.....334444444444445555555555555555555555555555666",
  ".5...3344444X444444445555555X5555555555555X55555555666",
  "55.334444444444444444555555555555555555555555555555666x",
  "55334444444444444444455555555555555555555555555555666",
  "55.334444444444444444555555555555555555555555555555",
  ".5...33333333333333335555555555555555555555555555",
  ".5.......33333333333333333333333333333333333333",
];
const CLAMP_SHUT = ["...66...", "...67...", "67777776", "7......7", "7......7"];
const CLAMP_OPEN = ["...66...", "...67...", "67777776", ".7....7."];
/** The buoy the line hangs from in a chaos dive, once the submarine has gone. */
const BUOY = ["..X..", "..5..", ".rRo.", "rRRRo", ".rrR."];
const DARKER: Record<string, string> = { "6": "5", "5": "4", "4": "3", "3": "2", "2": "1", "1": "0", x: "r", r: "0", R: "r", o: "R", a: "o", c: "a" };
/** The same, for every colour a suit is made of: a diver sinking out of sight goes all the way to black. */
const DEEPER: Record<string, string> = { ...DARKER, "7": "6", w: "m", m: "T", T: "t", t: "1", l: "G", G: "g", g: "1", v: "2" };
/** The drop-off, in seconds from its start: the clamp opens, and the submarine sets off. */
const RELEASE = 1.4;
const LEAVE = 1.9;
/** How far above its place on the line the clamp holds the diver. */
const CLAMPED = 7;
const DIVER = [
  ".......rRRRoo........",
  ".....rrRRRRooam......",
  "RR..rrRRRRRRooam.....",
  "rR.rrRRr0000RooaT....",
  "34.rrRR0raac0Rooa....",
  "34.rrRR0oaaa0Rooa....",
  "34.rrRR0roao0Rooa....",
  "34.rrRRr0000Rooa.....",
  "34..rrRRRRRRooa......",
  "344.rr0R0R0R0oa......",
  "3444rRRRRRRRRooa.....",
  ".344rrRRRRRRRRooa....",
  "..33344444444556T....",
  "..333444444445555RR..",
  "..3334444444455.55Ro.",
  "...33344444455....oa.",
  "...3334444445........",
  "...rrRRR0RRRoo.......",
  "...33344444455.......",
  "...333444344455......",
  "...3334..33444R......",
  "...3334...33445R.....",
  "...3334....3345R.....",
  "..rrRRR....rRRRo.....",
  "..rRRRRo...rRRRoa....",
];

/** A suit is the diver's ramp of four colours (shadow, cloth, light, glint) swapped, as worn under a burning lantern and with it out. */
const SUITS = [
  { lit: "3456", dark: "2345" }, // steel
  { lit: "tTmw", dark: "2tTT" }, // teal
  { lit: "5677", dark: "4566" }, // pale
  { lit: "gGll", dark: "2gGG" }, // green
  { lit: "2vx7", dark: "1vvx" }, // violet
  { lit: "rxcc", dark: "rxxx" }, // rose
];
/** The colour that stands for each suit in a list. */
export const SUIT_COLORS = [5, 9, 7, 20, 17, 18];
/** With the lantern out the brass goes a step darker too. */
const DIM: Record<string, string> = { a: "R", o: "R", R: "r", c: "o", m: "T", T: "t" };
/** The diver in every suit, with the lantern out (0) and burning (1). */
const WORN = SUITS.map((suit) =>
  [false, true].map((lit) =>
    DIVER.map((row) => row.replace(/./g, (char) => (lit ? suit.lit : suit.dark)["3456".indexOf(char)] ?? (lit ? char : (DIM[char] ?? char)))),
  ),
);

/**
 * A diver of a room: on line `slot`, counted from the left (the first hangs where the single-player diver does), at
 * `depth` metres, with the lamps they have hung. The camera follows the one in `focus`. With `label`, their depth
 * stands over their name: another player's, in a dive. The `host` of the room has a crown before their name. In
 * "longest" their `hearts` follow the name, and one who is `out` has been hauled up: their line and lamps stay, and they
 * are named at the top of the screen. One being `hauled` up at the end of a dive is shown exactly at `depth`, which is
 * given afresh every frame.
 */
export type Crew = {
  slot: number;
  suit: number;
  name: string;
  lit: boolean;
  focus: boolean;
  depth: number;
  lamps?: Lamp[];
  label?: boolean;
  hearts?: number;
  out?: boolean;
  hauled?: boolean;
  host?: boolean;
  /** They went out of the room `t` seconds ago, and are seen going: hauled up their line, yanked up it, or cut loose. */
  going?: { how: Gone; t: number };
  /** The crown came to them `t` seconds ago, from the diver named `from`. */
  crowned?: { from: string; t: number };
  /** In a room before a dive: the player's own diver, marked over the name, and how deep they went in the last dive. */
  you?: boolean;
  last?: number;
};
/** How long a diver who went out of the room is seen going, in seconds. */
export const GOING_SECONDS: Record<Gone, number> = { left: 1.4, removed: 1, banned: 2.6 };
/** When the line of a banned diver snaps, and how long one removed is jolted before they are yanked up. */
const SNAP = 0.6;
const JOLT = 0.25;
/** How long the crown flies from one host to the next, and how long it glints once it is there. */
export const CROWN_SECONDS = 0.9;
export const GLINT_SECONDS = 0.6;

/**
 * Where a diver who went out of the room is as they go: how far down (up, below 0) and across from their place, how
 * far they have faded (0 to 1), and whether their lantern still burns. One who left is hauled up gently, one removed is
 * jolted and yanked up, both just out of sight (`hidden` pixels up) as their time runs out; one banned has their
 * lantern sputter out and their line snap, and sinks into the dark.
 */
function going({ how, t }: NonNullable<Crew["going"]>, hidden: number): { dy: number; dx: number; fade: number; lit: boolean } {
  if (how === "banned") {
    const q = Math.max(0, (t - SNAP) / (GOING_SECONDS.banned - SNAP));
    return { dy: Math.round(90 * q ** 1.6), dx: 0, fade: q, lit: t < SNAP && hash(Math.floor(t * 14), 7) > t / SNAP };
  }
  if (how === "removed") {
    const q = Math.max(0, (t - JOLT) / (GOING_SECONDS.removed - JOLT));
    return { dy: -Math.round(hidden * q ** 3), dx: t < JOLT ? Math.round(Math.sin(t * 90)) : 0, fade: 0, lit: true };
  }
  return { dy: -Math.round(hidden * (t / GOING_SECONDS.left) ** 2), dx: 0, fade: 0, lit: true };
}

/** A diver fading into the dark: a few steps darker first, then a growing share of their pixels gone into the water. */
function faded(rows: string[], fade: number): string[] {
  if (!fade) return rows;
  const steps = Math.min(3, Math.ceil(fade * 4));
  const gone = Math.max(0, fade * 1.6 - 0.6);
  return rows.map((row, j) =>
    row.replace(/./g, (char, i: number) => {
      if (char === "." || dither(i, j, gone)) return ".";
      for (let k = 0; k < steps; k++) char = DEEPER[char] ?? char;
      return char;
    }),
  );
}
/**
 * What a dive in a room adds to the words: the room's air in seconds, whether the turn is the
 * player's own, the answers already given to the prompt, whether the answer just refused was
 * taken, the player's own depth while someone else's diver is on screen (null for one who only watches),
 * how many in the room only watch, and whether the player is one of them. In "longest", the player's own
 * hearts while they are in (null otherwise), the points in their bar, and the points that fill it.
 */
export type Turn = {
  air: number;
  yours: boolean;
  taken: string[];
  refusedTaken: boolean;
  depth: number | null;
  watching: number;
  watcher: boolean;
  hearts: number | null;
  bar: number;
  barFull: number;
  /** What the player has typed ahead of their turn, while another diver answers. */
  ahead: string;
};
const LINE_GAP = 64;
/**
 * The mark over the player's own diver in a room; how much longer the lines are there, so the mark has room under
 * the hull; and how far a narrow screen hangs every other diver further down.
 */
const CARET = ["aaaaa", ".aaa.", "..a.."];
const LONGER = 14;
const STAGGER = 44;

/**
 * In a room before a dive every place along the boat is in view: as far apart as the screen allows, up to the usual
 * gap, and centred. `across` is how far the camera has moved to the right for that.
 */
export function lobbyPlaces(width: number): { gap: number; across: number } {
  const gap = Math.min(LINE_GAP, Math.floor(width / MAX_PLAYERS));
  const first = Math.round((width - MAX_PLAYERS * gap) / 2 + gap / 2);
  return { gap, across: CHAIN_X + 10 - first };
}

/** A name cut to fit `width`: a long name loses its end. */
function clip(name: string, width: number): string {
  while (name.length > 1 && measure(FONTS.tiny, name) > width) name = name.slice(0, -1);
  return name;
}
const KELP_ROWS = rowOf(600);
const TRAVEL_SECONDS = 0.75;

/** One step of easing from `from` towards `to`: a share `rate` of the way, but never less than `least`, nor past it. */
export function approach(from: number, to: number, rate: number, least: number): number {
  const gap = to - from;
  const eased = gap * rate;
  const step = Math.sign(gap) * Math.min(Math.abs(gap), least);
  return from + (Math.abs(eased) > Math.abs(step) ? eased : step);
}

/** A light as the pixel art sees it: it tints rock and snow in bands, without any blur. */
type Lit = { x: number; y: number; r: number; i: number };

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shape of the trench, generated once for its whole height. */
function buildRock() {
  const random = seeded(4180);
  const edge = new Int16Array(ROWS); // right edge of the near wall
  const far = new Int16Array(ROWS); // how far the far wall reaches in from the right
  const band = new Int16Array(ROWS); // which stratum each row belongs to
  const bandTop = new Uint8Array(ROWS);
  const bands: [slab: number, offset: number][] = [];

  for (let y = 0, x = 54; y < ROWS; ) {
    x = Math.max(45, Math.min(63, x + Math.round((random() - 0.5) * 11)));
    for (let n = 2 + Math.floor(random() * 8); n > 0 && y < ROWS; n--) edge[y++] = x;
  }
  for (let y = 0; y < ROWS; ) {
    bands.push([9 + Math.floor(random() * 12), Math.floor(random() * 20)]);
    for (let i = 0, height = 2 + Math.floor(random() * 4); i < height && y < ROWS; i++, y++) {
      band[y] = bands.length - 1;
      bandTop[y] = i === 0 ? 1 : 0;
    }
  }
  for (let y = 0, reach = 36, drift = 1; y < ROWS; ) {
    if (random() < 0.18) drift = -drift;
    reach += Math.round((random() - 0.5) * 5) + drift;
    if (random() < 0.12) reach += Math.round((random() - 0.5) * 18);
    if (reach > 58) [reach, drift] = [58, -1];
    if (reach < 14) [reach, drift] = [14, 1];
    for (let n = 2 + Math.floor(random() * 5); n > 0 && y < ROWS; n--) far[y++] = reach;
  }
  return { edge, far, band, bandTop, bands };
}

export class Scene {
  /** The depth on screen, which eases towards the game's real depth. */
  depth = 0;
  ambient = new Ambient();
  private camera = 0;
  private rock = buildRock();
  private water = new Uint8Array(0);
  /** The span of words on each screen row last frame, so lines in the water can break behind them. */
  wordsFrom = new Int16Array(0);
  wordsTo = new Int16Array(0);
  private snow: { x: number; y: number; k: number }[] = [];
  private bubbles: { x: number; y: number; size: number; phase: number }[] = [];
  private nextBubble = 0;
  /** Whether the diver of a chaos dive has been let go, and the bubbles of that have risen. */
  private freed = false;
  private menuLeft = 0;
  private menuTop = 0;
  /** The screen row the diver hangs at, and the row under the prompt and the air: a panel is set out from these. */
  base = 0;
  hudBottom = 0;
  /** Where the diver is on their way to hang, while `base` moves: -1 before the first frame. */
  private place = -1;
  /** Whether the screen is worked by touch: what is drawn to press says so. */
  touch = false;
  /** The screen rows a panel lies over, where it lies over the rock: no zone is named there. */
  hush: [top: number, bottom: number] | null = null;
  /** When each lit lamp was reached, by its index, and how many lamps have been reached since the game began. */
  reached = new Map<number, number>();
  lit = 0;
  /** In a room: the same for each diver's lamps, by name, the depth each diver is shown at, how far the camera has moved to the right, and the diver it stays on. */
  private marks = new Map<string, Map<number, number>>();
  private shown = new Map<string, number>();
  private across = 0;
  private shifted = 0;
  private locked: string | null = null;
  /** The camera's way to the diver it is travelling to: where it set out, and for how long it has been going. */
  private travel: { name: string; depth: number; across: number; time: number } | null = null;
  /** The depth of the diver in focus, as shown: theirs even while the camera is still on its way. */
  private held = 0;
  /** Where each diver of a room is along the boat, as shown: they slide over when one before them has gone. */
  private slots = new Map<string, number>();
  /** Where the crown set out from, by the name of the diver it is flying to. */
  private flights = new Map<string, { x: number; y: number }>();
  /** The divers of the room the player is in, or is about to make or join. */
  crew: Crew[] | null = null;
  /**
   * The player is in a room and no dive is on: every place along the boat is shown. The words lie in a dock at the
   * foot of the screen from row `dock` down, and the water darkens towards it; `floor` is the row under the lowest
   * diver, which the dock does not climb over.
   */
  lobby = false;
  dock = Infinity;
  floor = 0;
  /** Where each diver of a room stands on the frame, by name, as last drawn, and the one whose control has the focus. */
  places = new Map<string, { x: number; y: number; w: number; h: number }>();
  chosen: string | null = null;
  /** How far the room's places are spread out, from 0 (as in a dive) to 1 (all in view), and the dock as shown. */
  private spread = 0;
  private gap = LINE_GAP;
  private shaded = Infinity;
  turn: Turn | null = null;
  /** The middle of the diver in focus, on the frame, as last drawn. */
  focus = { x: 0, y: 0 };
  /** How starved of air the diver is, from 0 (fine) to 1 (out). */
  panic = 0;

  /** The red at the edges of the screen, and the heartbeat: for the player whose air it is, not for those who watch. */
  get alarm(): number {
    return !this.turn || this.turn.yours ? this.panic : 0;
  }
  pulse = 0;

  /** Draw one frame and return the soft lights to lay over it. While a panel is open (`covered`), the words it takes the place of are left out. */
  draw(frame: Frame, game: Game, menu: Menu, dt: number, time: number, covered: boolean): Light[] {
    const { width: W, height: H } = frame;
    const crew = this.crew;
    const places = lobbyPlaces(W);
    this.spread = approach(this.spread, this.lobby ? 1 : 0, 1 - Math.exp(-dt * 5), 2 * dt);
    this.gap = LINE_GAP + (places.gap - LINE_GAP) * this.spread;
    let diving: boolean;
    if (crew) diving = this.follow(crew, dt);
    else {
      this.shown.clear();
      this.marks.clear();
      this.slots.clear();
      this.locked = null;
      this.travel = null;
      this.across = 0;
      const gap = game.depth - this.depth;
      if (game.phase === "ascent") {
        // The dive is over: the diver is hauled back up the line, past every lamp, gently at both ends.
        const t = Math.min(1, game.phaseTime / ascentSeconds(game.depth));
        this.depth = game.depth * (1 - t * t * (3 - 2 * t));
      } else if (game.phase === "done") {
        this.depth = 0;
      } else {
        // Ease towards the real depth, but never slower than 25 m/s, so the dive actually arrives.
        this.depth = approach(this.depth, game.depth, 1 - Math.exp(-dt * 1.6), 25 * dt);
      }
      diving = Math.abs(gap) > 4;
    }
    const camera = rowOf(this.depth);
    const scroll = camera - this.camera;
    this.camera = camera;
    const across = Math.round(this.across + (places.across - this.across) * this.spread);
    const sideways = across - this.shifted;
    this.shifted = across;

    const wide = W >= 300;
    // On a narrow screen the prompt runs across the top, and the diver hangs under it with room below for the answer.
    const asked = !wide && (game.phase === "ask" || game.phase === "verdict") && !!game.prompts[game.round];
    // In a room the boat rises a little, to leave open water between the divers and the dock.
    const goal = asked ? Math.min(Math.max(H * 0.36, this.hudBottom + 12), H - 76) : H * (this.lobby ? (wide ? 0.28 : 0.2) : 0.36);
    this.place = this.place < 0 ? goal : approach(this.place, goal, 1 - Math.exp(-dt * 6), 20 * dt);
    const base = (this.base = Math.round(this.place)); // screen row of the diver's world row
    const rowAt = (y: number) => camera + y - base;
    const screenY = (row: number) => row - camera + base;

    if (!crew && game.lamps.length === 0 && this.reached.size > 0) {
      this.reached.clear();
      this.ambient.clear();
    }
    /** The lamps of a line that are in view. A lit one shows once its diver has come down to it, and flares then. */
    const hang = (marks: Map<number, number>, list: Lamp[], depth: number, x: number) => {
      if (!list.length) marks.clear();
      return list.flatMap((lamp, i) => {
        if (lamp.lit && !marks.has(i) && depth >= lamp.depth - 2) {
          marks.set(i, time);
          this.lit++;
        }
        const reachedAt = marks.get(i);
        if (lamp.lit && reachedAt === undefined) return [];
        const stacked = list.slice(0, i).filter((other) => other.depth === lamp.depth).length;
        const y = screenY(rowOf(lamp.depth)) + 2 + stacked * 10;
        if (y < -70 || y > H + 70) return [];
        // Older lamps burn lower; a lamp flares as it is lit.
        const newer = list.slice(i + 1).filter((other) => other.lit).length;
        const flare = Math.max(0, 1 - (time - (reachedAt ?? 0)) / 0.9);
        return [{ lit: lamp.lit, x: x - (CHAIN_X - LAMP_X), y, glow: Math.max(0.34, 0.78 - 0.11 * newer) * (1 + flare) }];
      });
    };

    // The lines that hang from the boat: the player's alone, or one for each diver of a room.
    // On a wide screen as many as fit beside the words; in a dive on a narrow one, the diver in focus and the one before.
    // A chaos diver whose air ran out has a dead lantern.
    const members: Crew[] = crew?.map((diver) => ({ ...diver, slot: this.slots.get(diver.name) ?? diver.slot })) ?? [
      { slot: 0, suit: 0, name: "", lit: game.phase !== "lost", focus: true, depth: game.depth, lamps: game.lamps },
    ];
    const focus = members.find((diver) => diver.focus) ?? members[0]!;
    const lineX = (slot: number) => Math.round(CHAIN_X + slot * this.gap - across);
    // In a room the lines are longer, and on a narrow screen every other diver hangs lower still, so that names have
    // room; sliding between places, smoothly.
    const staggered = (slot: number) => Math.round(this.spread * (LONGER + (wide ? 0 : (STAGGER * (1 - Math.cos(Math.PI * slot))) / 2)));
    const near = (slot: number, to: number) => Math.round(slot) === Math.round(to);
    const lines = members
      .filter((diver) => (this.lobby || wide || !this.turn ? lineX(diver.slot) > -22 && lineX(diver.slot) + 21 <= (wide && !this.lobby ? 172 : W) : near(diver.slot, focus.slot) || near(diver.slot, focus.slot - 1)))
      .map((diver) => {
        const depth = crew ? this.shown.get(diver.name)! : this.depth;
        const settled = diver.focus ? !diving : Math.abs(diver.depth - depth) <= 4;
        const place = screenY(rowOf(depth)) + (settled ? Math.round(Math.sin(time * 1.3 + diver.slot * 2)) : 0) - held(game) + staggered(diver.slot);
        // Hauled up, a diver is out of sight once their boots are under the hull, or over the top of the screen.
        const away = diver.going ? going(diver.going, place + 26 - Math.max(0, screenY(SURFACE_ROW))) : null;
        const x = lineX(diver.slot) + (away?.dx ?? 0);
        const marks = crew ? (this.marks.get(diver.name) ?? this.marks.set(diver.name, new Map()).get(diver.name)!) : this.reached;
        const y = place + (away?.dy ?? 0);
        // One hauled up into the boat takes their lantern with them.
        const lit = diver.lit && (!away || (away.lit && y + 17 > screenY(SURFACE_ROW)));
        return { ...diver, x, y, depth, lit, fade: away?.fade ?? 0, lamps: hang(marks, diver.lamps ?? [], depth, x) };
      });
    const lamps = lines.flatMap((line) => line.lamps);
    this.floor = Math.max(0, ...lines.map((line) => line.y + 34));
    const lead = lines.find((line) => line.focus);
    if (lead) this.focus = { x: lead.x + 10, y: lead.y + 12 };
    const sub = vessel(game);

    // Running low on air: the lantern sputters and the dark begins to pulse red.
    // In the last third of the air, the diver is in trouble and the screen shows it.
    const starved = game.phase === "ask" ? Math.max(0, 1 - game.air / (this.full(game) / 3)) : 0;
    this.panic += (starved - this.panic) * Math.min(1, dt * 5);
    this.pulse += dt * (1.2 + this.panic * 1.6) * Math.PI * 2;
    const beat = Math.max(0, Math.sin(this.pulse)) ** 2;
    const sputter = 1 - this.panic * (0.45 + 0.3 * Math.max(0, Math.sin(time * 31) * Math.sin(time * 7.7)));

    // Only the diver in focus is short of air: theirs is the lantern that sputters.
    const lanterns = lines.filter((line) => line.lit).map((line) => ({ x: line.x + 18.5, y: line.y + 19.5, fade: line.focus ? 1 - 0.3 * this.panic : 1, sputter: line.focus ? sputter : 1 }));
    const warm: Lit[] = lanterns.map(({ x, y, fade }) => ({ x, y, r: 62 * fade, i: 1 }));
    for (const lamp of lamps) if (lamp.lit) warm.push({ x: lamp.x + 2.5, y: lamp.y + 2.5, r: 30 + lamp.glow * 14, i: Math.min(0.95, lamp.glow) });

    const flicker = 0.95 + 0.05 * Math.sin(time * 9) * Math.sin(time * 5.3);
    const lights: Light[] = lanterns.flatMap(({ x, y, fade, sputter }): Light[] => [
      { x, y, radius: 74 * fade, rgb: [255, 150, 60], strength: 0.62 * flicker * sputter },
      { x, y, radius: 22, rgb: [255, 220, 150], strength: 0.45 * flicker * sputter },
    ]);
    for (const lamp of lamps) {
      if (lamp.lit) lights.push({ x: lamp.x + 2.5, y: lamp.y + 3, radius: 16 + lamp.glow * 20, rgb: [255, 140, 60], strength: 0.12 + lamp.glow * 0.4 });
    }
    if (this.alarm > 0.01) {
      const strength = this.alarm * (0.3 + 0.9 * beat);
      const radius = Math.min(W, H) * 0.9;
      const edges = [[W / 2, -radius / 6], [W / 2, H + radius / 6]];
      if (W > H) edges.push([W + radius / 6, H / 2]);
      for (const [x, y] of edges) lights.push({ x: x!, y: y!, radius, rgb: [210, 40, 70], strength });
    }
    // The warning lamps of the submarine, and of the buoy: they blink in turn.
    const blink = Math.floor(time * 3) % 2 === 0;
    const sunk = (name: "x" | "X", rows: string[], left: number, top: number, fade = 0) =>
      rows.flatMap((row, j) => [...row].flatMap((char, i) => (char === name && fade < 0.85 ? [{ x: left + i + 0.5, y: top + j + 0.5, radius: 20, rgb: [210, 40, 70] as Light["rgb"], strength: 0.55 * (1 - fade) }] : [])));
    // Each holds a diver's helmet in its clamp, CLAMPED rows above their place on the line, and rides the waves with them.
    const subs = sub ? lines.map((line) => ({ x: line.x - 16 + sub.dx, y: screenY(0) - 19 - CLAMPED + sub.dy + (sub.dx ? 0 : Math.round(Math.sin(time * 1.3 + line.slot * 2))) })) : [];
    if (sub) for (const at of subs) lights.push(...sunk(blink ? "x" : "X", SUB, at.x, at.y, sub.fade));
    if (game.chaos && !sub && Math.floor(time * 1.2) % 2 === 0) for (const line of lines) lights.push(...sunk("X", BUOY, line.x - 2, screenY(SURFACE_ROW) - 3));

    const light = (list: Lit[], x: number, y: number) => {
      let value = 0;
      for (const l of list) {
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < l.r) value += l.i * (1 - d / l.r) ** 2;
      }
      return value;
    };
    const rockLight = (x: number, y: number) => {
      let value = 0;
      for (const l of warm) {
        const big = l.i >= 1;
        const r = big ? 72 : 34 + l.i * 9;
        const d = Math.hypot(x - l.x, (y - l.y) * (big ? 1 : 1.2));
        if (d < r) value += (big ? 0.8 : l.i * 1.1) * (1 - d / r) ** 1.5;
      }
      return value;
    };

    // ---- water, darkening with depth (and a night sky above it)
    frame.clear();
    if (this.water.length !== H) {
      this.water = new Uint8Array(H);
      this.wordsFrom = new Int16Array(H).fill(W);
      this.wordsTo = new Int16Array(H).fill(-1);
    }
    const behindWords = (x: number, y: number) => x >= this.wordsFrom[y]! && x <= this.wordsTo[y]!;
    const water = this.water;
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      const depth = depthOf(row);
      const [from, to, mix] =
        row < SURFACE_ROW ? [1, 1, 0]
        : depth < 200 ? [4, 3, depth / 200]
        : depth < 1000 ? [3, 2, (depth - 200) / 800]
        : depth < 3965 ? [2, 2, 0]
        : depth < 4000 ? [2, 1, (depth - 3965) / 35]
        : depth < 6000 ? [1, 1, 0]
        : depth < 8500 ? [1, 0, (depth - 6000) / 2500]
        : [0, 0, 0];
      water[y] = mix > 0.5 ? to : from;
      for (let x = 0; x < W; x++) {
        if (row < SURFACE_ROW) frame.put(x, y, hash(x, row) < 0.003 ? 6 : 1);
        else if (row === SURFACE_ROW && !behindWords(x, y)) frame.put(x, y, (x + Math.floor(time * 3)) % 9 < 5 ? 6 : 5);
        else frame.put(x, y, mix > 0 && dither(x, row, mix) ? to : from);
      }
    }

    const surface = screenY(SURFACE_ROW);
    // In a room the water darkens down to the dock, two shades by its top, so the sea and the words meet without an edge.
    this.shaded = this.dock === Infinity || this.shaded === Infinity ? this.dock : approach(this.shaded, this.dock, 1 - Math.exp(-dt * 12), 60 * dt);
    if (this.shaded < H) {
      const from = Math.max(surface + 2, this.shaded - 44);
      for (let y = Math.max(0, Math.round(from)); y < Math.min(H, this.shaded); y++) {
        const t = (y - from) / (this.shaded - from);
        const k = t * t * (3 - 2 * t) * 2;
        for (let x = 0; x < W; x++) {
          const steps = Math.floor(k) + (dither(x, y, k - Math.floor(k)) ? 1 : 0);
          const color = frame.color[y * W + x]!;
          if (steps && color >= 2 && color <= 5) frame.put(x, y, Math.max(1, color - steps));
        }
      }
    }

    // ---- the boat the lines hang from: one hull, a wheelhouse over every line
    const slots = members.map((diver) => diver.slot);
    if (!game.chaos && surface > -20 && surface < H + 20) {
      // In a room the hull runs under every place, taken or not.
      const hull = this.lobby ? [...slots, 0, MAX_PLAYERS - 1] : slots;
      const stern = lineX(Math.min(...hull)) - 24;
      const bow = lineX(Math.max(...hull)) + 50;
      frame.block = 224;
      for (let j = 0; j < 7; j++) for (let x = stern + j; x <= bow - j; x++) frame.put(x, surface - 6 + j, j === 0 ? 3 : 0);
      for (const slot of slots) {
        const x = lineX(slot);
        for (let j = 0; j < 7; j++) for (let i = 14; i <= 34; i++) frame.put(x + i, surface - 13 + j, j === 0 ? 3 : 0);
        frame.sprite(["aa....aa"], x + 18, surface - 10, "a");
      }
      frame.block = -1;
    }

    // ---- the far wall of the trench: a darker dark, at the right of the world. In a room the world goes on past the last line,
    // and before a dive, with every place close together, the wall stands off the screen.
    const wall = W + Math.max(...slots) * this.gap - across + Math.round(this.spread * W);
    const end = Math.min(W, wall);
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      if (row <= SURFACE_ROW) continue;
      const reach = this.rock.far[rockAt(row)]!;
      for (let x = wall - reach; x < end; x++) frame.put(x, y, Math.max(0, water[y]! - 1));
    }

    // ---- far lights: other lives, a long way off
    for (let cy = Math.floor(rowAt(0) / 24); cy <= Math.floor(rowAt(H) / 24); cy++) {
      if (depthOf(cy * 24) < 800) continue;
      for (let cx = Math.max(4, Math.floor(across / 24)); cx * 24 - across < W; cx++) {
        const chance = hash(cx * 7 + 3, cy);
        const out = hash(cx + Math.floor(time * 0.7) * 31, cy) < 0.15;
        if (chance > 0.3 || out) continue;
        const x = cx * 24 + Math.floor(hash(cx, cy * 3 + 1) * 24) - across;
        const row = cy * 24 + Math.floor(hash(cx * 5, cy) * 24);
        frame.put(x, screenY(row), chance < 0.15 ? 8 : 17);
      }
    }

    this.ambient.chaos = game.chaos;
    this.ambient.diving = game.phase === "ask" || game.phase === "verdict";
    this.ambient.focus = this.focus;
    // Back on the title screen, the giant anglerfish of a dive that was left is gone.
    if (game.phase === "title") this.ambient.creatures = this.ambient.creatures.filter((creature) => creature.kind !== "leviathan");
    this.ambient.update(dt, this.depth, scroll, W, H, surface + 1);
    this.ambient.draw(frame, water, time, lights, behindWords);

    const flakes = Math.round((W * H) / 250);
    while (this.snow.length < flakes) this.snow.push({ x: Math.random() * W, y: Math.random() * H, k: Math.random() });
    this.snow.length = flakes;
    for (const flake of this.snow) {
      flake.y = (((flake.y + (2 + flake.k * 4) * dt - scroll * (0.7 + 0.3 * flake.k)) % H) + H) % H;
      flake.x = (((flake.x + Math.sin(time * 0.4 + flake.k * 20) * dt * 1.5 - sideways * (0.7 + 0.3 * flake.k)) % W) + W) % W;
      const x = Math.floor(flake.x);
      const y = Math.floor(flake.y);
      if (rowAt(y) <= SURFACE_ROW) continue;
      const w = light(warm, x, y);
      const tint = w > 0.42 ? 16 : w > 0.2 ? 15 : w > 0.08 ? 14 : w > 0.03 ? 13 : 0;
      frame.put(x, y, tint || (flake.k < 0.22 ? 4 : 3));
    }

    const boundaries = ZONES.map((from, i) => ({ from, name: t().dive.zones[i]!.short, y: screenY(rowOf(from)) })).slice(1);
    for (const { y } of boundaries) {
      if (y < 0 || y >= H) continue;
      for (let x = 0; x < W; x++) if (x % 5 !== 2 && x % 5 !== 4 && !behindWords(x, y)) frame.put(x, y, x % 5 < 2 ? 5 : 3);
    }

    // ---- the near wall: a silhouette, lit only where a lamp reaches. In a room it stands left of the first line.
    const shift = -across;
    frame.block = 224;
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      const r = rockAt(row);
      const edge = this.rock.edge[r]! + shift;
      const above = this.rock.edge[r - 1]! + shift;
      const below = this.rock.edge[r + 1]! + shift;
      const band = this.rock.band[r]!;
      const [slab, offset] = this.rock.bands[band]!;
      const lean = hash(band, -999);
      for (let x = 0; x <= edge; x++) {
        const grain = hash(band, Math.floor((x - shift + offset) / slab));
        const crack = (this.rock.bandTop[r] === 1 && grain > 0.3) || ((x - shift + offset) % slab === 0 && grain > 0.55);
        const lit = rockLight(x - (lean - 0.5) * 9, y) + (lean - 0.5) * 0.05 + (grain - 0.5) * 0.03;
        const rim = x === edge || x > above || x > below;
        let level = lit > 0.29 ? 3 : lit > 0.165 ? 2 : lit > 0.085 ? 1 : 0;
        if (crack && !rim) level = Math.max(0, level - 1);
        frame.put(x, y, (rim ? [2, 12, 13, 14] : [0, 1, 12, 13])[level]!);
      }
      // Snow settles on the ledges.
      for (let x = Math.max(0, above + 1); x <= edge; x++) {
        const lit = rockLight(x, y);
        frame.put(x, y, lit > 0.3 ? 15 : lit > 0.17 ? 14 : lit > 0.08 ? 13 : 3);
      }
    }

    // Kelp grows from the ledges of the wall where the sun still reaches, tall near the surface and shorter below; lower
    // down only tufts of grass, and then nothing. It sways, and a lamp nearby lights it.
    frame.block = -1;
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      if (row < 1 || row > KELP_ROWS) continue;
      const r = row + PAD;
      const edge = this.rock.edge[r]! + shift;
      // Only a ledge, where the wall steps out, holds anything: one or two stalks from its outer edge.
      if (edge <= this.rock.edge[r - 1]! + shift) continue;
      const deep = row / KELP_ROWS;
      for (const [k, x] of [edge, edge - 2].entries()) {
        const chance = hash(row, k * 31 + 5);
        if (chance > (k ? 0.35 : 0.8) - 0.4 * deep) continue;
        const kelp = deep < 0.45 && chance < 0.5;
        const tall = kelp ? Math.round((12 + 24 * hash(row, k + 9)) * (1 - deep)) : 3 + Math.floor(4 * hash(row, k + 17));
        const sway = Math.sin(time * 0.8 + row * 0.9 + k * 2);
        for (let h = 1; h <= tall; h++) {
          const up = h / tall;
          // It leans out from the wall into the water, more towards its tip, and sways there.
          const px = Math.round(x + 1 + h * (kelp ? 0.3 : 0.4) + sway * (kelp ? 2.5 : 1) * up ** 1.5);
          const py = y - h;
          if (py < 0 || rowAt(py) <= SURFACE_ROW || behindWords(px, py)) continue;
          if (px <= this.rock.edge[Math.max(1, rowAt(py) + PAD)]! + shift) continue;
          const lit = rockLight(px, py);
          frame.put(px, py, lit > 0.29 && up > 0.6 ? 21 : lit > 0.12 ? 20 : 19);
          // Blades off the stalk, now on one side, now on the other.
          if (kelp && h % 5 === 3 && h < tall - 1) frame.put(px + (h % 10 === 3 ? 1 : -1), py - 1, lit > 0.12 ? 20 : 19);
        }
      }
    }

    for (const zone of boundaries) {
      if (this.hush && zone.y + 18 > this.hush[0] && zone.y + 4 < this.hush[1]) continue;
      // A name the bottom edge would cut waits until it fits.
      if (zone.y + 18 > H) continue;
      // Nor is a name drawn where words stood last frame, as they do across a narrow screen.
      const named = 4 + shift + Math.max(measure(FONTS.tiny, zone.name), measure(FONTS.tiny, formatMeters(zone.from)));
      let crowded = false;
      for (let y = Math.max(0, zone.y + 4); y < Math.min(H, zone.y + 18); y++) crowded ||= this.wordsFrom[y]! <= named && this.wordsTo[y]! >= 0;
      if (crowded) continue;
      drawText(frame, FONTS.tiny, zone.name, 4 + shift, zone.y + 4, 6);
      drawText(frame, FONTS.tiny, formatMeters(zone.from), 4 + shift, zone.y + 12, 5);
    }

    frame.block = 166;
    for (const line of lines) {
      const x = line.x;
      const snapped = line.going?.how === "banned" && line.going.t >= SNAP;
      for (let y = Math.max(0, snapped ? line.y + 2 : surface); y < H; y++) {
        const row = rowAt(y);
        if (behindWords(x, y)) continue;
        let near = 99;
        for (const l of warm) if (Math.abs(l.x - x) < 30) near = Math.min(near, Math.abs(y - l.y) / (l.i < 1 ? l.i * 0.9 + 0.2 : 2.2));
        const link = ((row % 3) + 3) % 3 !== 2;
        let color = link ? 5 : 3;
        if (near < 3) color = link ? 15 : 14;
        else if (near < 7) color = link ? 14 : 13;
        else if (near < 11) color = link ? 13 : 12;
        else if (y > line.y + 29) color = link ? ((y - line.y - 29) / (H - line.y - 29) > 0.5 ? 3 : 4) : 2;
        frame.put(x, y, color);
      }
    }
    // A place nobody has taken: a slack line with its hook.
    if (this.lobby) {
      for (let slot = 0; slot < MAX_PLAYERS; slot++) {
        if (members.some((diver) => Math.round(diver.slot) === slot)) continue;
        const x = lineX(slot);
        const hook = screenY(0) - held(game) + staggered(slot) + 8;
        for (let y = Math.max(0, surface + 1); y < hook; y += 2) frame.put(x, y, 5);
        frame.put(x, hook, 6);
        frame.put(x + 1, hook + 1, 6);
        frame.put(x + 2, hook, 6);
      }
    }
    for (const lamp of lamps) {
      for (let x = lamp.x + 5; x < lamp.x + CHAIN_X - LAMP_X; x++) frame.put(x, lamp.y, lamp.lit ? 13 : 5);
      if (lamp.lit) {
        frame.sprite(LAMP_LIT, lamp.x, lamp.y, "ac");
        frame.emit = 150;
        frame.sprite(FRY, lamp.x + 1, lamp.y + 8);
        frame.emit = 0;
      } else {
        frame.sprite(LAMP_DEAD, lamp.x, lamp.y);
        frame.put(lamp.x + 5, lamp.y + 4, 5); // shards
        frame.put(lamp.x + 3, lamp.y + 7, 5);
      }
    }
    if (game.chaos) {
      const lit = (rows: string[], name: "x" | "X", on: boolean) => rows.map((row) => row.replaceAll(name, on ? "x" : "r"));
      frame.block = 224;
      for (const line of lines) frame.sprite(lit(BUOY, "X", Math.floor(time * 1.2) % 2 === 0), line.x - 2, screenY(SURFACE_ROW) - 3, "x");
      if (sub) {
        let rows = lit(lit(SUB, "x", blink), "X", !blink);
        // The screw turns while the submarine moves.
        if (sub.dx && Math.floor(time * 10) % 2) rows = rows.map((row, j) => (j === 11 || j === 13 ? `.${row.slice(1)}` : row));
        for (let k = 0; k < Math.floor(sub.fade * 4); k++) rows = rows.map((row) => row.replace(/[^.]/g, (char) => DARKER[char] ?? char));
        for (const at of subs) {
          // Under the waterline it is a step darker.
          const shown = rows.map((row, j) => (at.y + j > screenY(SURFACE_ROW) ? row.replace(/[^.x]/g, (char) => DARKER[char] ?? char) : row));
          frame.sprite(shown, at.x, at.y, "x");
        }
      }
    }
    frame.block = -1;

    // ---- bubbles climbing the line from the helmet of the diver in focus: a burst as the clamp lets go
    if (game.phase !== "drop") this.freed = false;
    else if (!this.freed && game.phaseTime >= RELEASE && lead) {
      this.freed = true;
      for (let i = 0; i < 10; i++) this.bubbles.push({ x: lead.x + 6 + Math.random() * 10, y: lead.y - 2 + Math.random() * 8, size: 1 + Math.floor(Math.random() * 3), phase: Math.random() * 6 });
    }
    for (const line of lines) {
      if (line.going?.how !== "banned" || line.going.t < SNAP || line.going.t - dt >= SNAP) continue;
      for (let i = 0; i < 8; i++) this.bubbles.push({ x: line.x + 6 + Math.random() * 10, y: line.y - 4 + Math.random() * 6, size: 1 + Math.floor(Math.random() * 3), phase: Math.random() * 6 });
    }
    this.nextBubble -= dt;
    if (this.nextBubble <= 0 && lead) {
      this.nextBubble = (0.5 + Math.random() * 0.9) * (1 - 0.7 * this.panic);
      this.bubbles.push({ x: lead.x + 11 + Math.random() * 3, y: lead.y - 3, size: 1 + Math.floor(Math.random() * 3), phase: Math.random() * 6 });
    }
    this.bubbles = this.bubbles.filter((bubble) => {
      bubble.y -= 13 * dt + scroll;
      bubble.x -= sideways;
      return bubble.y > -4 && rowAt(Math.floor(bubble.y)) > SURFACE_ROW;
    });
    for (const bubble of this.bubbles) {
      const x = Math.round(bubble.x + Math.sin(time * 2 + bubble.phase) * 1.5);
      const y = Math.round(bubble.y);
      const w = light(warm, x, y);
      const hi = w > 0.3 ? 16 : w > 0.1 ? 15 : 7;
      const lo = w > 0.3 ? 14 : w > 0.1 ? 13 : 5;
      if (bubble.size === 1) frame.put(x, y, lo);
      else if (bubble.size === 2) for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) frame.put(x + i, y + j, i + j ? lo : hi);
      else for (const [i, j, c] of [[1, 0, hi], [0, 1, hi], [2, 1, lo], [1, 2, lo]] as const) frame.put(x + i, y + j, c);
    }

    // ---- the divers, lantern in hand, the one in focus in front. One who is out has been hauled up.
    frame.block = 178;
    for (const { x, y, suit, lit, fade, going: away } of lines.filter((line) => !line.out).sort((a, b) => Number(a.focus) - Number(b.focus))) {
      // One hauled up goes into the boat, under its hull.
      const top = away && away.how !== "banned" ? surface + 1 : -Infinity;
      const draw = (rows: string[], left: number, from: number, glow?: string) =>
        frame.sprite(faded(rows.slice(Math.max(0, top - from)), fade), left, Math.max(from, top), glow);
      draw(lit ? ["rRo"] : ["rrR"], x + 8, y - 1);
      draw(WORN[suit]![lit ? 1 : 0]!, x, y);
      if (y + 16 >= top && !fade) frame.put(x + 18, y + 16, lit ? 13 : 12);
      draw(lit ? LANTERN : LANTERN_OUT, x + 16, y + 17, lit ? "ac" : undefined);
    }
    // The clamp holds the helmet from either side, so it is drawn over the diver.
    if (sub && sub.fade < 0.5) for (const at of subs) frame.sprite(sub.open ? CLAMP_OPEN : CLAMP_SHUT, at.x + 22, at.y + 16);
    frame.block = -1;

    // ---- in a room, their names over them, and over another player's their depth
    const { tiny, large } = FONTS;
    const right = wide && !this.lobby ? 180 : W - 2;
    // In a room a name has its own place, or two on a narrow screen where its neighbours hang lower.
    const room = Math.round(this.gap) * (wide ? 1 : 2) - 6;
    // Where the depth at the bottom right begins: a name at the bottom edge goes above it rather than into it.
    const depthLeft = game.phase === "title" ? W : W - 17 - measure(large, formatMeters(this.reading).toUpperCase()) - measure(tiny, t().dive.depth);
    // And where the player's own hearts at the bottom left end.
    const heartsRight = this.turn?.hearts == null ? 0 : 8 + this.ownWidth(W);
    /** Where each name's crown is, or would be. */
    const crowns = new Map<string, { x: number; y: number }>();
    this.places.clear();
    for (const line of lines) {
      if (!line.name) continue;
      // One going is named on the way, fading with them, until they are in the boat or out of view.
      if (line.going) {
        if (line.y - 9 > surface && line.y < H) drawText(frame, tiny, line.name, Math.max(2, line.x + 10 - (measure(tiny, line.name) >> 1)), line.y - 9, 6 - Math.min(2, Math.floor(line.fade * 3)));
        crowns.set(line.name, { x: line.x + 10 - (measure(tiny, line.name) >> 1) - 7, y: line.y - 9 });
        continue;
      }
      const tag = line.label && !line.out ? formatMeters(line.depth) : "";
      const hearts = line.hearts === undefined ? 0 : 2 + heartsWidth(line.hearts);
      const crown = line.host ? 7 : 0;
      // While the crown flies to them it is not yet on their head; as it lands it glints.
      const flying = !!line.crowned && line.crowned.t < CROWN_SECONDS;
      const glint = line.crowned && !flying ? Math.max(0, 1 - (line.crowned.t - CROWN_SECONDS) / GLINT_SECONDS) : 0;
      const above = line.out || line.y + 25 < 0;
      const below = !above && line.y > H - 6;
      if (above || below) {
        // Out of view above or below, or out of the dive: named at that edge of the screen, on their line.
        const text = tag ? `${line.name} ${tag}` : line.name;
        const width = 7 + crown + measure(tiny, text) + hearts;
        const x = Math.max(2, Math.min(right - width, line.x + 10 - (width >> 1)));
        const y = above ? 3 : x + width > depthLeft || x < heartsRight ? H - 32 : H - 8;
        frame.sprite(above ? UP : DOWN, x, y + 1);
        crowns.set(line.name, { x: x + 7, y });
        if (line.host && !flying) drawCrown(frame, x + 7, y, 6);
        const end = drawText(frame, tiny, text, x + 7 + crown, y, 6);
        if (line.hearts !== undefined) drawHearts(frame, line.hearts, end + 2, y);
        continue;
      }
      const at = (width: number) => Math.max(2, Math.min(right - width, line.x + 10 - (width >> 1)));
      // One the top of the screen cuts through is named under the boots, as are those still held under a submarine.
      const under = line.y < (tag ? 18 : 10) || !!sub;
      const y = under ? line.y + 29 : line.y - 9;
      frame.emit = line.lit ? 70 : 0;
      const name = this.lobby ? clip(line.name, room - crown) : line.name;
      // The diver in focus has the mark before the name, which moves over only if the screen's edge leaves it no room.
      const chosen = this.lobby && this.chosen === line.name;
      const x = Math.max(chosen ? 8 : 2, at(crown + measure(tiny, name) + hearts));
      crowns.set(line.name, { x, y });
      if (this.lobby) this.places.set(line.name, { x: line.x - 4, y: y - 4, w: 30, h: line.y + 28 - (y - 4) });
      if (chosen) drawMark(frame, x - 6, y);
      if (line.host && !flying) {
        if (glint) frame.emit = Math.round(255 * glint);
        drawCrown(frame, x, y, line.lit || glint ? 16 : 6);
        if (glint > 0.5) for (const [i, j] of [[2, -4], [2, -2], [1, -3], [3, -3]] as const) frame.put(x + i, y + j, 16);
        frame.emit = line.lit ? 70 : 0;
      }
      if (chosen) frame.emit = 70;
      const end = drawText(frame, tiny, name, x + crown, y, line.lit || chosen ? 16 : 6);
      frame.emit = 0;
      if (line.hearts !== undefined) drawHearts(frame, line.hearts, end + 2, y);
      if (tag) drawText(frame, tiny, tag, at(measure(tiny, tag)), under ? y + 8 : y - 8, 6);
      if (line.you) {
        frame.emit = 90;
        frame.sprite(CARET, ((x + crown + end) >> 1) - 2, y - 6 + Math.round(Math.sin(time * 2.4)), "a");
        frame.emit = 0;
      }
      if (line.last !== undefined) {
        const last = formatMeters(line.last);
        drawText(frame, tiny, last, at(measure(tiny, last)), line.y + 27, 5);
      }
    }

    // The crown lifts off the old host's name and arcs over to the new host's; from above, if the old host is not in view.
    for (const line of lines) {
      const to = crowns.get(line.name);
      if (!line.crowned || line.crowned.t >= CROWN_SECONDS || !to) {
        this.flights.delete(line.name);
        continue;
      }
      if (!this.flights.has(line.name)) this.flights.set(line.name, crowns.get(line.crowned.from) ?? { x: to.x, y: to.y - 20 });
      const from = this.flights.get(line.name)!;
      const p = line.crowned.t / CROWN_SECONDS;
      const k = p * p * (3 - 2 * p);
      frame.emit = 150;
      drawCrown(frame, Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k - 14 * Math.sin(Math.PI * p)), 16);
      frame.emit = 0;
    }

    this.ambient.drawNear(frame, water, lights, behindWords);
    this.drawWords(frame, game, menu, time, base, diving, covered);
    return lights;
  }

  /**
   * Ease every diver of a room towards their depth, and the camera towards the one in focus: quickly, across and
   * up or down at once, when the focus passes on, then fixed on them as they go down. Says whether the camera moves.
   */
  private follow(crew: Crew[], dt: number): boolean {
    for (const diver of crew) {
      const at = this.slots.get(diver.name);
      this.slots.set(diver.name, at === undefined || diver.going ? diver.slot : approach(at, diver.slot, 1 - Math.exp(-dt * 5), 1.5 * dt));
      const was = this.shown.get(diver.name);
      // A diver first seen is shown where they are, their lamps long reached: no lamp flares or rings for them.
      if (was === undefined) this.marks.set(diver.name, new Map(diver.lamps?.map((_, i) => [i, -Infinity])));
      this.shown.set(diver.name, was === undefined || diver.hauled ? diver.depth : approach(was, diver.depth, 1 - Math.exp(-dt * 1.6), 25 * dt));
    }
    const focus = crew.find((diver) => diver.focus) ?? crew[0]!;
    const depth = (this.held = this.shown.get(focus.name)!);
    const x = this.slots.get(focus.name)! * this.gap;
    if (this.locked !== focus.name) {
      if (this.travel?.name !== focus.name) this.travel = { name: focus.name, depth: this.depth, across: this.across, time: 0 };
      const travel = this.travel;
      travel.time += dt;
      // Gently at both ends; the diver it goes to may still be sinking, so the end moves with them.
      const t = Math.min(1, travel.time / TRAVEL_SECONDS);
      const k = t * t * (3 - 2 * t);
      this.depth = travel.depth + (depth - travel.depth) * k;
      this.across = travel.across + (x - travel.across) * k;
      if (t === 1) this.locked = focus.name;
    }
    if (this.locked === focus.name) {
      this.depth = depth;
      this.across = x;
    }
    return this.locked !== focus.name || Math.abs(focus.depth - depth) > 4;
  }

  /** The depth at the bottom right. In a room it is the player's own, whoever is on screen; one who only watches sees the depth of the diver in focus. */
  private get reading(): number {
    return this.turn ? (this.turn.depth ?? this.held) : this.depth;
  }

  /** How wide the player's own hearts and bar are at the bottom left. */
  private ownWidth(W: number): number {
    const hearts = this.turn?.hearts ?? 0;
    return heartsWidth(hearts) + (hearts < MAX_HEARTS ? 4 + 10 * (W >= 300 ? 4 : 3) + 2 + 5 : 0);
  }

  /** The seconds of air a turn starts with. */
  private full(game: Game): number {
    return this.turn?.air ?? fullAir(game);
  }

  /** Which line of the title menu is at a point of the frame. No line has an index outside the menu. */
  menuAt(x: number, y: number): number {
    return x < this.menuLeft - 8 ? -1 : Math.floor((y - this.menuTop + 2) / MENU_ROW);
  }

  /** Remember where words are, with a little room around them, so that the lines in the water break behind them. */
  cover(from: number, to: number, top: number, bottom: number) {
    for (let y = Math.max(0, top - 2); y <= Math.min(this.wordsFrom.length - 1, bottom + 2); y++) {
      this.wordsFrom[y] = Math.min(this.wordsFrom[y]!, from - 4);
      this.wordsTo[y] = Math.max(this.wordsTo[y]!, to + 3);
    }
  }

  private drawWords(frame: Frame, game: Game, menu: Menu, time: number, base: number, diving: boolean, covered: boolean) {
    const { width: W, height: H } = frame;
    const { tiny, medium, large, huge } = FONTS;
    const wide = W >= 300;
    // On a narrow screen the words take the whole width: the prompt over the diver, the answer and the title under them.
    const x = wide ? (this.crew ? 184 : 170) : 10;
    const room = W - x - (wide ? 8 : 10);
    const answerY = base + (wide ? 10 : 32);
    const amber = (tall: number) => (row: number) => (row < tall * 0.3 ? 16 : row < tall * 0.8 ? 15 : 14);

    this.wordsFrom.fill(W);
    this.wordsTo.fill(-1);
    const cover = this.cover.bind(this);
    const say = (font: Font, text: string, tx: number, ty: number, color: Parameters<typeof drawText>[5], right = false) => {
      const end = drawText(frame, font, text, tx, ty, color, right);
      cover(right ? tx - measure(font, text) : tx, right ? tx : end, ty, ty + font.height + 1);
      return end;
    };
    // Text that may not fit on one line: it runs on to as many as it needs. Returns where the last line is and ends.
    const sayWrapped = (font: Font, text: string, ty: number, color: Parameters<typeof drawText>[5]) => {
      let end = x;
      let y = ty;
      wrap(font, text, room).forEach((line, i) => (end = say(font, line, x, (y = ty + i * pitch(font, text)), color)));
      return { end, y };
    };
    const key = (kx: number, ky: number, label: string) => cover(kx, drawKey(frame, kx, ky, label, this.touch), ky, ky + 10);

    if (game.phase === "title") {
      if (covered) return;
      const font = fit([huge, large], "HADAL", room);
      const tall = font.height;
      // On a narrow screen the line under the title runs on to a second one.
      const note = menu.note ?? t().title.tagline;
      const under = wrap(tiny, note, room);
      const gap = pitch(tiny, note, 8);
      const titleY = wide ? base - 4 : base + 32;
      // On a short screen the title stands higher, as far as it must for its last line to fit.
      const lift = Math.max(0, Math.min(titleY - 4, titleY + 4 + tall + 2 + rise(tiny, note) + 4 + under.length * gap + menu.items.length * MENU_ROW - 4 - H));
      frame.emit = 110;
      say(font, "HADAL", x, titleY - lift, amber(tall));
      frame.emit = 0;
      const top = titleY + 4 + tall + 2 + rise(tiny, note) - lift;
      under.forEach((line, i) => say(tiny, line, x, top + i * gap, menu.note ? 18 : 6));
      this.menuLeft = x;
      this.menuTop = top + 4 + under.length * gap;
      menu.items.forEach((item, i) => {
        const y = this.menuTop + i * MENU_ROW;
        const chosen = i === menu.choice;
        // A long line loses its end on a narrow screen.
        while (measure(tiny, item) > room) item = item.slice(0, -1);
        if (chosen) drawMark(frame, x - 6, y + 2);
        frame.emit = chosen ? 70 : 0;
        say(tiny, item, x, y + 2, chosen ? 16 : 7);
        frame.emit = 0;
        cover(x - 6, x, y + 2, y + 7);
      });
      return;
    }

    const depth = formatMeters(this.reading).toUpperCase();
    frame.emit = 255;
    say(large, depth, W - 8, H - 22, amber(14), true);
    frame.emit = 0;
    say(tiny, t().dive.depth, W - 8 - measure(large, depth) - 5, H - 13, 6, true);
    // In "longest" the player's own hearts, then the bar that wins one more (none with the most hearts), opposite the depth.
    const hearts = this.turn?.hearts;
    if (hearts != null) drawHearts(frame, hearts, 8, H - 13);
    if (hearts != null && hearts < MAX_HEARTS) {
      const start = 8 + heartsWidth(hearts) + 4;
      const pitch = W >= 300 ? 4 : 3;
      const full = Math.floor((this.turn!.bar / this.turn!.barFull) * 10);
      for (let i = 0; i < 10; i++) {
        frame.emit = i < full ? 140 : 0;
        for (let j = 0; j < 3; j++) for (let k = 0; k < pitch - 1; k++) frame.put(start + i * pitch + k, H - 12 + j, i < full ? 9 : 3);
      }
      frame.emit = 0;
      frame.sprite(SPENT, start + 10 * pitch + 2, H - 13);
    }

    // The prompt, and the air left to answer it. A finished dive has none, only the depth unwinding.
    const prompt = game.prompts[game.round];
    // While the submarine lets the diver go, the first prompt is not yet asked.
    if (!prompt || game.phase === "drop") return;
    const asking = game.phase === "ask";
    const head = `${plain(prompt.pack)} ~ ${t().count(game.round + 1, game.prompts.length)}`;
    const watching = this.turn?.watching ? t().dive.watching(this.turn.watching) : "";
    // The count of those watching keeps together: when it does not fit after the number, it takes a line of its own.
    const together = watching && measure(tiny, `${head} ~ ${watching}`) <= room;
    let headY = sayWrapped(tiny, together ? `${head} ~ ${watching}` : head, 11, 6).y;
    if (watching && !together) headY = sayWrapped(tiny, watching, headY + pitch(tiny, watching), 6).y;
    const promptY = headY + 10;
    const lines = wrap(medium, plain(prompt.text), room);
    lines.forEach((line, i) => say(medium, line, x, promptY + i * 11, asking ? 7 : 6));
    const turn = this.turn;
    // In a room the row of the air is kept when there is no air to show, so that the answers taken under it stay put.
    this.hudBottom = promptY + lines.length * 11 + (asking || turn ? 10 : 0);
    if (turn?.taken.length) this.hudBottom = sayWrapped(tiny, t().dive.taken(turn.taken.map(plain).join(", ")), this.hudBottom + 4, 6).y + 10;
    if (asking) {
      const y = promptY + lines.length * 11 + 4;
      const low = game.air <= this.full(game) / 3;
      const left = Math.ceil((game.air / this.full(game)) * 15);
      const blink = Math.floor(time * (low ? 5 : 2)) % 2 === 0;
      const pitch = room >= 100 ? 4 : 3;
      const start = say(tiny, t().dive.air, x, y, low ? 18 : 6) + 4;
      for (let i = 0; i < 15; i++) {
        // Spent pips go dark. The last one left blinks, so the count is seen to be running.
        const color = i >= left ? 3 : low ? (blink ? 18 : 12) : i === left - 1 && !blink ? 8 : 9;
        frame.emit = i < left ? 140 : 0;
        for (let j = 0; j < 3; j++) for (let k = 0; k < pitch - 1; k++) frame.put(start + i * pitch + k, y + 1 + j, color);
      }
      frame.emit = low ? 200 : 0;
      say(low ? medium : tiny, `${Math.ceil(game.air)}`, start + 15 * pitch + 3, low ? y - 1 : y, low ? 18 : 6);
      frame.emit = 0;
    }

    if (covered) return;
    // In a room the answers taken can reach down to the typing: it then moves down out of their way.
    const typingY = turn ? Math.max(answerY, this.hudBottom + 13) : answerY;
    const result = game.result;
    /** Where what the player types ahead of their turn goes: under the diver's own words and what is said of them. */
    let below: number;
    if (!result) {
      const typed = plain(game.input);
      const font = fit([large, medium, tiny], `${typed}_`, room);
      // In a room everyone sees what the diver whose turn it is types; only the diver has the caret.
      const yours = !turn || turn.yours;
      if (turn?.yours) say(tiny, t().dive.yourTurn, x, typingY - 9, 15);
      // One who joined during the dive only watches it, and is told so where a diver is told their turn has come.
      else if (turn?.watcher) say(tiny, t().dive.watcher, x, typingY - 9, 6);
      const { end, y } = sayWrapped(font, typed, typingY, yours ? 7 : 6);
      if (yours && Math.floor(time * 2.5) % 2 === 0) {
        frame.emit = 200;
        for (let j = 0; j < font.height; j++) for (let i = 0; i < (font === large ? 2 : 1); i++) frame.put(end + i, y + j, 16);
        frame.emit = 0;
      }
      // An answer with the judge is named while it is there, a wrong one briefly after; the diver can try again while the air lasts.
      const rejected = game.rejected;
      if (game.judging) {
        sayWrapped(tiny, `${plain(game.judging).slice(0, 18)} ~ ${".".repeat(1 + (Math.floor(time * 3) % 3))}`, y + font.height + 7, 6);
      } else if (rejected && game.phaseTime - rejected.at < 1.6) {
        sayWrapped(tiny, `${plain(rejected.text).slice(0, 18)} ~ ${turn?.refusedTaken ? t().dive.takenAnswer : t().dive.noLight}`, y + font.height + 7, 18);
      }
      below = y + font.height + 16;
    } else {
      const text = result.correct ? plain(result.answer) : t().dive.outOfAir;
      const font = fit([large, medium, tiny], text, room);
      const tall = font.height;
      frame.emit = result.correct ? 255 : 0;
      const last = sayWrapped(font, text, typingY, result.correct ? (row) => (row < tall * 0.22 ? 11 : row < tall * 0.8 ? 10 : 9) : 18);
      const gain = `+${formatMeters(result.rarity * METERS_PER_POINT)}`;
      const note = result.correct ? `~ ${lightOf(result.rarity)}` : "";
      let y = last.y + tall + 7 + rise(tiny, result.correct ? note : t().dive.noLight);
      const end = say(tiny, result.correct ? gain : t().dive.noLight, x, y, result.correct ? 10 : 18);
      frame.emit = 0;
      if (end + 3 + measure(tiny, note) > W - 4) say(tiny, note, x, (y += 8 + rise(tiny, note)), result.correct ? 9 : 5);
      else say(tiny, note, end + 3, y, result.correct ? 9 : 5);
      // In a room the next turn comes by itself. Over a phone's keyboard there may be no room above the depth: its own Enter key is there.
      if (!turn && !diving && game.phase === "verdict" && game.phaseTime > 0.6 && y + 23 <= H - 24) {
        key(x, y + 12, game.round + 1 === game.prompts.length ? t().dive.endDive : t().dive.keepGoing);
      }
      below = y + 12;
    }
    if (turn?.ahead) {
      const { end, y } = sayWrapped(tiny, plain(turn.ahead), below, 5);
      if (Math.floor(time * 2.5) % 2 === 0) for (let j = 0; j < tiny.height; j++) frame.put(end, y + j, 5);
    }
  }
}

/**
 * Where the submarine of a chaos dive is: how far it has gone from where it held the diver, across and down, how far into
 * the dark it has faded (0 to 1), and whether its clamp is open. Null when there is no submarine: it brings the diver
 * and goes, and comes back for the haul.
 */
function vessel(game: Game): { dx: number; dy: number; fade: number; open: boolean } | null {
  if (!game.chaos) return null;
  if (game.phase === "ascent" || game.phase === "done") return { dx: 0, dy: 0, fade: 0, open: true };
  if (game.phase !== "drop") return null;
  const t = game.phaseTime;
  const gone = Math.max(0, t - LEAVE);
  const dx = Math.round(24 * gone * gone);
  return { dx, dy: Math.round(dx * 0.25), fade: Math.min(1, Math.max(0, (t - 2.6) / 1.4)), open: t >= RELEASE };
}

/** How far above their place on the line the diver of a chaos dive is still held by the clamp, or is falling from it. */
function held(game: Game): number {
  if (!game.chaos || game.phase !== "drop") return 0;
  const fall = Math.min(1, Math.max(0, (game.phaseTime - RELEASE) / 0.3));
  return Math.round(CLAMPED * (1 - fall * fall));
}

/** A drawn Enter key, with what pressing it does; on a touch screen, a button to tap. Returns the x where it ends. */
function drawKey(frame: Frame, x: number, y: number, label: string, touch: boolean) {
  if (touch) {
    const end = drawText(frame, FONTS.tiny, label, x + 4, y + 3, 7);
    frame.sprite(ARROW, end + 3, y + 4);
    const right = end + 11;
    for (let i = x + 1; i < right; i++) {
      frame.put(i, y, 6);
      frame.put(i, y + 10, 5);
    }
    for (let j = 1; j < 10; j++) {
      frame.put(x, y + j, 6);
      frame.put(right, y + j, 5);
    }
    return right;
  }
  for (let i = 1; i < 24; i++) {
    frame.put(x + i, y, 6);
    frame.put(x + i, y + 8, 5);
  }
  for (let j = 1; j < 8; j++) {
    frame.put(x, y + j, 6);
    frame.put(x + 24, y + j, 5);
  }
  drawText(frame, FONTS.tiny, "Enter", x + 3, y + 2, 7);
  const end = drawText(frame, FONTS.tiny, label, x + 29, y + 2, 7);
  frame.sprite(ARROW, end + 3, y + 3);
  return end + 8;
}

/** How wide a row of hearts is: as many as the diver has, and never fewer than they started with. */
function heartsWidth(hearts: number): number {
  return Math.max(hearts, START_HEARTS) * 6 - 1;
}

/** A row of hearts, the spent ones after the full. Returns the x where it ends. */
function drawHearts(frame: Frame, hearts: number, x: number, y: number): number {
  for (let i = 0; i < Math.max(hearts, START_HEARTS); i++) {
    frame.emit = i < hearts ? 80 : 0;
    frame.sprite(i < hearts ? HEART : SPENT, x + i * 6, y);
  }
  frame.emit = 0;
  return x + heartsWidth(hearts);
}
