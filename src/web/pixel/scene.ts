import { METERS_PER_POINT } from "../../shared/types";
import { ZONES, formatMeters, lightOf } from "../depth";
import { AIR_SECONDS, ascentSeconds, type Game } from "../state";
import { Ambient } from "./creatures";
import { FONTS, drawText, fit, measure, plain, wrap, type Font } from "./font";
import { dither, hash, type Frame, type Light } from "./frame";

const METERS_PER_PIXEL = 5;
const CHAIN_X = 84;
const LAMP_X = 76;
const DIVER_X = 84;
/** In the last third of the air, the diver is in trouble and the screen shows it. */
const LOW_AIR = AIR_SECONDS / 3;
/** World rows count down from the diver's position at 0 m. The waterline is just above it. */
const SURFACE_ROW = -14;
const FLOOR_ROW = 11000 / METERS_PER_PIXEL + 26;
/** Rows of rock generated above row 0, so that array indices stay positive. */
const PAD = 300;
const ROWS = PAD + FLOOR_ROW + 300;

const LAMP_LIT = [".rRo.", "rRRRo", ".aca.", ".ccc.", ".aca.", "rRRRo"];
const LAMP_DEAD = [".555.", "56665", "5...5", "5.x..", "5...5", "56665"];
const LANTERN = [".rRo.", "rRRRo", ".aca.", "accca", ".aca.", "rRRRo", ".rRo."];
/** A small light that stays with the lamp it woke at. */
const FRY = [".m.", "mwm", "T.T"];
const ARROW = ["77777", ".777.", "..7.."];
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

/** Draws the whole game: the trench, what lives in it, the diver and the few words on screen. */
export class Scene {
  /** The depth on screen, which eases towards the game's real depth. */
  depth = 0;
  ambient = new Ambient();
  private camera = 0;
  private rock = buildRock();
  private water = new Uint8Array(0);
  /** The span of words on each screen row last frame, so lines in the water can break behind them. */
  private wordsFrom = new Int16Array(0);
  private wordsTo = new Int16Array(0);
  private snow: { x: number; y: number; k: number }[] = [];
  private bubbles: { x: number; y: number; size: number; phase: number }[] = [];
  private nextBubble = 0;
  /** When each lit lamp was reached, by its index. */
  private reached = new Map<number, number>();
  /** How starved of air the diver is, from 0 (fine) to 1 (out). */
  private panic = 0;
  private pulse = 0;

