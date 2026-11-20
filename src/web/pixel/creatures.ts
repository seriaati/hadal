import { DRAWN, type DrawnKind } from "./drawn";
import { dither, hash, type Frame, type Light } from "./frame";

// Creatures are scenery: they never touch the diver.

/** In a chaos dive a glitch can turn a creature into something worse: it flickers between the two (`flick` seconds), then stays `turned`. */
type Turning = { turned: boolean; flick: number };
type Eyes = Turning & { kind: "eyes"; x: number; y: number; age: number; life: number; gap: number };
type Serpent = Turning & { kind: "serpent"; x: number; y: number; age: number; scale: number };
type Angler = Turning & { kind: "angler"; x: number; y: number; age: number; life: number; scale: number; rest: number };
/** `way` is -1 for left. */
type Shoal = Turning & { kind: "fish"; x: number; y: number; age: number; way: number; speed: number; fish: { dx: number; dy: number; phase: number }[] };
type Whale = Turning & { kind: "whale"; x: number; y: number; age: number; scale: number };
/** `x` and `y` are where its lure is first seen. */
type Leviathan = Turning & { kind: "leviathan"; x: number; y: number; age: number };
/** `rest` and `life`: where the dumbo octopus stops to look in, and for how many seconds, before it backs away. */
type Drawn = Turning & { kind: DrawnKind; x: number; y: number; age: number; rest?: number; life?: number };
type Creature = Eyes | Serpent | Angler | Shoal | Whale | Leviathan | Drawn;
export type CreatureKind = Creature["kind"];

/** How far each kind sits behind the diver: 1 moves with the wall, 0 would not move at all. */
const PARALLAX = { eyes: 0.6, serpent: 0.35, angler: 0.5, fish: 0.8, whale: 0.3, leviathan: 0, nautilus: 0.7, squid: 0.6, dumbo: 0.5, angel: 0.7, dragon: 0.75 };
/** The depth in metres above which the life of the upper sea can appear: shoals in the sunlit water, a whale down to the twilight. */
const SHALLOW = { fish: 500, whale: 1100 };
/** The depth in metres below which each kind can appear. */
const HOME = { angler: 1000, eyes: 1500, serpent: 2500 };
const CHAOS_HOME = { angler: 300, eyes: 0, serpent: 800 };
/** Where each creature NekuMeow drew lives, in metres: there, the water is the water it was drawn on. */
const RANGE: Record<DrawnKind, [from: number, to: number]> = { dragon: [100, 500], angel: [100, 800], nautilus: [150, 700], squid: [1000, 3900], dumbo: [4000, 7000] };
/** Frames a second of their tentacles' sway. */
const SWAY = 12;
const isDrawn = (creature: Creature): creature is Drawn => creature.kind in DRAWN;
const drawnSize = (kind: DrawnKind) => [DRAWN[kind].frames[0]![0]!.length, DRAWN[kind].frames[0]!.length] as const;

/** How much larger a creature grows when it turns. */
const GROWN = 1.7;

/** The giant anglerfish comes once in every chaos dive, and only there, after this many seconds of it. */
const LEVIATHAN_AFTER = [8, 18];
/**
 * The giant anglerfish, in seconds from when its lure is first seen far off: the lure nears until `GLIDE`, then its face
 * glides in, mouth opening, until it is wide open round the diver at `WIDE`, when the screen cuts to dark. At `SCARE`
 * its face comes back at the screen for `SCARE_SECONDS` and its jaws shut on it, and the dark thins away from `LET_GO`
 * to `LET_GO + THIN`.
 */
const GLIDE = 7;
export const WIDE = 12;
export const SCARE = WIDE + 0.9;
const SCARE_SECONDS = 0.55;
const LET_GO = SCARE + SCARE_SECONDS + 0.3;
const THIN = 1.4;

export class Ambient {
  creatures: Creature[] = [];
  chaos = false;
  turns = 0;
  private wait = 6;
  private shoalWait = 1;
  private whaleWait = 12;
  private drawnWait = 8;
  /** The first row of water on screen: the life of the upper sea is never drawn in the sky. */
  private top = 0;
  /** Where the diver is on screen, and whether a dive is under way: the giant anglerfish comes for them. */
  focus = { x: 0, y: 0 };
  diving = false;
  /** Whether this dive's giant anglerfish has been set to come, and the seconds of the dive left before it does. */
  private fated = false;
  private leviathanIn: number | null = null;

  /** A glitch: something in view that has not yet turned begins to. Says whether anything did. */
  jolt(width: number, height: number): boolean {
    const shown = this.creatures.filter((creature) => creature.kind !== "fish" && creature.kind !== "whale" && creature.kind !== "leviathan" && !isDrawn(creature) && !creature.turned && creature.flick <= 0 && creature.x < width && creature.x > -40 && creature.y > -20 && creature.y < height);
    const creature = shown[Math.floor(Math.random() * shown.length)];
    if (!creature) return false;
    creature.flick = 0.5;
    this.turns++;
    return true;
  }

  clear() {
    this.creatures = [];
    this.wait = 6;
    this.shoalWait = 1;
    this.whaleWait = 12;
    this.drawnWait = 8;
  }

