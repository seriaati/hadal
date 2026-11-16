// The logbook's drawing tools: paint (layered watercolour washes), then ink, pencil and lettering.
// Everything is drawn on canvas and flattened into one picture per page, so that showing the
// book costs the browser nothing more than showing an image.

export type Pt = [number, number];

export const PAGE_W = 600;
export const PAGE_H = 760;
/** A canvas has this many pixels per page unit, unless told otherwise, so that paint stays sharp when scaled up. */
const DENSITY = 2;

export const PAPER = "#f1e6cf";
export const INK = "#222a3f";
export const GRAPHITE = "#5a534b";
export const RED = "#c23f2a";
export const RUST = "#b5502f";
export const YELLOW = "#f8cc62";
export const CREAM = "#f7f0dc";

export const HAND = "Caveat Variable";
export const DISPLAY = "Fredericka the Great";
export const TYPED = "Special Elite";

// ---- randomness: seeded, so the same dive always draws the same page

let random = seeded(1);

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function reseed(seed: number) {
  random = seeded(seed);
}

/** A random number below `a`, or between `a` and `b`. */
export function rnd(a = 1, b?: number): number {
  return b === undefined ? random() * a : a + random() * (b - a);
}

const gauss = () => (random() + random() + random() + random() - 2) / 0.577;

// ---- paint

export function newCanvas(density = DENSITY): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W * density;
  canvas.height = PAGE_H * density;
  const context = canvas.getContext("2d")!;
  context.scale(density, density);
  return context;
}

/** Split each side of a closed outline into pieces about `seg` long. */
function resample(pts: Pt[], seg: number): Pt[] {
  const out: Pt[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    const k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / seg));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  });
  return out;
}

/** Roughen a closed outline by pushing the middle of every side out of place, `iters` times over. */
function deform(pts: Pt[], iters: number, v: number): Pt[] {
  for (let k = 0; k < iters; k++) {
    const next: Pt[] = [];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const m = Math.hypot(b[0] - a[0], b[1] - a[1]) * v;
      next.push(a, [(a[0] + b[0]) / 2 + gauss() * m, (a[1] + b[1]) / 2 + gauss() * m]);
    });
    pts = next;
  }
  return pts;
}

function trace(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.closePath();
}

export type Wash = {
  /** How strong the colour ends up, from 0 to 1. */
  s?: number;
  layers?: number;
  seg?: number;
  /** How far the edge wanders. */
  v?: number;
  base?: number;
  detail?: number;
  /** How dark the dried edge is, where pigment pools. */
  edge?: number;
  edgeW?: number;
  op?: GlobalCompositeOperation;
};

/** A watercolour wash: many faint, slightly different shapes stacked, then a dried edge. */
export function wash(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, o: Wash = {}) {
  const { s = 0.6, layers = 22, seg = 22, v = 0.28, base = 2, detail = 1, edge = 0.22, edgeW = 1.2, op = "source-over" } = o;
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  const outline = deform(resample(pts, seg), base, v);
  ctx.globalAlpha = 1 - Math.pow(1 - s, 1 / layers);
  for (let i = 0; i < layers; i++) {
    trace(ctx, deform(outline, detail, v));
    ctx.fill();
  }
  for (let i = 0; i < 2 && edge > 0; i++) {
    ctx.globalAlpha = edge;
    ctx.lineWidth = edgeW * (0.5 + random());
    trace(ctx, deform(outline, 2, v * 0.5));
    ctx.stroke();
  }
  ctx.restore();
}

/** Take paint back off the page, as with a damp brush. */
export function lift(ctx: CanvasRenderingContext2D, pts: Pt[], s: number, o: Wash = {}) {
  wash(ctx, pts, "#000", { s, edge: 0, op: "destination-out", ...o });
}

/** Multiply a wash into what is already there, as a glaze over dry paint. */
export const GLAZE = { op: "multiply" } as const;

