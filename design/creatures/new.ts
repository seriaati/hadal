// Draws the new creatures as lit, rounded bodies in the game's style, and prints them as sprite rows for the bestiary page.
import { Frame, hash, type Light } from "../../src/web/pixel/frame";

type Hit = { h: number; nx: number; ny: number; nz: number; u: number; v: number };
type Part = {
  ramp: number[];
  hit: (x: number, y: number) => Hit | null;
  /** Clear, like glass: only its rim is lit, and the water darkens it within. */
  glass?: boolean;
  /** Overrides the colour of a pixel: given the shade as a fraction of the ramp, returns a palette colour or null. */
  paint?: (x: number, y: number, hit: Hit, level: number) => number | null;
  /** Sits this far nearer than its shape alone would put it. */
  lift?: number;
  /** How rounded it looks: 1 a full ball, 0 flat to the viewer. */
  bulge?: number;
};

const LIGHT = (() => {
  const [x, y, z] = [-0.35, -0.85, 0.5];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n] as const;
})();

function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0) {
  const [c, s] = [Math.cos(rot), Math.sin(rot)];
  return (x: number, y: number): Hit | null => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const lx = (dx * c + dy * s) / rx, ly = (-dx * s + dy * c) / ry;
    const d2 = lx * lx + ly * ly;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    return { h: nz * Math.min(rx, ry), nx: lx * c - ly * s, ny: lx * s + ly * c, nz, u: lx, v: ly };
  };
}

/** A tube along `points`, its radius going from `r0` to `r1`. `u` runs 0 to 1 along it. */
function tube(points: [number, number][], r0: number, r1: number) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = lengths.at(-1)!;
  return (x: number, y: number): Hit | null => {
    let best: Hit | null = null;
    const px = x + 0.5, py = y + 0.5;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
      const along = (lengths[i - 1]! + t * (lengths[i]! - lengths[i - 1]!)) / total;
      const r = r0 + (r1 - r0) * along;
      const dx = px - (ax + t * (bx - ax)), dy = py - (ay + t * (by - ay));
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d * d);
      const hit = { h: nz * r, nx: dx / r, ny: dy / r, nz, u: along, v: d };
      if (!best || hit.h > best.h) best = hit;
    }
    return best;
  };
}

function polygon(points: [number, number][], bulge = 0.3) {
  return (x: number, y: number): Hit | null => {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (!inside) return null;
    return { h: bulge, nx: 0, ny: -0.2, nz: 1, u: px, v: py };
  };
}

/** Flat colour blocks, as the game draws its creatures: a body colour, a block of shadow and a lit edge, never dithered. */
let water = 0;
const step = (level: number, ramp: number[]) => {
  // A step darker than the middle of the ramp, so they sit dim in the dark like the game's own, unless that would be the water itself.
  const middle = Math.round((ramp.length - 1) * 0.55);
  const mid = ramp[Math.max(1, middle - 1)] === water ? middle : Math.max(1, middle - 1);
  const tone = level < 0.35 ? -1 : level > 0.85 ? 1 : 0;
  const color = ramp[Math.max(0, Math.min(ramp.length - 1, mid + tone))]!;
  // A shadow is never black: like the game's anglerfish, it is one shade darker than the water, and fades into it.
  return color === 0 ? Math.max(0, water - 1) : color;
};

type Creature = { key: string; name: string; where: string; water: number; size: [number, number]; parts: Part[]; details?: (frame: Frame, lights: Light[]) => void; scale?: number };

/** Pixels per unit of a creature's own space: below 1 it is drawn coarser than it was designed. */
const SCALE = 0.6;