  spawn(kind: CreatureKind, width: number, height: number, depth: number) {
    const water = Math.max(0, this.top);
    if (kind in DRAWN) {
      const drawn = kind as DrawnKind;
      const [w, h] = drawnSize(drawn);
      const y = water + 8 + Math.random() * Math.max(0, height - water - h - 16);
      // The nautilus comes in shell first from the left; the squid and the sea angel rise from below; the rest drift in from the right.
      if (drawn === "nautilus") this.creatures.push({ kind: drawn, x: -w, y, age: 0, turned: false, flick: 0 });
      else if (drawn === "squid" || drawn === "angel") this.creatures.push({ kind: drawn, x: width * 0.45 + Math.random() * Math.max(0, width * 0.5 - w), y: height + 2, age: 0, turned: false, flick: 0 });
      else if (drawn === "dumbo") this.creatures.push({ kind: drawn, x: width + 2, y, age: 0, rest: width - w - 8 - Math.random() * 24, life: 10 + Math.random() * 6, turned: false, flick: 0 });
      else this.creatures.push({ kind: drawn, x: width + 2, y, age: 0, turned: false, flick: 0 });
    } else if (kind === "fish") {
      const way = Math.random() < 0.5 ? -1 : 1;
      const fish = Array.from({ length: 6 + Math.floor(Math.random() * 9) }, () => ({ dx: Math.random() * 26, dy: (Math.random() - 0.5) * 12, phase: Math.random() * 6 }));
      const y = water + 10 + Math.random() * Math.max(0, height - water - 30);
      this.creatures.push({ kind, x: way < 0 ? width + 4 : -34, y, age: 0, way, speed: 10 + Math.random() * 6, fish, turned: false, flick: 0 });
    } else if (kind === "whale") {
      const scale = 2.6 + Math.random() * 0.6;
      const y = water + 6 + Math.random() * Math.max(0, height * 0.6 - water - WHALE_HEIGHT * scale);
      this.creatures.push({ kind, x: width + 6, y, age: 0, scale, turned: false, flick: 0 });
    } else if (kind === "eyes") {
      const x = 110 + Math.random() * (width - 120);
      const y = 8 + Math.random() * (height - 16);
      this.creatures.push({ kind, x, y, age: 0, life: 5 + Math.random() * 4, gap: 2 + Math.floor(Math.random() * 3), turned: false, flick: 0 });
    } else if (kind === "leviathan") {
      const x = this.focus.x + 20 + Math.random() * 60;
      const y = this.focus.y + (height - this.focus.y) * (0.55 + Math.random() * 0.3);
      this.creatures.push({ kind, x, y, age: 0, turned: false, flick: 0 });
    } else if (kind === "serpent") {
      const scale = depth > 6000 ? 1.4 + Math.random() * 0.8 : 1 + Math.random() * 0.4;
      this.creatures.push({ kind, x: width + 10, y: height * (0.5 + Math.random() * 0.4), age: 0, scale, turned: false, flick: 0 });
    } else {
      const scale = depth > 5000 && Math.random() < 0.4 ? 2 : 1;
      const y = height * 0.45 + Math.random() * Math.max(0, height * 0.5 - 30 * scale - 6);
      const rest = width - 46 * scale - 8 - Math.random() * 24;
      this.creatures.push({ kind, x: width + 4, y, age: 0, life: 12 + Math.random() * 8, scale, rest, turned: false, flick: 0 });
    }
  }

  /** `top` is the first row of water on screen. */
  update(dt: number, depth: number, scroll: number, width: number, height: number, top: number) {
    this.top = top;
    for (const creature of this.creatures) {
      creature.age += dt;
      if (creature.flick > 0 && (creature.flick -= dt) <= 0) creature.turned = true;
      creature.y -= scroll * PARALLAX[creature.kind];
      if (creature.kind === "serpent") {
        creature.x -= (9 + 3 * creature.scale) * dt;
      } else if (creature.kind === "angler") {
        if (creature.age > creature.life) creature.x += 12 * dt;
        else creature.x = Math.max(creature.rest, creature.x - 7 * dt);
      } else if (creature.kind === "fish") {
        creature.x += creature.way * creature.speed * dt;
      } else if (creature.kind === "whale") {
        // It surges a little with each downstroke of its flukes, and glides between them.
        creature.x -= (10 + 3 * Math.max(0, Math.sin(creature.age * WHALE_STROKE - 0.6))) * dt;
      } else if (creature.kind === "nautilus") {
        // It swims backwards, shell first, in pulses of its jet.
        creature.x += (6 + 8 * Math.max(0, Math.sin(creature.age * 1.3)) ** 2) * dt;
      } else if (creature.kind === "squid") {
        creature.y -= 9 * dt;
      } else if (creature.kind === "angel") {
        creature.y -= 8 * dt;
      } else if (creature.kind === "dumbo") {
        // Like the anglerfish, it only looks in for a while, then backs away the way it came.
        if (creature.age > creature.life!) creature.x += 10 * dt;
        else creature.x = Math.max(creature.rest!, creature.x - 8 * dt);
      } else if (creature.kind === "dragon") {
        creature.x -= 7 * dt;
      }
    }
    this.creatures = this.creatures.filter((creature) => {
      if (creature.kind === "leviathan") return creature.age < LET_GO + THIN;
      if (isDrawn(creature)) {
        const [w, h] = drawnSize(creature.kind);
        // Gone once it has left the screen, or risen out of the sea.
        return creature.x > -w - 4 && creature.x < width + 4 && creature.y + h > Math.max(0, top) && creature.y < height + 4;
      }
      if (creature.kind === "whale") return creature.x + WHALE_LENGTH * creature.scale > 0 && creature.y + WHALE_HEIGHT * creature.scale > -20 && creature.y < height + 20;
      if (creature.y < -80 || creature.y > height + 80) return false;
      if (creature.kind === "eyes") return creature.age < creature.life;
      if (creature.kind === "serpent") return creature.x + 112 * creature.scale + 20 > 0;
      if (creature.kind === "fish") return creature.way < 0 ? creature.x + 34 > 0 : creature.x < width + 4;
      return creature.x < width + 8;
    });

    this.fate(dt, depth, width, height);
    // While the giant anglerfish is about, nothing else comes.
    const giant = this.creatures.some((creature) => creature.kind === "leviathan");
    this.shoalWait -= dt;
    this.whaleWait -= dt;
    const big = giant || this.creatures.some((creature) => creature.kind === "angler" || creature.kind === "serpent" || creature.kind === "whale");
    if (this.shoalWait <= 0) {
      this.shoalWait = 3 + Math.random() * 6;
      if (depth < SHALLOW.fish && !giant && this.creatures.filter((creature) => creature.kind === "fish").length < 3) this.spawn("fish", width, height, depth);
    }
    if (this.whaleWait <= 0) {
      this.whaleWait = 30 + Math.random() * 30;
      if (depth < SHALLOW.whale && !big) this.spawn("whale", width, height, depth);
    }
    // The creatures NekuMeow drew come one at a time, each only at its own depths.
    this.drawnWait -= dt;
    if (this.drawnWait <= 0) {
      this.drawnWait = 18 + Math.random() * 18;
      const kinds = (Object.keys(RANGE) as DrawnKind[]).filter((kind) => depth >= RANGE[kind][0] && depth < RANGE[kind][1]);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      if (kind && !giant && !this.creatures.some(isDrawn)) this.spawn(kind, width, height, depth);
    }

    this.wait -= dt;
    const home = this.chaos ? CHAOS_HOME : HOME;
    if (this.wait > 0 || giant || depth < Math.min(...Object.values(home))) return;
    // The deeper the diver is, the less time passes between visitors; in a chaos dive, less again.
    this.wait = (20 - 12 * Math.min(1, depth / 9000)) * (0.6 + Math.random() * 0.8) * (this.chaos ? 0.5 : 1);
    const kinds = (Object.keys(home) as (keyof typeof home)[]).filter((kind) => depth >= home[kind] && (kind === "eyes" || !big));
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (!kind) return;
    const count = kind === "eyes" ? 1 + Math.floor(Math.random() * (this.chaos ? 5 : 3)) : 1;
    for (let i = 0; i < count; i++) this.spawn(kind, width, height, depth);
  }

