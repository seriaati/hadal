/** The 22-colour palette. Sprites and text refer to colours by index. */
export const PALETTE = [
  "#05060b", // 0  void
  "#0a0d18", // 1  abyss water
  "#0f1526", // 2  midnight water
  "#16223b", // 3
  "#1f3352", // 4
  "#2e4a6e", // 5
  "#4d7396", // 6  dim text
  "#9cc0d6", // 7  pale steel
  "#17525e", // 8  dark teal
  "#2fa39a", // 9  teal
  "#6fe3c1", // 10 mint
  "#d6fff0", // 11 pale mint
  "#43202a", // 12 maroon
  "#8c3b2a", // 13 rust
  "#d9772f", // 14 orange
  "#f5c15a", // 15 amber
  "#fff1c2", // 16 cream
  "#5b3a78", // 17 violet
  "#c2415c", // 18 rose
  "#1d3b26", // 19 deep moss
  "#3d7a3a", // 20 moss
  "#8cc45a", // 21 lichen
];
const RGB = PALETTE.map((hex) => [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)));

/** Sprite rows are strings in which each character names a palette colour; "." is transparent. */
const SPRITE_COLORS: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  t: 8, T: 9, m: 10, w: 11, r: 12, R: 13, o: 14, a: 15, c: 16, v: 17, x: 18, g: 19, G: 20, l: 21,
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered dithering: true for a fraction `t` of pixels, in a fixed 4x4 pattern. */
export function dither(x: number, y: number, t: number): boolean {
  return t * 16 > BAYER[(y & 3) * 4 + (x & 3)]! + 0.5;
}

/** A repeatable pseudo-random number in [0, 1) for a pair of whole numbers. */
export function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A soft light, in frame pixels. Drawn as a smooth glow over the crisp pixels. */
export type Light = { x: number; y: number; radius: number; rgb: [number, number, number]; strength: number };

/**
 * One low-resolution frame. Every pixel has a palette colour, an optional glow (emissive
 * pixels bloom) and a shade (how much of the soft light behind it the pixel blocks).
 */
export class Frame {
  width = 0;
  height = 0;
  color = new Uint8Array(0);
  /** Palette index + 1 of a glowing pixel, or 0. */
  glowColor = new Uint8Array(0);
  glowStrength = new Uint8Array(0);
  shade = new Uint8Array(0);
  /** Palette index + 1 of each half pixel of text, or 0: twice as many columns and rows as the frame. */
  fine = new Uint8Array(0);
  /** Glow strength (0-255) given to pixels drawn from now on. */
  emit = 0;
  /** Shade (0-255) given to pixels drawn from now on, or -1 to leave the shade as it is. */
  block = -1;
  /** Where this is true, pixels drawn from now on are no brighter than colour 4 and do not glow, so they cannot be mistaken for words over them. */
  hushed: ((x: number, y: number) => boolean) | null = null;
  /** Rows above `clipTop` and from `clipBottom` down are not drawn on. */
  clipTop = 0;
  clipBottom = Infinity;

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.color = new Uint8Array(width * height);
    this.glowColor = new Uint8Array(width * height);
    this.glowStrength = new Uint8Array(width * height);
    this.shade = new Uint8Array(width * height);
    this.fine = new Uint8Array(width * height * 4);
  }

  clear() {
    this.color.fill(0);
    this.fine.fill(0);
    this.glowColor.fill(0);
    this.shade.fill(0);
    this.emit = 0;
    this.block = -1;
  }

  put(x: number, y: number, color: number) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || y < this.clipTop || y >= this.clipBottom) return;
    const i = y * this.width + x;
    const hushed = this.hushed?.(x, y) ?? false;
    this.color[i] = hushed ? Math.min(color, 4) : color;
    this.glowColor[i] = this.emit && !hushed ? color + 1 : 0;
    this.glowStrength[i] = hushed ? 0 : this.emit;
    if (this.block >= 0) this.shade[i] = this.block;
  }

  /** A half pixel of text. The pixel it is in keeps its colour, and glows and blocks light as if `put` had drawn it. */
  putFine(fx: number, fy: number, color: number) {
    const x = fx >> 1;
    const y = fy >> 1;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || y < this.clipTop || y >= this.clipBottom) return;
    const i = y * this.width + x;
    const hushed = this.hushed?.(x, y) ?? false;
    this.fine[fy * this.width * 2 + fx] = (hushed ? Math.min(color, 4) : color) + 1;
    this.glowColor[i] = this.emit && !hushed ? color + 1 : 0;
    this.glowStrength[i] = hushed ? 0 : this.emit;
    if (this.block >= 0) this.shade[i] = this.block;
  }

  clearFine(x: number, y: number) {
    const top = y * 2 * this.width * 2 + x * 2;
    this.fine.fill(0, top, top + 2);
    this.fine.fill(0, top + this.width * 2, top + this.width * 2 + 2);
  }

  /** If `glowChars` is given, only those characters glow. */
  sprite(rows: string[], x: number, y: number, glowChars?: string) {
    const emit = this.emit;
    rows.forEach((row, j) => {
      // Rounded as `put` rounds, so that a row off the frame is skipped only where `put` would have drawn none of it.
      const top = (y + j) | 0;
      if (top < Math.max(0, this.clipTop) || top >= Math.min(this.height, this.clipBottom)) return;
      if (((x + row.length - 1) | 0) < 0 || (x | 0) >= this.width) return;
      for (let i = 0; i < row.length; i++) {
        const char = row[i]!;
        if (char === ".") continue;
        if (glowChars !== undefined) this.emit = glowChars.includes(char) ? emit || 255 : 0;
        this.put(x + i, y + j, SPRITE_COLORS[char]!);
      }
    });
    this.emit = emit;
  }
}

