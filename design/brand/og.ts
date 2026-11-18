import { createGame } from "../../src/web/state";
import { FONTS, drawText } from "../../src/web/pixel/font";
import type { Frame, Light } from "../../src/web/pixel/frame";
import { Scene } from "../../src/web/pixel/scene";
import { en } from "../../src/shared/words/en";

export function drawOg(frame: Frame): Light[] {
  const game = createGame();
  game.depth = 1240;
  const scene = new Scene();
  scene.depth = game.depth;
  // No zone is named at the edge, where it would crowd the corner.
  scene.hush = [0, frame.height];
  // The title phase, covered, draws the world without a word of the game's own.
  let lights: Light[] = [];
  for (let i = 0; i < 4; i++) lights = scene.draw(frame, game, { items: [], choice: 0 }, 1, 10 + i, true);

  // Level with the diver, in the amber of the title screen.
  frame.emit = 110;
  drawText(frame, FONTS.huge, "HADAL", 114, 43, (row) => (row < 8 ? 16 : row < 22 ? 15 : 14));
  frame.emit = 0;
  drawText(frame, FONTS.tiny, en.title.tagline, 114, 43 + FONTS.huge.height + 6, 6);
  return lights;
}