  /** Each chaos dive has the giant anglerfish come once. */
  private fate(dt: number, depth: number, width: number, height: number) {
    if (!this.diving) {
      this.fated = false;
      this.leviathanIn = null;
      return;
    }
    if (!this.fated && this.chaos) {
      this.fated = true;
      const [soonest, latest] = LEVIATHAN_AFTER;
      this.leviathanIn = soonest! + Math.random() * (latest! - soonest!);
    }
    if (this.leviathanIn !== null && (this.leviathanIn -= dt) <= 0) {
      this.leviathanIn = null;
      this.spawn("leviathan", width, height, depth);
    }
  }

  /** `water` is the water colour of each row of the frame. */
  draw(frame: Frame, water: Uint8Array, time: number, lights: Light[], behindWords: (x: number, y: number) => boolean) {
    for (const creature of this.creatures) {
      // While it turns it flickers between what it was and what it is becoming.
      const worse = creature.turned || (creature.flick > 0 && Math.floor(creature.flick * 18) % 2 === 0);
      if (creature.kind === "eyes") (worse ? drawBloodyEyes : drawEyes)(frame, creature);
      else if (creature.kind === "serpent") drawSerpent(frame, creature, water, time, worse);
      else if (creature.kind === "fish") drawShoal(frame, creature, water, this.top);
      else if (creature.kind === "whale") drawWhale(frame, creature, water, this.top, behindWords);
      else if (creature.kind === "angler") drawAngler(frame, creature, water, time, lights, worse);
      else if (isDrawn(creature)) drawDrawn(frame, creature, this.top, lights);
      else if (creature.age < WIDE) drawLeviathan(frame, creature, this.focus, water, lights, behindWords);
    }
  }

  /** What covers the diver: the dark of the giant anglerfish, and its face. Drawn over the world, under the words. */
  drawNear(frame: Frame, water: Uint8Array, lights: Light[], behindWords: (x: number, y: number) => boolean) {
    for (const creature of this.creatures) {
      if (creature.kind === "leviathan" && creature.age >= WIDE) drawLeviathan(frame, creature, this.focus, water, lights, behindWords);
    }
  }
}

/** A creature NekuMeow drew, its tentacles swaying frame by frame, and never drawn in the sky. */
function drawDrawn(frame: Frame, creature: Drawn, top: number, lights: Light[]) {
  const { frames, glow, strength, lights: own } = DRAWN[creature.kind];
  const rows = frames[Math.floor(creature.age * SWAY) % frames.length]!;
  // The sea angel sways from side to side as it rises.
  const sway = creature.kind === "angel" ? Math.sin(creature.age * 0.9) * 3 : 0;
  const x = Math.round(creature.x + sway);
  const y = Math.round(creature.y);
  const clip = frame.clipTop;
  frame.clipTop = Math.max(clip, top);
  frame.emit = strength;
  frame.sprite(rows, x, y, glow);
  frame.emit = 0;
  frame.clipTop = clip;
  // Their light swells and fades, slower and softer than the anglerfish's lure.
  const swell = 1 + 0.25 * Math.sin(creature.age * 2);
  for (const light of own) {
    // No glow in the sky: a light above the surface is not cast.
    if (y + light.y >= top) lights.push({ ...light, x: x + light.x, y: y + light.y, strength: light.strength * swell });
  }
}

/** Faces left. */
const FISH = [".bb.b", "ebbbb", ".bb.b"];