  /** Draw one frame and return the soft lights to lay over it. */
  draw(frame: Frame, game: Game, dt: number, time: number): Light[] {
    const { width: W, height: H } = frame;
    const gap = game.depth - this.depth;
    if (game.phase === "ascent") {
      // The dive is over: the diver is hauled back up the line, past every lamp, gently at both ends.
      const t = Math.min(1, game.phaseTime / ascentSeconds(game.depth));
      this.depth = game.depth * (1 - t * t * (3 - 2 * t));
    } else if (game.phase === "done") {
      this.depth = 0;
    } else {
      // Ease towards the real depth, but never slower than 25 m/s, so the dive actually arrives.
      const eased = gap * (1 - Math.exp(-dt * 1.6));
      const least = Math.sign(gap) * Math.min(Math.abs(gap), 25 * dt);
      this.depth += Math.abs(eased) > Math.abs(least) ? eased : least;
    }
    const diving = Math.abs(gap) > 4;
    const camera = Math.round(this.depth / METERS_PER_PIXEL);
    const scroll = camera - this.camera;
    this.camera = camera;

    const base = Math.round(H * 0.36); // screen row of the diver's world row
    const rowAt = (y: number) => camera + y - base;
    const screenY = (row: number) => row - camera + base;
    const diverY = base + (diving ? 0 : Math.round(Math.sin(time * 1.3)));

    // ---- what is lit, and by what
    if (game.lamps.length === 0 && this.reached.size > 0) {
      this.reached.clear();
      this.ambient.clear();
    }
    const lamps = game.lamps.flatMap((lamp, i) => {
      if (lamp.lit && !this.reached.has(i) && this.depth >= lamp.depth - 2) this.reached.set(i, time);
      const reachedAt = this.reached.get(i);
      if (lamp.lit && reachedAt === undefined) return [];
      const stacked = game.lamps.slice(0, i).filter((other) => other.depth === lamp.depth).length;
      const y = screenY(Math.round(lamp.depth / METERS_PER_PIXEL)) + 2 + stacked * 10;
      if (y < -70 || y > H + 70) return [];
      // Older lamps burn lower; a lamp flares as it is lit.
      const newer = game.lamps.slice(i + 1).filter((other) => other.lit).length;
      const flare = Math.max(0, 1 - (time - (reachedAt ?? 0)) / 0.9);
      return [{ lit: lamp.lit, y, glow: Math.max(0.34, 0.78 - 0.11 * newer) * (1 + flare) }];
    });

    // Running low on air: the lantern sputters and the dark begins to pulse red.
    const starved = game.phase === "ask" ? Math.max(0, 1 - game.air / LOW_AIR) : 0;
    this.panic += (starved - this.panic) * Math.min(1, dt * 5);
    this.pulse += dt * (1.2 + this.panic * 1.6) * Math.PI * 2;
    const beat = Math.max(0, Math.sin(this.pulse)) ** 2;
    const sputter = 1 - this.panic * (0.45 + 0.3 * Math.max(0, Math.sin(time * 31) * Math.sin(time * 7.7)));

    const lantern = { x: DIVER_X + 18.5, y: diverY + 19.5 };
    const warm: Lit[] = [{ ...lantern, r: 62 * (1 - 0.3 * this.panic), i: 1 }];
    for (const lamp of lamps) if (lamp.lit) warm.push({ x: LAMP_X + 2.5, y: lamp.y + 2.5, r: 30 + lamp.glow * 14, i: Math.min(0.95, lamp.glow) });

    const flicker = (0.95 + 0.05 * Math.sin(time * 9) * Math.sin(time * 5.3)) * sputter;
    const lights: Light[] = [
      { ...lantern, radius: 74 * (1 - 0.3 * this.panic), rgb: [255, 150, 60], strength: 0.62 * flicker },
      { ...lantern, radius: 22, rgb: [255, 220, 150], strength: 0.45 * flicker },
    ];
    for (const lamp of lamps) {
      if (lamp.lit) lights.push({ x: LAMP_X + 2.5, y: lamp.y + 3, radius: 16 + lamp.glow * 20, rgb: [255, 140, 60], strength: 0.12 + lamp.glow * 0.4 });
    }
    if (this.panic > 0.01) {
      const strength = this.panic * (0.3 + 0.9 * beat);
      const radius = Math.min(W, H) * 0.9;
      const edges = [[W / 2, -radius / 6], [W / 2, H + radius / 6]];
      if (W > H) edges.push([W + radius / 6, H / 2]);
      for (const [x, y] of edges) lights.push({ x: x!, y: y!, radius, rgb: [210, 40, 70], strength });
    }

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
      const depth = row * METERS_PER_PIXEL;
      // Each stretch of water blends from one colour to the next by dithering.
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

    // ---- the boat the line hangs from
    const surface = screenY(SURFACE_ROW);
    if (surface > -20 && surface < H + 20) {
      frame.block = 224;
      for (let j = 0; j < 7; j++) for (let x = 60 + j; x <= 134 - j; x++) frame.put(x, surface - 6 + j, j === 0 ? 3 : 0);
      for (let j = 0; j < 7; j++) for (let x = 98; x <= 118; x++) frame.put(x, surface - 13 + j, j === 0 ? 3 : 0);
      frame.sprite(["aa....aa"], 102, surface - 10, "a");
      frame.block = -1;
    }

    // ---- the far wall of the trench: a darker dark
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      if (row <= SURFACE_ROW) continue;
      const reach = this.rock.far[Math.min(ROWS - 1, row + PAD)]!;
      for (let x = W - reach; x < W; x++) frame.put(x, y, Math.max(0, water[y]! - 1));
    }

