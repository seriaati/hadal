import { expect, test } from "bun:test";
import { createGame, pressEnter, tick } from "./state";

test("a finished dive keeps how every round ended, then leads back to the title", async () => {
  const prompts = [{ id: "p/a", text: "A", pack: "P" }, { id: "p/b", text: "B", pack: "P" }];
  globalThis.fetch = (async (url: string) =>
    Response.json(url === "/api/game" ? { prompts } : { answer: "Peru", rarity: 40 })) as unknown as typeof fetch;

  const game = createGame();
  pressEnter(game);
  await Bun.sleep(1);
  game.input = "peru";
  pressEnter(game);
  await Bun.sleep(1);
  tick(game, 1);
  pressEnter(game);
  // The second prompt runs out of air with nothing typed.
  tick(game, 60);
  tick(game, 1);
  pressEnter(game);

  // The diver is hauled up before the logbook opens, and Enter does not cut that short.
  expect(game.phase).toBe("ascent");
  pressEnter(game);
  tick(game, 5);
  pressEnter(game);
  expect(game.phase).toBe("done");
  expect(game.results).toEqual([{ answer: "Peru", rarity: 40, correct: true }, { answer: "", rarity: 0, correct: false }]);
  expect(game.lamps).toEqual([{ depth: 440, lit: true }, { depth: 440, lit: false }]);

  tick(game, 2);
  pressEnter(game);
  expect(game.phase).toBe("title");
  expect(game.results).toEqual([]);
});