function drawShoal(frame: Frame, shoal: Shoal, water: Uint8Array, top: number) {
  for (const [i, fish] of shoal.fish.entries()) {
    const x = Math.round(shoal.x + fish.dx + Math.sin(shoal.age * 1.3 + fish.phase) * 2);
    const y = Math.round(shoal.y + fish.dy + Math.sin(shoal.age * 2.1 + fish.phase) * 1.2);
    if (y < top || y + 3 > frame.height) continue;
    // A step or two lighter than the water, so they show in the dim of the upper sea.
    const body = Math.min(6, (water[y] ?? 0) + 2);
    const glint = hash(i, Math.floor(shoal.age * 3 + fish.phase)) < 0.08;
    FISH.forEach((row, j) => {
      for (let k = 0; k < 5; k++) {
        const char = row[shoal.way < 0 ? k : 4 - k];
        if (char === "b") frame.put(x + k, y + j, glint ? 7 : body);
        else if (char === "e") frame.put(x + k, y + j, Math.min(7, body + 1));
      }
    });
  }
}

/** How fast a whale's stroke goes, in radians a second: about one beat of the flukes every eight seconds. */
const WHALE_STROKE = 0.8;
/** How long and how tall a whale is in its own space, nose to fluke tips and fin tip to back. */
const WHALE_LENGTH = 100;
const WHALE_HEIGHT = 44;

/** A smooth curve through points `[u, v]` with rising `u` (Catmull-Rom), as a function of `u`. */
function curve(points: [number, number][]) {
  return (u: number) => {
    const after = points.findIndex(([x]) => x > u);
    const i = Math.max(0, Math.min(points.length - 2, (after < 0 ? points.length : after) - 1));
    const [x1, v1] = points[i]!;
    const [x2, v2] = points[i + 1]!;
    const v0 = points[Math.max(0, i - 1)]![1];
    const v3 = points[Math.min(points.length - 1, i + 2)]![1];
    const t = Math.max(0, Math.min(1, (u - x1) / (x2 - x1)));
    return 0.5 * (2 * v1 + (v2 - v0) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (3 * v1 - v0 - 3 * v2 + v3) * t * t * t);
  };
}

/** A humpback seen from the side, facing left: its back and its belly, from the tip of the jaw to the narrow stock of the tail. */
const WHALE_BACK = curve([[0, 19], [2, 16.5], [8, 13.5], [18, 11.5], [32, 10.5], [48, 11], [60, 12.5], [72, 15], [82, 17.3], [90, 18.6]]);
const WHALE_BELLY = curve([[0, 20.5], [3, 23.5], [10, 26.5], [22, 28.5], [36, 28.6], [50, 27.2], [64, 25], [76, 23], [84, 21.8], [90, 21.4]]);
/** The jaw line, running back from the tip and rising to just under the eye. */
const WHALE_JAW = curve([[1, 20], [8, 21], [16, 21.6], [22, 21], [25, 20.2]]);

/**
 * A humpback seen from the side. Its back is darker than the water and its belly lighter, so it stands out.
 * The flukes beat slowly, and the back half of it bends with them.
 */
function drawWhale(frame: Frame, whale: Whale, water: Uint8Array, top: number, behindWords: (x: number, y: number) => boolean) {
  const s = whale.scale;
  const left = Math.round(whale.x);
  const phase = whale.age * WHALE_STROKE;
  // A slow wave runs down the body from head to tail: the head hardly moves, the tail swings the most.
  const bend = (u: number) => (0.5 + 4 * Math.max(0, (u - 30) / 70) ** 2) * Math.sin(phase - u * 0.03);
  // The flukes flex behind the sweep of the tail, and their lobes open and close a little.
  const flex = Math.cos(phase - 3);
  const spread = Math.sin(phase - 2.4);
  /** A colour some steps lighter (or darker, below 0) than the water at row `y`. */
  const shade = (y: number, steps: number) => Math.max(0, Math.min(7, (water[y] ?? 0) + steps));
  // The long fins rise and fall a beat behind the stroke, bending most towards their tips.
  const flap = Math.sin(phase - 1.2) * 2.4;
  const finRoot = bend(23);
  for (let py = 0; py < WHALE_HEIGHT * s; py++) {
    const y = Math.round(whale.y) + py;
    if (y < top || y >= frame.height) continue;
    for (let px = 0; px < WHALE_LENGTH * s; px++) {
      const u = (px + 0.5) / s;
      const v = (py + 0.5) / s - bend(u);
      const x = left + px;
      let color = -1;
      if (u < 90) {
        const back = WHALE_BACK(u);
        const belly = WHALE_BELLY(u);
        // The small dorsal fin on the hump, leaning back.
        const dorsal = u > 60 && u < 67 && v < back && v > back - 2.6 * Math.min((u - 60) / 4, (67 - u) / 3);
        if ((v >= back && v <= belly) || dorsal) {
          const depth = (v - back) / (belly - back);
          const pale = 0.55 + 0.5 * Math.max(0, Math.min(1, (u - 34) / 30));
          const jaw = WHALE_JAW(u);
          if (u > 0.5 && u < 25 && Math.abs(v - jaw) < 0.55 / s + 0.35) color = 0;
          else if (Math.floor(u) === 26 && Math.floor(v) === 19) color = shade(y, 3); // the eye
          // The grooves of the throat run back along the belly.
          else if (u > 4 && u < 40 && v > jaw + 1 && depth > 0.62 && Math.round((belly - v) * 1.1) % 2 === 0) color = shade(y, 0);
          // Dark above, the throat pale below, dithered between, and the paleness fading out along the belly; the light
          // from above catches the line of the back.
          else if (depth > pale + 0.15 || (depth > pale && dither(x, y, (depth - pale) / 0.15))) color = shade(y, 1);
          else if (v - back < 0.9 && u > 3) color = shade(y, -1);
          // Knobs on the head, and a few barnacles on the chin.
          else if (u < 22 && v - back < 1.6 && hash(Math.floor(u * 1.4), 3) < 0.35) color = shade(y, -1);
          else color = shade(y, -2);
          if (u < 14 && depth > 0.5 && hash(Math.floor(u * 2), Math.floor(v * 2)) < 0.12) color = shade(y, 3);
        }
      } else {
        // The flukes, a little turned to the light: two swept-back lobes forked from the stock, the lower one shorter.
        const k = (u - 90) / 10;
        const d = v - 20 + flex * 2.2 * k * k;
        const lead = (1 + 9 * k ** 0.9) * (1 + 0.12 * spread * k);
        // The trailing edge meets the leading one at the tip, so each lobe ends in a point.
        const trail = k < 0.45 ? 0 : ((k - 0.45) / 0.55) ** 1.3 * lead;
        const upper = d <= -trail && d >= -lead;
        const lower = d >= trail * 0.9 && d <= lead * 0.9;
        if (upper || lower || (k < 0.45 && Math.abs(d) <= 1.4 - k * 2)) color = lower && d > 1.4 ? shade(y, -1) : shade(y, -2);
      }
      // The long pale fin, swept back and down from under the throat, with bumps along its leading edge.
      const t = (u - 23) / 28;
      if (t >= 0 && t <= 1) {
        const finV = 27 + t * 11 - Math.sin(t * Math.PI) * 1.5 + flap * t ** 1.6 + finRoot - bend(u);
        const width = 3.6 * (1 - t) ** 0.7 + 0.6;
        const lead = finV - width * 0.45;
        const bump = Math.max(0, Math.sin(u * 2.2)) * 0.5 * (1 - t);
        if (v >= lead - bump && v <= finV + width * 0.55) {
          color = v < lead + 0.6 ? shade(y, 3) : v > finV + width * 0.55 - 0.7 ? shade(y, 1) : shade(y, 2);
        }
      }
      // Its pale parts are the colours of the words: behind them it is never brighter than the water near the surface.
      if (color >= 0) frame.put(x, y, behindWords(x, y) ? Math.min(color, 4) : color);
    }
  }
}