    // ---- far lights: other lives, a long way off
    for (let cy = Math.floor(rowAt(0) / 24); cy <= Math.floor(rowAt(H) / 24); cy++) {
      if (cy * 24 * METERS_PER_PIXEL < 800) continue;
      for (let cx = 4; cx * 24 < W; cx++) {
        const chance = hash(cx * 7 + 3, cy);
        const out = hash(cx + Math.floor(time * 0.7) * 31, cy) < 0.15;
        if (chance > 0.3 || out) continue;
        const x = cx * 24 + Math.floor(hash(cx, cy * 3 + 1) * 24);
        const row = cy * 24 + Math.floor(hash(cx * 5, cy) * 24);
        frame.put(x, screenY(row), chance < 0.15 ? 8 : 17);
      }
    }

    // ---- whatever is out there
    this.ambient.update(dt, this.depth, scroll, W, H);
    this.ambient.draw(frame, water, time, lights);

    // ---- marine snow, tinted by whichever light it drifts through
    const flakes = Math.round((W * H) / 250);
    while (this.snow.length < flakes) this.snow.push({ x: Math.random() * W, y: Math.random() * H, k: Math.random() });
    this.snow.length = flakes;
    for (const flake of this.snow) {
      flake.y = (((flake.y + (2 + flake.k * 4) * dt - scroll * (0.7 + 0.3 * flake.k)) % H) + H) % H;
      flake.x = (((flake.x + Math.sin(time * 0.4 + flake.k * 20) * dt * 1.5) % W) + W) % W;
      const x = Math.floor(flake.x);
      const y = Math.floor(flake.y);
      if (rowAt(y) <= SURFACE_ROW) continue;
      const w = light(warm, x, y);
      const tint = w > 0.42 ? 16 : w > 0.2 ? 15 : w > 0.08 ? 14 : w > 0.03 ? 13 : 0;
      frame.put(x, y, tint || (flake.k < 0.22 ? 4 : 3));
    }

    // ---- zone boundaries: a thin line across the water
    const boundaries = ZONES.slice(1).map((zone) => ({ ...zone, y: screenY(zone.from / METERS_PER_PIXEL) }));
    for (const { y } of boundaries) {
      if (y < 0 || y >= H) continue;
      for (let x = 0; x < W; x++) if (x % 5 !== 2 && x % 5 !== 4 && !behindWords(x, y)) frame.put(x, y, x % 5 < 2 ? 5 : 3);
    }

    // ---- the near wall: a silhouette, lit only where a lamp reaches
    frame.block = 224;
    for (let y = 0; y < H; y++) {
      const row = rowAt(y);
      if (row >= FLOOR_ROW) {
        for (let x = 0; x < W; x++) frame.put(x, y, row === FLOOR_ROW ? (hash(x, 3) < 0.35 ? 5 : 3) : hash(x >> 1, row) < 0.12 ? 1 : 0);
        continue;
      }
      const r = Math.max(1, Math.min(ROWS - 2, row + PAD));
      const edge = this.rock.edge[r]!;
      const above = this.rock.edge[r - 1]!;
      const below = this.rock.edge[r + 1]!;
      const band = this.rock.band[r]!;
      const [slab, offset] = this.rock.bands[band]!;
      const lean = hash(band, -999);
      for (let x = 0; x <= edge; x++) {
        const grain = hash(band, Math.floor((x + offset) / slab));
        const crack = (this.rock.bandTop[r] === 1 && grain > 0.3) || ((x + offset) % slab === 0 && grain > 0.55);
        const lit = rockLight(x - (lean - 0.5) * 9, y) + (lean - 0.5) * 0.05 + (grain - 0.5) * 0.03;
        const rim = x === edge || x > above || x > below;
        let level = lit > 0.29 ? 3 : lit > 0.165 ? 2 : lit > 0.085 ? 1 : 0;
        if (crack && !rim) level = Math.max(0, level - 1);
        frame.put(x, y, (rim ? [2, 12, 13, 14] : [0, 1, 12, 13])[level]!);
      }
      // Snow settles on the ledges.
      for (let x = above + 1; x <= edge; x++) {
        const lit = rockLight(x, y);
        frame.put(x, y, lit > 0.3 ? 15 : lit > 0.17 ? 14 : lit > 0.08 ? 13 : 3);
      }
    }

