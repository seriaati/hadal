import { afterAll, expect, test } from "bun:test";
import type { Pack } from "../shared/types";
import { migrate, sql } from "./db";
import { listSystemPacks, loadSystemPack, loadSystemPacks, saveSystemPack } from "./system";

// These tests need the database (`docker compose up -d db`). Their packs are removed afterwards.
await migrate();
const made: string[] = [];
const fresh = () => {
  const id = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(id);
  return id;
};
const prompt = (id: string, text: string) => ({ id, text, answers: [{ text: "Nile", tier: "common" as const }, { text: "Okavango", tier: "gem" as const }] });
const rivers = (id: string, ...prompts: ReturnType<typeof prompt>[]): Pack => ({ id, name: "Rivers", prompts });

afterAll(async () => {
  await sql`delete from system_packs where id in ${sql(made)}`;
  await sql`delete from system_pack_versions where id in ${sql(made)}`;
});

test("a saved pack is listed and played in its language", async () => {
  const id = fresh();
  const pack = rivers(id, prompt("africa", "Name a river in Africa"));
  expect(await saveSystemPack("zh-TW", pack, false)).toEqual({ saved: pack });
  expect(await listSystemPacks()).toContainEqual({ id, language: "zh-TW", name: "Rivers", prompts: 1 });
  expect((await loadSystemPacks())["zh-TW"]).toContainEqual(pack);
  expect((await loadSystemPacks()).en).not.toContainEqual(pack);
});

test("a pack with problems is refused", async () => {
  const id = fresh();
  const saved = await saveSystemPack("en", { ...rivers(id), prompts: [] }, false);
  expect(saved).toEqual({ problems: [expect.stringContaining("at least 1")] });
  expect(await loadSystemPack(id)).toBeNull();
});

test("an id stays in the language it was first saved in", async () => {
  const id = fresh();
  await saveSystemPack("en", rivers(id, prompt("africa", "Name a river in Africa")), false);
  const saved = await saveSystemPack("zh-CN", rivers(id, prompt("africa", "说出一条非洲的河流")), false);
  expect(saved).toEqual({ problems: [expect.stringContaining("already a en pack")] });
});

test("a pack that would remove prompts is held back until replacing is asked for, and the old one is kept", async () => {
  const id = fresh();
  const both = rivers(id, prompt("africa", "Name a river in Africa"), prompt("asia", "Name a river in Asia"));
  const one = rivers(id, prompt("africa", "Name a river in Africa"));
  await saveSystemPack("en", both, false);
  expect(await saveSystemPack("en", one, false)).toEqual({ removes: ["Name a river in Asia"] });
  expect((await loadSystemPack(id))?.pack).toEqual(both);
  expect(await saveSystemPack("en", one, true)).toEqual({ saved: one });
  expect((await loadSystemPack(id))?.pack).toEqual(one);
  const kept = await sql`select data from system_pack_versions where id = ${id}`;
  expect(kept.map((row: { data: Pack }) => row.data)).toEqual([both]);
});

test("a pack that only adds prompts replaces the old one without asking", async () => {
  const id = fresh();
  await saveSystemPack("en", rivers(id, prompt("africa", "Name a river in Africa")), false);
  const more = rivers(id, prompt("africa", "Name a river in Africa"), prompt("asia", "Name a river in Asia"));
  expect(await saveSystemPack("en", more, false)).toEqual({ saved: more });
});