function drawEyes(frame: Frame, eyes: Eyes) {
  const open = Math.min(eyes.age / 0.8, (eyes.life - eyes.age) / 0.8, 1);
  const blinking = hash(Math.floor(eyes.age * 2.2), eyes.gap) < 0.12;
  if (open <= 0 || blinking) return;
  const color = open < 0.34 ? 5 : open < 0.67 ? 6 : 7;
  frame.put(eyes.x, eyes.y, color);
  frame.put(eyes.x + eyes.gap, eyes.y, color);
}

const BLOODY_EYE = [".7x7.", "7x0x7", ".777."];
function drawBloodyEyes(frame: Frame, eyes: Eyes) {
  const open = Math.min(eyes.age / 0.4, (eyes.life - eyes.age) / 0.8, 1);
  if (open <= 0 || hash(Math.floor(eyes.age * 2.2), eyes.gap) < 0.06) return;
  const left = Math.round(eyes.x) - 2;
  const top = Math.round(eyes.y) - 1;
  const gap = eyes.gap + 5;
  for (const x of [left, left + gap]) {
    frame.emit = 90;
    frame.sprite(open < 0.5 ? [BLOODY_EYE[1]!] : BLOODY_EYE, x, open < 0.5 ? top + 1 : top, "x");
    frame.emit = 0;
  }
  // The blood runs down from the first eye.
  const run = Math.min(9, Math.floor(eyes.age * 2.5));
  for (let j = 0; j < run; j++) frame.put(left + 1, top + 3 + j, j === run - 1 ? 18 : 12);
}

function drawSerpent(frame: Frame, serpent: Serpent, water: Uint8Array, time: number, worse: boolean) {
  const s = serpent.scale * (worse ? GROWN : 1);
  const spine: [x: number, y: number, girth: number][] = [];
  for (let k = 0; k <= 260; k++) {
    const t = k / 260;
    const x = serpent.x + t * 112 * s;
    const y = serpent.y - 13 * s * Math.sin(t * Math.PI * 1.05 + 0.15 - time * 0.7) + t * t * 30 * s;
    spine.push([x, y, (t < 0.06 ? 3.2 + t * 30 : 5.2 * (1 - t * 0.82) + 0.6) * s]);
  }
  const body = (x: number, y: number) => (water[Math.round(y)] ?? 0) + 1;
  for (const [x, y, girth] of spine) {
    const reach = Math.ceil(girth);
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach; i <= reach; i++) {
        if (i * i + j * j > girth * girth) continue;
        const px = Math.round(x + i);
        const py = Math.round(y + j);
        const belly = j > girth * 0.25 && dither(px, py, 0.5);
        frame.put(px, py, belly ? body(px, py) - 1 : body(px, py));
      }
    }
  }
  // A low crest along the back.
  for (let k = 10; k < 200; k += 7) {
    const [x, y, girth] = spine[k]!;
    const height = (k < 60 ? 3 : 2) * s;
    for (let h = 0; h < height; h++) frame.put(Math.round(x) + h, Math.round(y - girth) - 1 - h, body(x, y));
  }
  // Photophores down its side; turned, they all burn red.
  frame.emit = worse ? 140 : 60;
  for (let k = 22; k < 250; k += 11) {
    const [x, y, girth] = spine[k]!;
    frame.put(Math.round(x), Math.round(y + girth * 0.2), worse ? 18 : Math.floor(k / 11) % 4 === 1 ? 8 : 17);
  }
  frame.emit = 0;
  // Jaw and eye. Turned, the jaw hangs open on a row of teeth, and the eye is red.
  const [headX, headY] = spine[0]!;
  for (let i = -3 * s; i < 5 * s; i++) frame.put(Math.round(headX + i), Math.round(headY + 2 * s), worse ? 12 : body(headX, headY) - 1);
  if (worse) for (let i = -2 * s; i < 5 * s; i += 2) frame.put(Math.round(headX + i), Math.round(headY + 2 * s) - 1, 16);
  frame.emit = worse ? 200 : 0;
  frame.put(Math.round(headX + 3 * s), Math.round(headY - s), worse ? 18 : 7);
  frame.put(Math.round(headX + 3 * s) + 1, Math.round(headY - s), worse ? 18 : 5);
  frame.emit = 0;
}