/** A rough round outline. */
export function blob(cx: number, cy: number, rx: number, ry = rx, n = 12, j = 0.08): Pt[] {
  const start = rnd(6.28);
  return Array.from({ length: n }, (_, i): Pt => {
    const a = start + (i / n) * 6.283;
    const k = 1 + (random() - 0.5) * 2 * j;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
}

// ---- ink, pencil and lettering

/** A smooth curve through the points, as closely spaced points. */
function spline(pts: Pt[], step = 2.5): Pt[] {
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const c = (d: 0 | 1) =>
        0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t * t * t);
      out.push([c(0), c(1)]);
    }
  }
  out.push(at(pts.length - 1));
  return out;
}

export type Ink = { w?: number; wob?: number; taper?: number; min?: number; color?: string; opacity?: number };

/** A pen stroke as a filled shape: it wanders, swells with pressure and tapers at both ends. */
export function ink(ctx: CanvasRenderingContext2D, pts: Pt[], o: Ink = {}) {
  const { w = 1.7, wob = 0.55, taper = 0.18, min = 0.3, color = INK, opacity = 1 } = o;
  const path = spline(pts);
  const n = path.length;
  const [fa, pa, fb, pb, fw, pw] = [rnd(0.025, 0.05), rnd(6.28), rnd(0.09, 0.16), rnd(6.28), rnd(0.02, 0.045), rnd(6.28)];
  const left: Pt[] = [];
  const right: Pt[] = [];
  let d = 0;
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / length;
    const ty = (b[1] - a[1]) / length;
    if (i) d += Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = i / (n - 1);
    const e = Math.min(1, Math.min(t, 1 - t) / taper);
    const tapered = min + (1 - min) * e * e * (3 - 2 * e);
    const off = wob * (Math.sin(d * fa + pa) + 0.45 * Math.sin(d * fb + pb));
    const press = 0.74 + 0.26 * Math.sin(d * fw + pw) + 0.1 * Math.sin(d * fw * 3.3 + pb);
    const half = w * 0.5 * press * tapered;
    const x = p[0] - ty * off;
    const y = p[1] + tx * off;
    left.push([x - ty * half, y + tx * half]);
    right.push([x + ty * half, y - tx * half]);
  });
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  trace(ctx, [...left, ...right.reverse()]);
  ctx.fill();
  ctx.restore();
}

/** Ink each side of a shape as its own stroke, overshooting the corners a little. */
export function edges(ctx: CanvasRenderingContext2D, pts: Pt[], o: Ink & { over?: number } = {}) {
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const e = (o.over ?? 2) / (Math.hypot(dx, dy) || 1);
    const middle: Pt = [(a[0] + b[0]) / 2 + rnd(-0.5, 0.5), (a[1] + b[1]) / 2 + rnd(-0.5, 0.5)];
    ink(ctx, [[a[0] - dx * e, a[1] - dy * e], middle, [b[0] + dx * e, b[1] + dy * e]], o);
  });
}

export type Pencil = { w?: number; n?: number; j?: number; color?: string; opacity?: number; dash?: number[] };