function render({ water: sea, size, parts, details, scale = SCALE }: Creature) {
  water = sea;
  const [w, h] = size;
  const [width, height] = [w, h].map((n) => Math.ceil(n * scale)) as [number, number];
  /** The point of the creature's own space under a pixel of the frame. */
  const own = (x: number, y: number): [number, number] => {
    const [fx, fy] = [(x + 0.5) / scale, (y + 0.5) / scale];
    return [fx - 0.5, fy - 0.5];
  };
  const frame = new Frame();
  frame.resize(width, height);
  frame.color.fill(water);
  const top: ({ part: Part; hit: Hit; index: number } | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best: { part: Part; hit: Hit; index: number } | null = null;
      parts.forEach((part, index) => {
        const hit = part.hit(...own(x, y));
        if (hit && (!best || hit.h + (part.lift ?? 0) >= best.hit.h + (best.part.lift ?? 0))) best = { part, hit, index };
      });
      top.push(best);
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? null : top[y * width + x]!);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = at(x, y);
      if (!here) continue;
      const { part, hit } = here;
      const bulge = part.bulge ?? 1;
      const [nx, ny, nz] = [hit.nx * bulge, hit.ny * bulge, hit.nz + (1 - bulge)];
      const n = Math.hypot(nx, ny, nz);
      let level = 0.12 + 0.88 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / n);
      // Light catches the upper edges; a part tucked under a nearer one sits in its shadow.
      const rim = !at(x, y - 1) || !at(x - 1, y);
      const over = at(x, y - 1);
      if (over && over.index !== here.index && over.hit.h + (over.part.lift ?? 0) > hit.h + (part.lift ?? 0) + 0.8) level = 0;
      else if (rim) level = 1;
      else if (part.glass) level = hit.nz > 0.55 ? 0 : 0.5;
      const painted = part.paint?.(...own(x, y), hit, level);
      frame.put(x, y, painted ?? step(level, part.ramp));
    }
  }
  const lights: Light[] = [];
  // Details are placed in the creature's own space, so they shrink with it.
  const coarse = {
    put: (x: number, y: number, c: number) => {
      frame.put(Math.floor((x + 0.5) * scale), Math.floor((y + 0.5) * scale), c);
    },
    set emit(v: number) { frame.emit = v; },
    get emit() { return frame.emit; },
  } as unknown as Frame;
  details?.(coarse, lights);
  return { frame, lights: lights.map((l) => ({ ...l, x: l.x * scale, y: l.y * scale, radius: l.radius * scale })) };
}

function bounds(frame: Frame, water: number) {
  let [x0, y0, x1, y1] = [frame.width, frame.height, -1, -1];
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    if (frame.color[y * frame.width + x] === water) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1] as const;
}

function rows(frame: Frame, water: number, [x0, y0, x1, y1]: readonly number[]) {
  const CHARS = "01234567tTmwrRoacvxgGl";
  const out: string[] = [];
  for (let y = y0!; y <= y1!; y++) {
    let row = "";
    for (let x = x0!; x <= x1!; x++) { const c = frame.color[y * frame.width + x]!; row += c === water ? "." : CHARS[c]; }
    out.push(row);
  }
  return out;
}

const glowAt = (frame: Frame, x: number, y: number, color: number, strength = 200) => {
  frame.emit = strength;
  frame.put(x, y, color);
  frame.emit = 0;
};

// Ramps run dark to light.
/** Frames in a loop of the tentacles' sway. `beat` runs once round the loop, 0 to 2π. */
const FRAMES = 8;