const inEllipse = (u: number, v: number, cx: number, cy: number, rx: number, ry: number) =>
  ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;

/** The anglerfish's shape, in its own 46x30 space, facing left. */
const angler = {
  lure: { x: 6, y: 2 },
  body: (u: number, v: number) =>
    inEllipse(u, v, 27, 14, 13, 10.5) || // belly
    inEllipse(u, v, 18, 10, 8, 5.5) || // upper jaw
    inEllipse(u, v, 17, 20, 11, 5) || // lower jaw, jutting out
    (u >= 38 && u <= 45 && Math.abs(v - 14) <= (u - 38) * 0.9 + 1), // tail
  upperLip: (u: number) => 15 - (22 - u) * 0.22,
  lowerLip: (u: number) => 15 + (22 - u) * 0.3,
};

/** A lure first, then, when it is close enough, the teeth behind it. */
function drawAngler(frame: Frame, fish: Angler, water: Uint8Array, time: number, lights: Light[], worse: boolean) {
  const s = fish.scale * (worse ? GROWN : 1);
  const left = Math.round(fish.x);
  const top = Math.round(fish.y + Math.sin(fish.age * 0.9) * 2);
  for (let py = 0; py < 30 * s; py++) {
    const y = top + py;
    if (y < 0 || y >= frame.height) continue;
    const row = water[y]!;
    const hide = row === 0 ? 1 : row - 1; // the body: one shade off the water
    for (let px = 0; px < 46 * s; px++) {
      const u = (px + 0.5) / s;
      const v = (py + 0.5) / s;
      const near = Math.hypot(u - angler.lure.x, v - angler.lure.y);
      const inside = angler.body(u, v);
      const column = Math.floor(u);
      if (u > 4 && u < 22 && v > angler.upperLip(u) && v < angler.lowerLip(u)) {
        // The open mouth: needle teeth on every other column, and a dim red throat.
        const upper = angler.upperLip(column + 0.5);
        const lower = angler.lowerLip(column + 0.5);
        const upperTooth = angler.body(column + 0.5, upper - 0.5) && v - upper < 2 + Math.floor(hash(column, 1) * 2) + (column < 12 ? 1 : 0);
        const lowerTooth = angler.body(column + 0.5, lower + 0.5) && lower - v < 3 + Math.floor(hash(column, 2) * 2) + (column < 10 ? 1 : 0);
        // Turned, the teeth are long and pale, blood runs from them, and the throat glows red.
        if (column % 2 === 1 && (upperTooth || lowerTooth)) frame.put(left + px, y, worse ? 16 : near < 16 ? 7 : 6);
        else if (worse && column % 4 === 1 && v - upper < 6 + hash(column, 3) * 4) frame.put(left + px, y, 12);
        else if (inside) frame.put(left + px, y, dither(left + px, y, 0.5) ? (worse ? 18 : 12) : worse ? 12 : 0);
      } else if (worse && (column === 20 || column === 21) && (Math.floor(v) === 8 || Math.floor(v) === 9)) {
        frame.emit = 200;
        frame.put(left + px, y, column === 21 && Math.floor(v) === 8 ? 0 : 18); // the eye, red round a black pupil
        frame.emit = 0;
      } else if (column === 21 && Math.floor(v) === 8) {
        frame.put(left + px, y, 7); // the eye
      } else if (inside) {
        const rim = !angler.body(u - 1, v) || !angler.body(u, v - 1);
        frame.put(left + px, y, rim ? (worse || near < 18 ? 12 : Math.min(3, row + 1)) : hide);
      }
    }
  }
  // The stalk, arching forward from the top of the head to the lure.
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    const u = (1 - t) ** 2 * 22 + 2 * t * (1 - t) * 13 + t * t * angler.lure.x;
    const v = (1 - t) ** 2 * 4.5 + 2 * t * (1 - t) * -7 + t * t * angler.lure.y;
    const y = top + Math.round(v * s);
    frame.put(left + Math.round(u * s), y, Math.min(3, (water[y] ?? 0) + 1));
  }
  const lureX = left + angler.lure.x * s;
  const lureY = top + angler.lure.y * s;
  frame.emit = 255;
  for (let j = -s; j <= s; j++) {
    for (let i = -s; i <= s; i++) {
      if (Math.abs(i) + Math.abs(j) <= s) frame.put(lureX + i, lureY + j, i === 0 && j === 0 ? 16 : 18);
    }
  }
  frame.emit = 0;
  lights.push({ x: lureX + 0.5, y: lureY + 0.5, radius: 26 * s, rgb: [235, 70, 100], strength: 0.42 + 0.1 * Math.sin(time * 6) });
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => clamp01(x) ** 2 * (3 - 2 * clamp01(x));

