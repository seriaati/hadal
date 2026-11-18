import { afterAll, expect, test } from "bun:test";
import { CHAOS_AIR_SECONDS, DROP_SECONDS, LOST_SECONDS, createGame, leave, lostDive, pressEnter, start, tick } from "./state";

// Every test file runs in one process: the server's tests need the real `fetch` back.
const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

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

test("a dive that is left leads straight back to the title, and an answer still on its way counts for nothing", async () => {
  const prompts = [{ id: "p/a", text: "A", pack: "P" }];
  globalThis.fetch = (async (url: string) => {
    if (url !== "/api/game") await Bun.sleep(5);
    return Response.json(url === "/api/game" ? { prompts } : { answer: "Peru", rarity: 40 });
  }) as unknown as typeof fetch;

  const game = createGame();
  pressEnter(game);
  await Bun.sleep(1);
  game.input = "peru";
  pressEnter(game);
  leave(game);
  await Bun.sleep(10);
  expect(game).toEqual(createGame());
});

test("no air is used while an answer is being judged", async () => {
  const prompts = [{ id: "p/a", text: "A", pack: "P" }];
  globalThis.fetch = (async (url: string) => {
    if (url !== "/api/game") await Bun.sleep(5);
    return Response.json(url === "/api/game" ? { prompts } : { answer: null, rarity: 0 });
  }) as unknown as typeof fetch;

  const game = createGame();
  pressEnter(game);
  await Bun.sleep(1);
  tick(game, 2);
  game.input = "lima";
  pressEnter(game);
  expect(game.judging).toBe("lima");
  tick(game, 60);
  expect(game.air).toBe(16);
  await Bun.sleep(10);
  expect(game.judging).toBeNull();
  expect(game.rejected?.text).toBe("lima");
  tick(game, 1);
  expect(game.air).toBe(15);
});

test("a chaos dive drops the diver off, gives 8 seconds of air, and ends at the first prompt whose air runs out", async () => {
  const prompts = [{ id: "p/a", text: "A", pack: "P" }, { id: "p/b", text: "B", pack: "P" }, { id: "p/c", text: "C", pack: "P" }];
  globalThis.fetch = (async (url: string) =>
    Response.json(url === "/api/game" ? { prompts } : { answer: "Peru", rarity: 40 })) as unknown as typeof fetch;

  const game = createGame();
  await start(game, undefined, true);
  // No air is used while the submarine lets the diver go.
  expect(game.phase).toBe("drop");
  tick(game, DROP_SECONDS - 0.1);
  expect(game.air).toBe(CHAOS_AIR_SECONDS);
  tick(game, 0.2);
  expect(game.phase).toBe("ask");

  game.input = "peru";
  pressEnter(game);
  await Bun.sleep(1);
  tick(game, 1);
  pressEnter(game);
  expect(game.air).toBe(CHAOS_AIR_SECONDS);
  expect(lostDive(game)).toBe(false);

  // The second prompt runs out of air: the dive is lost, the third prompt never asked.
  tick(game, CHAOS_AIR_SECONDS + 0.1);
  expect(game.phase).toBe("lost");
  expect(lostDive(game)).toBe(true);
  pressEnter(game);
  expect(game.phase).toBe("lost");
  tick(game, LOST_SECONDS);
  expect(game.phase).toBe("done");
  expect(game.results).toEqual([{ answer: "Peru", rarity: 40, correct: true }, { answer: "", rarity: 0, correct: false }]);
});