/** A pencil line: thin, drawn more than once, never quite in the same place. */
export function pencil(ctx: CanvasRenderingContext2D, pts: Pt[], o: Pencil = {}) {
  const { w = 0.9, n = 2, j = 0.9, color = GRAPHITE, opacity = 0.75, dash = [] } = o;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  for (let k = 0; k < n; k++) {
    ctx.lineWidth = w * (0.8 + random() * 0.5);
    ctx.beginPath();
    for (const [x, y] of spline(pts.map(([x, y]): Pt => [x + rnd(-j, j), y + rnd(-j, j)]), 4)) ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, opacity = 1) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** Points along part of an ellipse, between two angles in degrees. */
export function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 14): Pt[] {
  return Array.from({ length: n + 1 }, (_, i): Pt => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

/** A hand-drawn ring: it overshoots its own start and does not quite close. */
export function ring(cx: number, cy: number, rx: number, ry = rx, o: { start?: number; n?: number; over?: number; drift?: number; j?: number } = {}): Pt[] {
  const { start = rnd(360), n = 16, over = 40, drift = 0.06, j = 0.03 } = o;
  return Array.from({ length: n + 1 }, (_, i): Pt => {
    const t = i / n;
    const a = ((start + (360 + over) * t) * Math.PI) / 180;
    const k = 1 + (t - 0.5) * drift + (random() - 0.5) * j;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
}

export type Lettering = {
  size?: number; font?: string; fill?: string; rot?: number; anchor?: "start" | "middle" | "end";
  weight?: number; ls?: number; opacity?: number;
  /** How far each word sits off the baseline, as handwriting does. */
  jit?: number;
};

export function txt(ctx: CanvasRenderingContext2D, x: number, y: number, words: string, o: Lettering = {}) {
  const { size = 22, font = HAND, fill = INK, rot = 0, anchor = "start", weight = 400, ls = 0, jit = 1, opacity = 1 } = o;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.font = `${weight} ${size}px "${font}", cursive`;
  ctx.letterSpacing = `${ls}px`;
  ctx.fillStyle = fill;
  ctx.globalAlpha = opacity;
  const parts = words.split(" ").map((word, i, all) => word + (i < all.length - 1 ? " " : ""));
  const widths = parts.map((part) => ctx.measureText(part).width);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let at = anchor === "end" ? -total : anchor === "middle" ? -total / 2 : 0;
  parts.forEach((part, i) => {
    ctx.fillText(part, at, jit > 0 ? (random() - 0.5) * 2 * jit : 0);
    at += widths[i]!;
  });
  ctx.restore();
}

// ---- a page

/** One page of the book while it is being drawn: the paint, and the two kinds of line laid over it. */
export type Sheet = {
  paint: CanvasRenderingContext2D;
  /** Dark media (ink, pencil, type, the stamp), which soak into the paint beneath them. */
  dark: CanvasRenderingContext2D;
  /** Light, opaque media, for drawing on dark paint, and loose things lying on the page. */
  light: CanvasRenderingContext2D;
};

let noise: HTMLCanvasElement | undefined;

/** Speckle a whole canvas with fine random dots, `scale` page units across: to wear ink away, or to dirty paper. */
export function speckle(ctx: CanvasRenderingContext2D, op: GlobalCompositeOperation, strength: number, scale: number) {
  if (!noise) {
    noise = document.createElement("canvas");
    noise.width = noise.height = 256;
    const dots = new ImageData(256, 256);
    for (let i = 3; i < dots.data.length; i += 4) dots.data[i] = Math.random() ** 3 * 255;
    noise.getContext("2d")!.putImageData(dots, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = strength;
  ctx.fillStyle = ctx.createPattern(noise, "repeat")!;
  ctx.scale(scale, scale);
  ctx.fillRect(0, 0, PAGE_W / scale, PAGE_H / scale);
  ctx.restore();
}

/** A fresh sheet of aged paper. It stops at every `yield`. */
export function* createSheet(): Generator<void, Sheet> {
  const paint = newCanvas();
  paint.fillStyle = PAPER;
  paint.fillRect(0, 0, PAGE_W, PAGE_H);
  // Old paper is not one colour, and it is darkest at the edges.
  for (let i = 0; i < 14; i++) {
    const spot = blob(rnd(PAGE_W), rnd(PAGE_H), rnd(70, 220), rnd(50, 150));
    wash(paint, spot, i % 3 ? "#e6d3a9" : "#f8f0de", { s: 0.16, v: 0.45, seg: 40, edge: 0 });
    if (i % 2) yield;
  }
  for (const [x, y, w, h] of [[0, 0, PAGE_W, 10], [0, PAGE_H - 10, PAGE_W, 10], [0, 0, 8, PAGE_H], [PAGE_W - 8, 0, 8, PAGE_H]] as const) {
    wash(paint, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "#cfb88c", { s: 0.3, v: 0.5, seg: 30, edge: 0 });
  }
  yield;
  return { paint, dark: newCanvas(), light: newCanvas() };
}

/** Press a finished sheet into a single picture. */
export function flatten({ paint, dark, light }: Sheet): HTMLCanvasElement {
  // Ink and pencil skip over the tooth of the paper.
  speckle(dark, "destination-out", 0.45, 0.5);
  paint.globalCompositeOperation = "multiply";
  paint.drawImage(dark.canvas, 0, 0, PAGE_W, PAGE_H);
  paint.globalCompositeOperation = "source-over";
  paint.drawImage(light.canvas, 0, 0, PAGE_W, PAGE_H);
  speckle(paint, "source-over", 0.07, 0.5);
  return paint.canvas;
}