/** On a screen held upright, the frame is at least this many pixels wide. */
const NARROWEST = 144;

/** The part of the window that can be seen, in screen pixels from the top left of the page: a phone's keyboard hides the rest. */
export function visible() {
  const view = window.visualViewport;
  if (!view) return { width: innerWidth, height: innerHeight, left: 0, top: 0 };
  return { width: Math.round(view.width), height: Math.round(view.height), left: view.offsetLeft, top: view.offsetTop };
}

/**
 * How finely the soft light is drawn. High draws it at twice the frame's resolution, Mid at the frame's own, and Low also
 * leaves out the blurred bloom around glowing pixels; the lamps' light stays. Auto starts at High and steps down while
 * frames come too slowly.
 */
export const GLOWS = ["auto", "high", "mid", "low"] as const;
export type GlowSetting = (typeof GLOWS)[number];
export type Glow = Exclude<GlowSetting, "auto">;
const GLOW_STORED = "hadal.glow";
/** The soft-light layer's resolution, as a multiple of the frame's. */
const GLOW_SCALES: Record<Glow, number> = { high: 2, mid: 1, low: 1 };
/** Auto steps down when frames have come at fewer than this many a second over `PACE_SECONDS`. */
const SLOW_FPS = 45;
const PACE_SECONDS = 3;
/** The first seconds of a page are slow while it loads, and are not counted against the device. */
const SETTLE_SECONDS = 2;
/** How a light fades from its centre (0) to its edge (1). */
const FALLOFF = [0, 0.1, 0.2, 0.3, 0.42, 0.55, 0.7, 0.85, 1].map(
  (t) => [t, (1 - t * t) ** 2 / (1 + 7 * t * t)] as const,
);

/** Puts frames on screen: crisp pixels on one canvas, at twice the frame's resolution for text in half pixels, and soft light on another above it. */
export class Display {
  private pixelContext: CanvasRenderingContext2D;
  private glowContext: CanvasRenderingContext2D;
  private shadeCanvas = document.createElement("canvas");
  private bloomCanvas = document.createElement("canvas");
  private image = new ImageData(1, 1);
  private shade = new ImageData(1, 1);
  private bloom = new ImageData(1, 1);

  constructor(
    private pixels: HTMLCanvasElement,
    private glowCanvas: HTMLCanvasElement,
  ) {
    this.pixelContext = pixels.getContext("2d")!;
    this.glowContext = glowCanvas.getContext("2d")!;
  }

  setting: GlowSetting = GLOWS.find((glow) => glow === localStorage.getItem(GLOW_STORED)) ?? "auto";
  glow: Glow = this.setting === "auto" ? "high" : this.setting;
  private paced = { frames: 0, seconds: -SETTLE_SECONDS };

  /** Screen pixels per pixel of the frame. */
  scale = 2;
  /** The tallest the window has been at its present width. */
  private tallest = { width: 0, height: 0 };

  /**
   * Size the canvases to the part of the window that can be seen (above a phone's keyboard) at a pixel scale that keeps
   * pixels crisp, and the frame to match. On a phone held upright the frame is about 150 pixels across, so the words
   * are big enough to read and press.
   */
  fit(frame: Frame) {
    const { width: seen, height: tall } = visible();
    // A phone's keyboard takes height away: the scale stays what it was, and only fewer rows of the frame are seen.
    if (seen !== this.tallest.width || !matchMedia("(pointer: coarse)").matches) this.tallest = { width: seen, height: tall };
    this.tallest.height = Math.max(this.tallest.height, tall);
    const full = this.tallest.height;
    const ratio = devicePixelRatio || 1;
    // Upright, in whole device pixels so that every pixel of the frame is as big as the next.
    const scale = full > seen ? Math.max(2, Math.min(Math.floor((seen * ratio) / NARROWEST), Math.floor((full * ratio) / 216), Math.floor(3 * ratio)) / ratio) : Math.max(2, Math.floor(Math.min(seen / 240, full / 180)));
    this.scale = scale;
    // A window with no size (as some phones report for a moment) keeps the frame of one pixel: an empty image cannot be made.
    const width = Math.max(1, Math.ceil(seen / scale));
    const height = Math.max(1, Math.ceil(tall / scale));
    if (width === this.shadeCanvas.width && height === this.shadeCanvas.height) return;
    frame.resize(width, height);
    this.shadeCanvas.width = this.bloomCanvas.width = width;
    this.shadeCanvas.height = this.bloomCanvas.height = height;
    this.pixels.width = width * 2;
    this.pixels.height = height * 2;
    for (const canvas of [this.pixels, this.glowCanvas]) {
      canvas.style.width = `${width * scale}px`;
      canvas.style.height = `${height * scale}px`;
    }
    this.image = new ImageData(width * 2, height * 2);
    this.shade = new ImageData(width, height);
    this.bloom = new ImageData(width, height);
  }

