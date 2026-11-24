import { afterAll, expect, test } from "bun:test";
import type { Counted } from "../shared/review";
import type { Pack, Prompt } from "../shared/types";
import { absorbDays, retier } from "./absorb";
import type { Written } from "./daily";
import { migrate, sql } from "./db";
import { loadSystemPack, saveSystemPack } from "./system";

// These tests need the database (`docker compose up -d db`). Their packs and a day far in the past are removed afterwards.
await migrate();
const DAY = "1999-01-03";
const theme = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const ids = [theme, `zh-${theme}`, `tw-${theme}`];

afterAll(async () => {
  await sql`delete from daily_prompts where day = ${DAY}`;
  await sql`delete from daily_sets where day = ${DAY}`;
  await sql`delete from system_packs where id in ${sql(ids)}`;
  await sql`delete from system_pack_versions where id in ${sql(ids)}`;
});

const rivers: Prompt = {
  id: "rivers",
  text: "Name a river in Africa",
  answers: [
    { text: "Nile", tier: "common" },
    { text: "Congo", tier: "familiar" },
    { text: "Niger", tier: "uncommon" },
    { text: "Zambezi", tier: "rare" },
    { text: "Okavango", tier: "gem" },
  ],
};
const counted = (judged: string | null, times: number): Counted => ({ answer: judged ?? "x", typed: judged ?? "x", judged, times });

test("a prompt few players answered keeps its tiers, and takes the right answers the live judge allowed", () => {
  const joined = retier(rivers, [counted("Nile", 10), counted("Orange River", 2), counted("Nile", 1), counted(null, 5)]);
  expect(joined.answers.map((answer) => answer.tier)).toEqual(["common", "familiar", "uncommon", "rare", "gem", "rare"]);
  expect(joined.answers.at(-1)).toEqual({ text: "Orange River", tier: "rare" });
});

test("a prompt many players answered takes the tiers their counts suggest, but an answer nobody gave keeps its own", () => {
  const joined = retier(rivers, [counted("Okavango", 60), counted("Nile", 30), counted("Niger", 10), counted("Congo", 1), counted(null, 20)]);
  const tiers = Object.fromEntries(joined.answers.map((answer) => [answer.text, answer.tier]));
  // Players found the gem the easiest: it is common now, and the last of the rarest tier takes its place.
  expect(tiers).toEqual({ Okavango: "common", Nile: "common", Niger: "uncommon", Congo: "rare", Zambezi: "gem" });
});

test("when its day is over, a prompt the day asked joins its pack in every language, and one it did not ask does not", async () => {
  const pack = (id: string): Pack => ({ id, name: "Rivers", prompts: [{ ...rivers, id: "old", text: "Name an old river" }] });
  for (const [language, id] of [["en", ids[0]], ["zh-CN", ids[1]], ["zh-TW", ids[2]]] as const) await saveSystemPack(language, pack(id!), false);
  const written: Written = { en: rivers, "zh-CN": { ...rivers, text: "说出一条非洲的河流" }, "zh-TW": { ...rivers, text: "說出一條非洲的河流" } };
  await sql`insert into daily_prompts (day, theme, tries, prompts) values (${DAY}, ${theme}, 1, ${written})`;
  await sql`insert into daily_sets (day, language, prompts) values (${DAY}, 'en', ${[`${theme}/rivers`]}::jsonb)`;

  expect(await absorbDays()).toBe(true);
  expect((await loadSystemPack(`zh-${theme}`))!.pack.prompts.map((prompt) => prompt.text)).toEqual(["Name an old river", "说出一条非洲的河流"]);
  const [kept] = await sql`select count(*)::int as count from system_pack_versions where id = ${theme}`;
  expect(kept.count).toBe(1);
  const [row] = await sql`select absorbed_at from daily_prompts where day = ${DAY} and theme = ${theme}`;
  expect(row.absorbed_at).not.toBeNull();
  expect(await absorbDays()).toBe(false);

  await sql`update daily_prompts set absorbed_at = null, prompts = ${{ ...written, en: { ...rivers, id: "unasked" } }} where day = ${DAY} and theme = ${theme}`;
  expect(await absorbDays()).toBe(false);
  expect((await loadSystemPack(theme))!.pack.prompts).toHaveLength(2);
});
