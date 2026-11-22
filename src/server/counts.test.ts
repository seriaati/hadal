import { afterAll, expect, test } from "bun:test";
import { countAnswer, countsOf } from "./counts";
import { migrate, sql } from "./db";
import { OWN } from "./game";

// These tests need the database (`docker compose up -d db`).
await migrate();
const PROMPT = `test-${crypto.randomUUID()}/rivers`;
afterAll(async () => {
  await sql`delete from answer_counts where prompt = ${PROMPT}`;
});

test("answers to a built-in prompt are counted however they are written, the most given first", async () => {
  await countAnswer(PROMPT, "Nile", { answer: "Nile", rarity: 10 });
  await countAnswer(PROMPT, " Thames ", { answer: null, rarity: 0 });
  await countAnswer(PROMPT, "the NILE", { answer: "Nile", rarity: 10 });
  expect(await countsOf(PROMPT)).toEqual([
    { answer: "nile", typed: "the NILE", judged: "Nile", times: 2 },
    { answer: "thames", typed: "Thames", judged: null, times: 1 },
  ]);
});

test("nothing is kept of a player's own packs, of an empty answer or of one too long to be one", async () => {
  await countAnswer(`${OWN}rivers/africa`, "Nile", { answer: "Nile", rarity: 10 });
  await countAnswer(PROMPT, "  ", { answer: null, rarity: 0 });
  await countAnswer(PROMPT, "x".repeat(41), { answer: null, rarity: 0 });
  expect(await countsOf(`${OWN}rivers/africa`)).toEqual([]);
  expect((await countsOf(PROMPT)).map((count) => count.answer)).toEqual(["nile", "thames"]);
});