const nautilus = (beat: number): Creature => ({
  key: "nautilus", name: "Nautilus", where: "Twilight water", water: 3, size: [70, 50],
  parts: [
    {
      ramp: [2, 3, 4, 5, 6, 7], bulge: 0.55, hit: ellipse(44, 22, 19, 19),
      paint: (x, y, hit, level) => {
        const dx = x + 0.5 - 44, dy = y + 0.5 - 22;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        // The seam where the last whorl wraps over the one before, coiling in to the navel.
        const t = ((a + Math.PI) / (2 * Math.PI) + 1) % 1;
        for (let k = 0; k < 3; k++) {
          const r = 19 * Math.exp(-0.42 * (t + k) * 2);
          if (Math.abs(d - r) < 0.7 && r < 17.5 && r > 2) return step(level - 0.45, [1, 2, 3, 4]);
          if (d - r > 0.7 && d - r < 1.6 && r < 17.5 && r > 2) return step(level + 0.25, [3, 4, 5, 6, 7]);
        }
        if (d < 2.2) return step(level - 0.5, [1, 2, 3]);
        // Rust flames across the back of the shell, fading out before the opening.
        const fade = (a + Math.PI * 0.95) / (Math.PI * 1.7);
        const flame = Math.sin(a * 7 + d * 0.3);
        if (d > 7 && fade > 0 && fade < 1 && flame > 0.25 + fade * 0.55) return level < 0.35 ? 12 : 13;
        return null;
      },
    },
    {
      ramp: [0, 12, 13, 14], hit: ellipse(25, 26, 9, 8, -0.3), lift: 6,
    },
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i): Part => {
      const y0 = 28 + i * 1.1;
      const len = 9 + hash(i, 3) * 6;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        // A wave runs out along each tentacle, growing toward the tip; the root stays put.
        pts.push([21 - t * len, y0 + t * (2 + i * 0.9) + Math.sin(t * 4 + i * 1.7 - beat) * (0.5 + 1.3 * t) * t]);
      }
      return { ramp: [2, 3, 4, 5, 6], hit: tube(pts, 1.3, 0.5), lift: 2 + (i % 2) };
    }),
  ],
  details: (frame) => {
    frame.put(19, 23, 0); frame.put(20, 23, 0); frame.put(19, 24, 0); frame.put(20, 24, 0);
    glowAt(frame, 19, 23, 7, 60);
    frame.put(18, 22, 13); frame.put(19, 22, 13); frame.put(20, 22, 13); frame.put(21, 23, 13); frame.put(21, 24, 12);
  },
});