    // Each zone is named on the rock where it begins, like a depth mark.
    frame.block = -1;
    for (const zone of boundaries) {
      drawText(frame, FONTS.tiny, zone.name.replace(" zone", ""), 4, zone.y + 4, 6);
      drawText(frame, FONTS.tiny, formatMeters(zone.from), 4, zone.y + 12, 5);
    }

    // ---- the line and its lamps
    frame.block = 166;
    for (let y = Math.max(0, surface); y < H; y++) {
      const row = rowAt(y);
      if (row >= FLOOR_ROW) break;
      let near = 99;
      for (const l of warm) near = Math.min(near, Math.abs(y - l.y) / (l.i < 1 ? l.i * 0.9 + 0.2 : 2.2));
      const link = ((row % 3) + 3) % 3 !== 2;
      let color = link ? 5 : 3;
      if (near < 3) color = link ? 15 : 14;
      else if (near < 7) color = link ? 14 : 13;
      else if (near < 11) color = link ? 13 : 12;
      else if (y > diverY + 29) color = link ? ((y - diverY - 29) / (H - diverY - 29) > 0.5 ? 3 : 4) : 2;
      frame.put(CHAIN_X, y, color);
    }
    for (const lamp of lamps) {
      for (let x = LAMP_X + 5; x < CHAIN_X; x++) frame.put(x, lamp.y, lamp.lit ? 13 : 5);
      if (lamp.lit) {
        frame.sprite(LAMP_LIT, LAMP_X, lamp.y, "ac");
        frame.emit = 150;
        frame.sprite(FRY, LAMP_X + 1, lamp.y + 8);
        frame.emit = 0;
      } else {
        frame.sprite(LAMP_DEAD, LAMP_X, lamp.y);
        frame.put(LAMP_X + 5, lamp.y + 4, 5); // shards
        frame.put(LAMP_X + 3, lamp.y + 7, 5);
      }
    }
    frame.block = -1;