/** How far off the giant anglerfish is, in widths of its head's half: its size on screen goes as one over this. */
function distance(age: number): number {
  if (age < GLIDE) return 30 * (5 / 30) ** (age / GLIDE);
  return 5 - 3.4 * (1 - (1 - Math.min(1, (age - GLIDE) / (WIDE - GLIDE))) ** 2);
}

/**
 * How the giant anglerfish's face is drawn at a moment: the middle of its mouth on screen, how far off it is, how open
 * its mouth and how much of it and of its eyes shows, and whether it is nearer than the diver.
 */
type Pose = { cx: number; cy: number; away: number; open: number; reveal: number; eyes: number; near: boolean };
type Behind = (x: number, y: number) => boolean;

/**
 * The giant anglerfish, face on, coming at the diver, bloodied. Far off it is only its red lure; nearer, the lure lights
 * its face, then its eyes, and its mouth opens round the diver. Then the screen goes dark.
 */
function drawLeviathan(frame: Frame, fish: Leviathan, focus: { x: number; y: number }, water: Uint8Array, lights: Light[], behindWords: Behind) {
  const { width: W, height: H } = frame;
  if (fish.age >= WIDE) {
    const dark = 1 - clamp01((fish.age - LET_GO) / THIN);
    frame.block = 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dither(x, y, dark)) frame.put(x, y, 0);
    frame.block = -1;
    // Its face slams back at the screen out of the dark, shaking, and its jaws shut on it.
    const k = (fish.age - SCARE) / SCARE_SECONDS;
    if (k >= 0 && k < 1) {
      const shake = (seed: number) => (hash(Math.floor(fish.age * 40), seed) - 0.5) * 8 * (1 - k);
      const pose = { cx: W / 2 + shake(1), cy: H * 0.55 + shake(2), away: 1 - 0.3 * clamp01(k * 4), open: Math.max(0.08, 1 - clamp01((k - 0.55) / 0.25)), reveal: 1, eyes: 1, near: true };
      drawFace(frame, fish, pose, water, lights, behindWords);
    }
    return;
  }
  const away = distance(fish.age);
  const toward = smooth(fish.age / WIDE);
  drawFace(frame, fish, {
    cx: fish.x + (focus.x - fish.x) * toward,
    cy: fish.y + (focus.y - fish.y) * toward,
    away,
    open: 0.3 + 0.7 * smooth((5 - away) / 3.4) + 0.04 * Math.sin(fish.age * 1.7),
    reveal: clamp01((9 - away) / 5),
    eyes: clamp01((4 - away) / 1.5),
    near: false,
  }, water, lights, behindWords);
}