const squid = (beat: number): Creature => ({
  key: "squid", name: "Squid", where: "The deep", water: 2, size: [44, 80],
  parts: [
    { ramp: [1, 12, 17, 18], bulge: 0.4, hit: polygon([[22, 2], [33, 15], [22, 21], [11, 15]]), lift: -2,
      paint: (x, y, hit, level) => (Math.abs(x + 0.5 - 22) < 1 ? step(level - 0.2, [1, 12, 17]) : null) },
    { ramp: [0, 12, 17, 18], hit: ellipse(22, 25, 6, 21),
    },
    { ramp: [1, 12, 17, 18], hit: ellipse(22, 49, 5.5, 4.5) },
    { ramp: [0, 2, 5, 7], hit: ellipse(16.5, 48, 2.8, 3), lift: 2 },
    { ramp: [0, 2, 5, 7], hit: ellipse(27.5, 48, 2.8, 3), lift: 2 },
    ...[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map((k, i): Part => {
      const pts: [number, number][] = [];
      for (let s = 0; s <= 10; s++) {
        const t = s / 10;
        pts.push([22 + k * (1.2 + t * 1.9) + Math.sin(t * 6 + i * 1.3 - beat) * 1.6 * t, 52 + t * (17 - Math.abs(k) * 1.4)]);
      }
      return { ramp: [1, 12, 17, 18], hit: tube(pts, 1.4, 0.5), lift: Math.abs(k) < 2 ? 1 : 0 };
    }),
    // The two long tentacles, a club at each end, swaying a beat apart.
    ...[-1, 1].flatMap((side): Part[] => {
      const pts: [number, number][] = [];
      for (let s = 0; s <= 14; s++) {
        const t = s / 14;
        pts.push([22 + side * (4 + t * 9) + Math.sin(t * 4) * side * 2 + Math.sin(t * 3 - beat + side) * 2.2 * t, 52 + t * 22]);
      }
      const [cx, cy] = pts.at(-1)!;
      return [
        { ramp: [1, 12, 17, 18], hit: tube(pts, 0.9, 0.6), lift: -1 },
        { ramp: [12, 17, 18], hit: ellipse(cx + side * 0.6, cy + 1, 1.6, 2.6, side * 0.4) },
      ];
    }),
  ],
  details: (frame) => {
    for (const ex of [16, 27]) {
      frame.put(ex, 48, 0); frame.put(ex + 1, 48, 0); frame.put(ex, 49, 0); frame.put(ex + 1, 49, 0);
      glowAt(frame, ex, 47, 11, 120);
    }
  },
});

/** Its shadow stays maroon: in the near-black of the abyss, a shadow the colour of the water would swallow half of it. */
const DUMBO = [12, 13, 18];
const dumbo = (beat: number): Creature => ({
  key: "dumbo", name: "Dumbo octopus", where: "The abyss", water: 1, size: [60, 46],
  parts: [
    { ramp: DUMBO, hit: ellipse(30, 15, 15, 11) },
    ...[-1, 1].map((side): Part => ({ ramp: DUMBO, hit: ellipse(30 + side * 6, 4.5, 1.6, 2.2), lift: -1 })),
    // Short ones at the sides: out, then down, the tips flicking out.
    ...[-1, 1].map((side): Part => {
      const flick = Math.sin(beat + side) * 1.6;
      return { ramp: DUMBO, hit: tube([[30 + side * 11, 18], [30 + side * 16, 21], [30 + side * 18, 25 + flick * 0.5], [30 + side * (21 + flick * 0.4), 27 + flick]], 3.2, 1.2), lift: -2 };
    }),
    // Long ones under it, like legs, the outer two bowed out.
    ...[[-7, -4], [0, 0], [7, 4]].map(([dx, bow], i): Part => {
      const sway = (t: number) => Math.sin(beat + i * 2.1) * 1.5 * t;
      return {
        ramp: DUMBO, lift: -1,
        hit: tube([[30 + dx!, 22], [30 + dx! + bow! * 1.2 + sway(0.4), 30], [30 + dx! + bow! * 1.4 + sway(0.75), 37], [30 + dx! + bow! * 2 + sway(1), 40]], 3.6, 1.8),
      };
    }),
  ],
  details: (frame) => {
    // Columns chosen so that, scaled down, the two eyes land on mirrored pixels either side of the body's middle, glints outward.
    for (const [columns, glint] of [[[24, 25], 24], [[33, 35], 35]] as const) {
      for (const x of columns) for (let y = 13; y <= 16; y++) frame.put(x, y, 0);
      glowAt(frame, glint, 13, 7, 70);
    }
  },
});

const angel: Creature = {
  key: "angel", name: "Sea angel", where: "Twilight water", water: 3, size: [44, 50],
  parts: [
    ...[-1, 1].map((side): Part => ({ ramp: [4, 5, 6, 7], hit: ellipse(22 + side * 10, 19, 7.5, 3, side * 0.45), glass: true, lift: -3 })),
    { ramp: [4, 5, 6, 7], hit: ellipse(22, 10, 6.5, 6), glass: true },
    ...[-1, 1].map((side): Part => ({ ramp: [4, 5, 6, 7], hit: tube([[22 + side * 4, 7], [22 + side * 5.5, 2]], 1.6, 0.6) })),
    { ramp: [4, 5, 6, 7], hit: tube([[22, 15], [22, 26], [22, 38]], 7, 0.8), glass: true },
  ],
  details: (frame, lights) => {
    // The orange gut, showing through the clear body: two lobes, glowing.
    for (const [cx, cy, r] of [[22, 13, 2.3], [22, 18.5, 2.8]] as const) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
          if (d > 1) continue;
          glowAt(frame, x, y, d < 0.45 ? 15 : d < 0.8 ? 14 : 13, 140);
        }
      }
    }
    lights.push({ x: 22, y: 16, radius: 14, rgb: [217, 119, 47], strength: 0.3 });
  },
};