    // ---- bubbles climbing the line from the helmet
    this.nextBubble -= dt;
    if (this.nextBubble <= 0) {
      this.nextBubble = (0.5 + Math.random() * 0.9) * (1 - 0.7 * this.panic);
      this.bubbles.push({ x: DIVER_X + 11 + Math.random() * 3, y: diverY - 3, size: 1 + Math.floor(Math.random() * 3), phase: Math.random() * 6 });
    }
    this.bubbles = this.bubbles.filter((bubble) => {
      bubble.y -= 13 * dt + scroll;
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

    // ---- the diver, lantern in hand
    frame.block = 178;
    frame.sprite(["rRo"], DIVER_X + 8, diverY - 1);
    frame.sprite(DIVER, DIVER_X, diverY);
    frame.put(DIVER_X + 18, diverY + 16, 13);
    frame.sprite(LANTERN, DIVER_X + 16, diverY + 17, "ac");
    frame.block = -1;

    this.drawWords(frame, game, time, base, diving);
    return lights;
  }

  /** The few words on screen. They sit in the dark to the right of the diver. */
  private drawWords(frame: Frame, game: Game, time: number, base: number, diving: boolean) {
    const { width: W, height: H } = frame;
    const { tiny, medium, large, huge } = FONTS;
    const wide = W >= 300;
    const x = wide ? 170 : 112;
    const room = W - x - 8;
    const answerY = base + (wide ? 10 : 52);
    const amber = (tall: number) => (row: number) => (row < tall * 0.3 ? 16 : row < tall * 0.8 ? 15 : 14);

    // Remember where the words are, with a little room around them.
    this.wordsFrom.fill(W);
    this.wordsTo.fill(-1);
    const cover = (from: number, to: number, top: number, bottom: number) => {
      for (let y = Math.max(0, top - 2); y <= Math.min(H - 1, bottom + 2); y++) {
        this.wordsFrom[y] = Math.min(this.wordsFrom[y]!, from - 4);
        this.wordsTo[y] = Math.max(this.wordsTo[y]!, to + 3);
      }
    };
    const say = (font: Font, text: string, tx: number, ty: number, color: Parameters<typeof drawText>[5], right = false) => {
      const end = drawText(frame, font, text, tx, ty, color, right);
      cover(right ? tx - measure(font, text) : tx, right ? tx : end, ty, ty + font.height + 1);
      return end;
    };
    const key = (kx: number, ky: number, label: string) => cover(kx, drawKey(frame, kx, ky, label), ky, ky + 8);

    if (game.phase === "title") {
      const font = fit([huge, large], "HADAL", room);
      const tall = font.height;
      frame.emit = 110;
      say(font, "HADAL", x, base - 4, amber(tall));
      frame.emit = 0;
      say(tiny, "Rare answers sink deeper", x, base + tall + 2, 6);
      key(x, base + tall + 14, "Descend");
      return;
    }

    const depth = formatMeters(this.depth).toUpperCase();
    frame.emit = 255;
    say(large, depth, W - 8, H - 22, amber(14), true);
    frame.emit = 0;
    say(tiny, "Depth", W - 8 - measure(large, depth) - 5, H - 13, 6, true);

    // The prompt, and the air left to answer it. A finished dive has none, only the depth unwinding.
    const prompt = game.prompts[game.round];
    if (!prompt) return;
    const asking = game.phase === "ask";
    say(tiny, `${prompt.pack} ~ ${game.round + 1} of ${game.prompts.length}`, x, 11, 6);
    const lines = wrap(medium, plain(prompt.text), room);
    lines.forEach((line, i) => say(medium, line, x, 21 + i * 11, asking ? 7 : 6));
    if (asking) {
      const y = 21 + lines.length * 11 + 4;
      const low = game.air <= LOW_AIR;
      const left = Math.ceil((game.air / AIR_SECONDS) * 15);
      const blink = Math.floor(time * (low ? 5 : 2)) % 2 === 0;
      const pitch = room >= 100 ? 4 : 3;
      const start = say(tiny, "Air", x, y, low ? 18 : 6) + 4;
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

    // The answer: typed in pale steel, then mint if it lit the lamp or rose if it did not.
    const result = game.result;
    if (!result) {
      const typed = plain(game.input);
      const font = fit([large, medium, tiny], `${typed}_`, room);
      const end = say(font, typed, x, answerY, 7);
      if (Math.floor(time * 2.5) % 2 === 0) {
        frame.emit = 200;
        for (let j = 0; j < font.height; j++) for (let i = 0; i < (font === large ? 2 : 1); i++) frame.put(end + i, answerY + j, 16);
        frame.emit = 0;
      }
      // A wrong answer is named briefly; the diver can try again while the air lasts.
      const rejected = game.rejected;
      if (rejected && game.phaseTime - rejected.at < 1.6) {
        say(tiny, `${plain(rejected.text).slice(0, 18)} ~ no light`, x, answerY + font.height + 7, 18);
      }
    } else {
      const text = result.correct ? plain(result.answer) : "Out of air";
      const font = fit([large, medium, tiny], text, room);
      const tall = font.height;
      frame.emit = result.correct ? 255 : 0;
      say(font, text, x, answerY, result.correct ? (row) => (row < tall * 0.22 ? 11 : row < tall * 0.8 ? 10 : 9) : 18);
      let y = answerY + tall + 7;
      const gain = `+${formatMeters(result.rarity * METERS_PER_POINT)}`;
      const note = result.correct ? `~ ${lightOf(result.rarity)}` : "";
      const end = say(tiny, result.correct ? gain : "No light", x, y, result.correct ? 10 : 18);
      frame.emit = 0;
      // The note goes beside the gain, or beneath it on a narrow screen.
      if (end + 3 + measure(tiny, note) > W - 4) say(tiny, note, x, (y += 8), result.correct ? 9 : 5);
      else say(tiny, note, end + 3, y, result.correct ? 9 : 5);
      if (!diving && game.phaseTime > 0.6) {
        key(x, y + 12, game.round + 1 === game.prompts.length ? "End the dive" : "Keep going");
      }
    }
  }
}

/** A drawn Enter key, with what pressing it does. Returns the x where it ends. */
function drawKey(frame: Frame, x: number, y: number, label: string) {
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