/** The face, in units of half its head's width, from the middle of its mouth. */
function drawFace(frame: Frame, fish: Leviathan, { cx, cy, away, open, reveal, eyes, near }: Pose, water: Uint8Array, lights: Light[], behindWords: Behind) {
  const { width: W, height: H } = frame;
  const s = (H * 0.5) / away;
  const lureU = 0.08 + 0.05 * Math.sin(fish.age * 1.1);
  const lureV = -0.55 + 0.03 * Math.sin(fish.age * 1.6);
  const lure = { x: cx + lureU * s, y: cy + lureV * s };
  const reach = 6 + 0.95 * s;
  const lit = (x: number, y: number) => clamp01(1 - Math.hypot(x - lure.x, y - lure.y) / reach) ** 1.3 * reveal;
  // Behind the words it is never brighter than the water near the surface, so they stay readable.
  const put = (x: number, y: number, color: number) => frame.put(x, y, behindWords(x, y) ? Math.min(color, 4) : color);
  const shown = (x: number, y: number) => near || dither(x, y, reveal);
  const mouthY = 0.08;
  const mouthH = 0.55 * open;
  const lip = (u: number) => mouthH * Math.sqrt(Math.max(0, 1 - (u / 0.92) ** 2));

  // The head, and the mouth: dark, with the gums red where the lure reaches.
  if (reveal > 0) {
    const [left, right] = [Math.max(0, Math.floor(cx - 1.4 * s)), Math.min(W - 1, Math.ceil(cx + 1.4 * s))];
    const [top, bottom] = [Math.max(0, Math.floor(cy - 1.3 * s)), Math.min(H - 1, Math.ceil(cy + 1 * s))];
    for (let y = top; y <= bottom; y++) {
      const hide = Math.max(1, (water[y] ?? 0) - 1);
      for (let x = left; x <= right; x++) {
        if (!shown(x, y)) continue;
        const u = (x + 0.5 - cx) / s;
        const v = (y + 0.5 - cy) / s;
        const mouth = (u / 0.92) ** 2 + ((v - mouthY) / mouthH) ** 2;
        // The throat swallows the light that falls into it.
        if (mouth <= 1) {
          frame.block = 255;
          // The gums are bloody and the throat glows a dark red.
          const gums = mouth > 0.75 && lit(x, y) > 0.12 && dither(x, y, 0.6);
          put(x, y, gums ? 18 : dither(x, y, (0.3 - mouth) * 1.3) ? 12 : 0);
          frame.block = near ? 224 : -1;
          continue;
        }
        // A ragged outline: warts and flaps of skin, and a lower jaw that juts out wider than the head.
        const angle = Math.atan2(v, u);
        const rag = 1 + 0.07 * (hash(Math.floor((angle + 4) * 9), 21) - 0.5) + 0.04 * Math.sin(angle * 13);
        const head = ((u / (1.25 * rag)) ** 2 + ((v + 0.15) / (1.05 * rag)) ** 2) <= 1;
        const jaw = ((u / (1.12 * rag)) ** 2 + ((v - 0.32) / (0.58 * rag)) ** 2) <= 1;
        if (!head && !jaw) continue;
        if (near) frame.block = 224;
        // Mottled skin, in specks that keep to the fish.
        const mottled = hash(Math.floor((x - Math.round(cx)) / 2), Math.floor((y - Math.round(cy)) / 2)) < 0.2;
        const light = lit(x, y) * (mottled ? 0.55 : 1);
        put(x, y, light > 0.38 || (light > 0.18 && dither(x, y, (light - 0.18) / 0.2)) ? 12 : light > 0.08 ? 3 : hide);
      }
    }
  }

  // Needle teeth: the upper ones hang in, the longer lower ones splay out.
  if (near) frame.block = 224;
  if (reveal > 0.3) {
    for (const upper of [true, false]) {
      const count = upper ? 12 : 9;
      for (let i = 0; i < count; i++) {
        const u = -0.84 + (1.68 * (i + 0.5)) / count + (hash(i, upper ? 11 : 12) - 0.5) * 0.06;
        const rootV = mouthY + (upper ? -lip(u) : lip(u));
        const long = (upper ? 0.16 + 0.2 * hash(i, 13) : 0.22 + 0.3 * hash(i, 14)) * (1 - 0.45 * Math.abs(u)) * (0.6 + 0.4 * open);
        const lean = upper ? -u * 0.3 : u * 0.35;
        const steps = Math.ceil(long * s * 1.5) + 1;
        const wide = Math.max(0.5, 0.035 * s);
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const x = cx + (u + lean * t * long) * s;
          const y = Math.round(cy + (rootV + (upper ? t : -t) * long) * s);
          const light = lit(x, y);
          // Stained red from the gums.
          const color = t < 0.35 ? (light > 0.15 ? 18 : 12) : light > 0.35 ? 16 : light > 0.15 ? 7 : light > 0.05 ? 6 : 5;
          const half = wide * (1 - t);
          for (let px = Math.round(x - half); px <= Math.round(x + half); px++) if (shown(px, y)) put(px, y, color);
        }
        // And blood drips from the tips of some of the upper ones, longer as it comes.
        if (upper && hash(i, 15) < 0.5) {
          const tipX = Math.round(cx + (u + lean * long) * s);
          const tipY = Math.round(cy + (rootV + long) * s);
          const drip = Math.floor((0.05 + 0.15 * hash(i, 16)) * s * clamp01((fish.age - 6) / 5));
          for (let j = 1; j <= drip; j++) if (shown(tipX, tipY + j)) put(tipX, tipY + j, j === drip ? 18 : 12);
        }
      }
    }
  }

  // Small bloodshot eyes, each slit by a black pupil, and blood running down from them: the last thing to show.
  if (eyes > 0) {
    const r = Math.max(1, 0.065 * s);
    for (const side of [-1, 1]) {
      const ex = cx + side * 0.58 * s;
      const ey = cy - 0.5 * s;
      frame.emit = 200;
      for (let y = Math.floor(ey - r); y <= Math.ceil(ey + r); y++) {
        for (let x = Math.floor(ex - r); x <= Math.ceil(ex + r); x++) {
          const dx = (x + 0.5 - ex) / r;
          const d = Math.hypot(dx, (y + 0.5 - ey) / r);
          if (d <= 1 && dither(x, y, eyes)) put(x, y, r >= 2 && Math.abs(dx) < 0.22 && d < 0.8 ? 0 : d > 0.75 ? 12 : 18);
        }
      }
      frame.emit = 0;
      const run = Math.floor(0.35 * s * eyes);
      const bx = Math.round(ex + side * r * 0.3);
      for (let j = 1; j <= run; j++) put(bx, Math.round(ey + r) + j, j === run ? 18 : 12);
    }
  }

  // The stalk, rising from the top of the head and arching forward, down to the lure that hangs before the face.
  const steps = Math.ceil(2 * s) + 4;
  const thick = Math.round(0.02 * s);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const u = 2 * t * (1 - t) * 0.45 + t * t * lureU;
    const v = (1 - t) ** 2 * -1.15 + 2 * t * (1 - t) * -1.9 + t * t * lureV;
    const x = Math.round(cx + u * s);
    const y = Math.round(cy + v * s);
    const light = lit(x, y);
    for (let i = -thick; i <= thick; i++) if (shown(x + i, y)) put(x + i, y, light > 0.4 ? 5 : light > 0.15 ? 4 : 3);
  }
  frame.block = -1;

  // The lure: a spark far off that grows and brightens as it nears.
  const r = 0.07 * s;
  frame.emit = 255;
  for (let y = Math.floor(lure.y - r); y <= Math.ceil(lure.y + r); y++) {
    for (let x = Math.floor(lure.x - r); x <= Math.ceil(lure.x + r); x++) {
      const d = Math.hypot(x + 0.5 - lure.x, y + 0.5 - lure.y);
      if (behindWords(x, y) || (r >= 1 ? d > r : x !== Math.round(lure.x) || y !== Math.round(lure.y))) continue;
      frame.put(x, y, r < 1 ? (away > 18 ? 13 : 18) : d < r * 0.5 ? 16 : 18);
    }
  }
  frame.emit = 0;
  lights.push({ x: lure.x + 0.5, y: lure.y + 0.5, radius: reach, rgb: [235, 50, 60], strength: Math.min(0.6, 0.15 + 1.8 / away) });
}
