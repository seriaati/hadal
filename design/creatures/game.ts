// Writes the creatures from new.ts into the game, as src/web/pixel/drawn.ts.
import { out } from "./new";

const round = (n: number) => Math.round(n * 100) / 100;
const entry = (s: (typeof out)[number]) => {
  const frames = (s.frames ?? [s.rows]).map((rows) => `      [\n${rows.map((r) => `        "${r}",`).join("\n")}\n      ],`).join("\n");
  const lights = s.lights.map((l) => `{ x: ${round(l.x)}, y: ${round(l.y)}, radius: ${round(l.radius)}, rgb: [${l.rgb.join(", ")}], strength: ${l.strength} }`).join(", ");
  return `  ${s.key}: {\n    frames: [\n${frames}\n    ],\n    glow: "${s.glow}",\n    strength: ${s.strength},\n    lights: [${lights}],\n  },`;
};

const file = `// Written by \`bun design/creatures/game.ts\` from the shapes in design/creatures/new.ts: change those, not this.
import type { Light } from "./frame";

export type DrawnKind = ${out.map((s) => `"${s.key}"`).join(" | ")};

/**
 * The sea creatures NekuMeow drew, as sprite rows facing left: the frames of their loop, the colours that glow and how
 * strongly, and the soft lights they give, measured from their top-left corner.
 */
export const DRAWN: Record<DrawnKind, { frames: string[][]; glow: string; strength: number; lights: Light[] }> = {
${out.map(entry).join("\n")}
};
`;

await Bun.write(new URL("../../src/web/pixel/drawn.ts", import.meta.url), file);
