import { afterAll, expect, test } from "bun:test";
import type { Pack } from "../shared/types";
import { migrate, sql } from "./db";
import { review, saveReviewed } from "./review";
import { loadSystemPack, saveSystemPack } from "./system";

// These tests need the database (`docker compose up -d db`), for the packs and the players' counts. Their pack is removed afterwards.
await migrate();
const id = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const pack: Pack = {
  id,
  name: "Rivers",
  prompts: [{ id: "africa", text: "Name a river in Africa", answers: [{ text: "Nile", tier: "common" }, { text: "Okavango", tier: "gem" }] }],
};
await saveSystemPack("en", pack, false);

afterAll(async () => {
  await sql`delete from system_packs where id = ${id}`;
  await sql`delete from system_pack_versions where id = ${id}`;
});

test("only a built-in pack that exists, in its own language, can be read or written", async () => {
  expect(await review("zh-CN", id)).toBeNull();
  expect(await review("en", "no-such-pack")).toBeNull();
  expect(await saveReviewed("zh-CN", id, pack)).toBeNull();
});

test("a pack is read with its players' counts, and is not saved while it has problems", async () => {
  const reviewed = (await review("en", id))!;
  expect(Object.keys(reviewed.counts)).toEqual(["africa"]);
  expect(await saveReviewed("en", id, { ...pack, prompts: [] })).toEqual([expect.stringContaining("at least 1")]);
  expect(await saveReviewed("en", id, { ...pack, id: "beasts" })).toEqual(["the pack's id must stay as it is"]);
  expect((await loadSystemPack(id))?.pack).toEqual(pack);
});

test("a reviewed pack is saved", async () => {
  const retiered: Pack = { ...pack, name: "Rivers of Africa" };
  expect(await saveReviewed("en", id, retiered)).toEqual([]);
  expect((await loadSystemPack(id))?.pack).toEqual(retiered);
});
