import { $ } from "bun";
import { deflateSync } from "node:zlib";
import { PALETTE } from "../../src/web/pixel/frame";
import { HELMET } from "./helmet";

// Draws the link preview and the icons into src/web/: `bun design/brand/render.ts`. The preview needs Google Chrome.
const here = import.meta.dir;
const web = `${here}/../../src/web`;

await $`bun build ${here}/page.ts --outfile=${here}/out/page.js --format=iife`.quiet();
await $`google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=1000 --screenshot=${web}/og-2.png file://${here}/index.html`.quiet();
console.log("src/web/og-2.png");

const COLORS: Record<string, number> = { "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, w: 11, r: 12, R: 13, o: 14, a: 15, c: 16 };
// The browser tab's icon has no background; the phone's home-screen icon has the water of the game behind it.
await Bun.write(`${web}/favicon.png`, png(HELMET, 2, 0, null));
await Bun.write(`${web}/apple-touch-icon.png`, png(HELMET, 10, 10, 2));
console.log("src/web/favicon.png\nsrc/web/apple-touch-icon.png");

/** Sprite rows as a PNG, each pixel `scale` times larger, with `pad` pixels of `background` (or nothing) around. */
function png(rows: string[], scale: number, pad: number, background: number | null): Uint8Array {
  const width = rows[0]!.length * scale + pad * 2;
  const height = rows.length * scale + pad * 2;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = rows[Math.floor((y - pad) / scale)]?.[Math.floor((x - pad) / scale)];
      const color = x >= pad && y >= pad && char && char !== "." ? COLORS[char]! : background;
      if (color === null) continue;
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw.set([1, 3, 5].map((i) => parseInt(PALETTE[color]!.slice(i, i + 2), 16)), o);
      raw[o + 3] = 255;
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 6], 8); // 8 bits a channel, RGBA
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0);
  return out;
}
