import { afterAll, expect, test } from "bun:test";
import type { Pack } from "../shared/types";
import { claim, dailyPrompts, dayOf, numberOf, pickDaily, record, standing } from "./daily";
import { migrate, sql } from "./db";
import { buildIndex } from "./game";

// These tests need the database (`docker compose up -d db`). They use a day far in the past, whose rows are removed afterwards.
await migrate();
const DAY = "1999-01-01";
const player = `test${crypto.randomUUID()}`;

afterAll(async () => {
  await sql`delete from daily_sets where day = ${DAY}`;
  await sql`delete from daily_runs where day = ${DAY}`;
});

const packs: Pack[] = Array.from({ length: 13 }, (_, p) => ({
  id: `pack${p}`,
  name: `Pack ${p}`,
  prompts: Array.from({ length: 30 }, (_, q) => ({ id: `q${q}`, text: `Prompt ${q}`, answers: [{ text: "a", tier: "common" as const }, { text: "b", tier: "gem" as const }] })),
}));

test("a day runs from midnight to midnight in UTC+8", () => {
  expect(dayOf(Date.parse("2026-11-24T15:59:59Z"))).toBe("2026-11-24");
  expect(dayOf(Date.parse("2026-11-24T16:00:00Z"))).toBe("2026-11-25");
  expect(numberOf("2026-11-24")).toBe(1);
  expect(numberOf("2027-11-24")).toBe(366);
});

test("the daily dive asks one prompt from each of ten packs, the same all day and different the next", () => {
  const today = pickDaily(packs, "2026-11-24", "en");
  expect(today).toHaveLength(10);
  expect(new Set(today.map((id) => id.split("/")[0])).size).toBe(10);
  expect(pickDaily(packs, "2026-11-24", "en")).toEqual(today);
  expect(pickDaily(packs, "2026-11-25", "en")).not.toEqual(today);
});

test("the day's prompts are kept once picked, so a pack changed during the day changes nothing", async () => {
  const first = await dailyPrompts("en", packs, buildIndex(packs), DAY);
  const grown = packs.map((pack) => ({ ...pack, prompts: [...pack.prompts, ...pack.prompts.map((prompt) => ({ ...prompt, id: `${prompt.id}x` }))] }));
  expect(await dailyPrompts("en", grown, buildIndex(grown), DAY)).toEqual(first);
});

test("only the first dive of the day is scored, and its depth is kept once", async () => {
  expect(await standing(player, DAY)).toEqual({ number: numberOf(DAY), dived: false, depth: null });
  expect(await claim(player, DAY)).toBe(true);
  expect(await claim(player, DAY)).toBe(false);
  expect(await standing(player, DAY)).toMatchObject({ dived: true, depth: null });
  await record(player, DAY, 840);
  await record(player, DAY, 11000);
  expect(await standing(player, DAY)).toMatchObject({ dived: true, depth: 840 });
});