const dragon: Creature = {
  key: "dragon", name: "Blue dragon", where: "Twilight water", water: 3, size: [70, 44],
  parts: [
    { ramp: [1, 2, 5, 6, 7], hit: tube([[8, 22], [20, 21], [34, 22], [48, 23], [60, 24]], 3.6, 0.5),
      paint: (x, y, hit, level) => (hit.v < 0.35 && hit.ny < 0.2 && hit.ny > -0.6 ? step(level + 0.15, [5, 6, 7]) : null) },
    { ramp: [1, 2, 5, 6, 7], hit: ellipse(7, 22, 4.5, 3.8), lift: 1 },
    ...[-1, 1].map((side): Part => ({ ramp: [2, 5, 6, 7], hit: tube([[6, 22 - side * 2.5], [4, 22 - side * 5.5]], 0.9, 0.5) })),
    ...[[17, 11, 4], [29, 10, 4], [40, 8, 3]].flatMap(([bx, len, count]) =>
      [-1, 1].flatMap((side) =>
        Array.from({ length: count! }, (_, i): Part => {
          const a = -Math.PI / 2 * side + ((i / (count! - 1)) - 0.5) * 1.9 * side + 0.3;
          const l = len! * (0.75 + 0.25 * Math.cos(((i / (count! - 1)) - 0.5) * 2.2));
          const ex = bx! + Math.cos(a) * l, ey = 22 + Math.sin(a) * l * -1 * -1;
          return {
            ramp: [2, 5, 6, 7], hit: tube([[bx!, 22], [bx! + Math.cos(a) * l * 0.5 + 1, 22 + Math.sin(a) * l * 0.5], [ex + 2.5, ey]], 1.6, 0.7), lift: -1,
            paint: (x, y, hit, level) => (hit.u > 0.8 ? step(level + 0.3, [8, 9, 10]) : null),
          };
        }),
      ),
    ),
  ],
  details: (frame, lights) => {
    lights.push({ x: 24, y: 22, radius: 22, rgb: [111, 227, 193], strength: 0.12 });
  },
};

/**
 * Every frame of a creature cropped to the same box, so that it does not jitter as it moves; and which colours glow, and
 * how strongly. The game makes a colour glow wherever it is drawn, so a glowing colour must be used for nothing else.
 */
function shoot(steps: Creature[]) {
  const shots = steps.map(render);
  const { key, name, where, water } = steps[0]!;
  const all = shots.map(({ frame }) => bounds(frame, water));
  const box = [Math.min(...all.map((b) => b[0])), Math.min(...all.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(...all.map((b) => b[3]))] as const;
  const frames = shots.map(({ frame }) => rows(frame, water, box));
  const lights = shots[0]!.lights.map((l) => ({ ...l, x: l.x - box[0], y: l.y - box[1] }));
  const glowing = new Set<number>();
  let strength = 0;
  for (const { frame } of shots) frame.glowStrength.forEach((s, i) => { if (s) { glowing.add(frame.color[i]!); strength = Math.max(strength, s); } });
  for (const { frame } of shots) frame.color.forEach((c, i) => { if (glowing.has(c) && !frame.glowStrength[i]) throw new Error(`${key}: colour ${c} glows in one place and not in another`); });
  const glow = [...glowing].map((c) => "01234567tTmwrRoacvxgGl"[c]).join("");
  return { key, name, where, water, rows: frames[0]!, ...(frames.length > 1 ? { frames } : {}), lights, glow, strength };
}

const loop = (creature: (beat: number) => Creature) => Array.from({ length: FRAMES }, (_, k) => creature((k / FRAMES) * Math.PI * 2));
export const out = [loop(nautilus), loop(squid), loop(dumbo), [angel], [dragon]].map(shoot);
if (import.meta.main) console.log(JSON.stringify(out));