  setGlow(setting: GlowSetting) {
    this.setting = setting;
    localStorage.setItem(GLOW_STORED, setting);
    this.glow = setting === "auto" ? "high" : setting;
    this.paced = { frames: 0, seconds: 0 };
  }

  /** Counts a frame that took `seconds` since the last, for Auto to step down by. */
  pace(seconds: number) {
    if (this.setting !== "auto" || this.glow === "low") return;
    // A long gap is the page hidden or the browser busy with something else, not the drawing.
    if (seconds > 0.25) {
      this.paced = { frames: 0, seconds: Math.min(0, this.paced.seconds) };
      return;
    }
    this.paced.seconds += seconds;
    if (this.paced.seconds <= 0) return;
    this.paced.frames++;
    if (this.paced.seconds < PACE_SECONDS) return;
    if (this.paced.frames / this.paced.seconds < SLOW_FPS) this.glow = this.glow === "high" ? "mid" : "low";
    this.paced = { frames: 0, seconds: 0 };
  }

  present(frame: Frame, lights: Light[]) {
    const image = this.image.data;
    const shade = this.shade.data;
    const bloom = this.bloom.data;
    for (let i = 0, o = 0; i < frame.color.length; i++, o += 4) {
      shade[o + 3] = frame.shade[i]!;
      const glowing = frame.glowColor[i]!;
      if (glowing) {
        const glow = RGB[glowing - 1]!;
        bloom[o] = glow[0]!;
        bloom[o + 1] = glow[1]!;
        bloom[o + 2] = glow[2]!;
        bloom[o + 3] = frame.glowStrength[i]!;
      } else {
        bloom[o + 3] = 0;
      }
    }
    // Each pixel of the frame as four, where a half pixel of text may stand in for one of them.
    const across = frame.width * 2;
    for (let fy = 0, o = 0; fy < frame.height * 2; fy++) {
      for (let fx = 0; fx < across; fx++, o += 4) {
        const half = frame.fine[fy * across + fx]!;
        const rgb = RGB[half ? half - 1 : frame.color[(fy >> 1) * frame.width + (fx >> 1)]!]!;
        image[o] = rgb[0]!;
        image[o + 1] = rgb[1]!;
        image[o + 2] = rgb[2]!;
        image[o + 3] = 255;
      }
    }
    // The end screen paints over the last frame rather than clearing it, which would keep its words in half pixels.
    frame.fine.fill(0);
    this.pixelContext.putImageData(this.image, 0, 0);
    this.shadeCanvas.getContext("2d")!.putImageData(this.shade, 0, 0);
    this.bloomCanvas.getContext("2d")!.putImageData(this.bloom, 0, 0);

    const scale = GLOW_SCALES[this.glow];
    // Setting a canvas's size clears it, so it is set only when it changes.
    if (this.glowCanvas.width !== frame.width * scale) this.glowCanvas.width = frame.width * scale;
    if (this.glowCanvas.height !== frame.height * scale) this.glowCanvas.height = frame.height * scale;
    const g = this.glowContext;
    const { width, height } = this.glowCanvas;
    g.filter = "none";
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.fillRect(0, 0, width, height);

    g.globalCompositeOperation = "lighter";
    for (const light of lights) {
      const x = light.x * scale;
      const y = light.y * scale;
      const radius = light.radius * scale;
      if (x + radius < 0 || y + radius < 0 || x - radius > width || y - radius > height) continue;
      const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
      for (const [t, falloff] of FALLOFF) {
        gradient.addColorStop(t, `rgba(${light.rgb.join(",")},${Math.min(1, falloff * light.strength)})`);
      }
      g.fillStyle = gradient;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    // Solid things block the light behind them, with crisp pixel edges.
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = false;
    g.drawImage(this.shadeCanvas, 0, 0, width, height);

    if (this.glow === "low") return;
    g.globalCompositeOperation = "lighter";
    g.imageSmoothingEnabled = true;
    for (const [blur, alpha] of [[1.25, 0.5], [4, 0.55], [11, 0.4]] as const) {
      g.filter = `blur(${blur * scale}px)`;
      g.globalAlpha = alpha;
      g.drawImage(this.bloomCanvas, 0, 0, width, height);
    }
  }
}
