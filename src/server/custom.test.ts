import { afterAll, expect, test } from "bun:test";
import { MAX_PACK_BYTES } from "../shared/types";
import { accountIdOf, signUp } from "./accounts";
import { MAX_PACKS, listPacks, loadPack, removePack, savePack } from "./custom";
import { migrate, sql } from "./db";
import { buildIndex, judge } from "./game";

// These tests need the database (`docker compose up -d db`). Their accounts, and so their packs, are removed afterwards.
await migrate();
const made: string[] = [];
const account = async () => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  const entry = await signUp(name, "correct horse");
  if ("error" in entry) throw new Error(entry.error);
  return (await accountIdOf(entry.token))!;
};
const file = (id = "rivers", name = "Rivers") =>
  JSON.stringify({
    id,
    name,
    prompts: [{ id: "africa", text: "Name a river in Africa", answers: [{ text: "Nile", tier: "common" }, { text: "Okavango", tier: "gem" }] }],
  });

afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
});

test("an uploaded pack is kept, listed and can be played", async () => {
  const id = await account();
  expect(await savePack(id, file())).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 1 }]);
  const index = buildIndex([(await loadPack(id, "rivers"))!], "own:");
  expect(judge(index, "own:rivers/africa", "okavango")).toEqual({ answer: "Okavango", rarity: 100 });
});

test("uploading a pack again replaces it", async () => {
  const id = await account();
  await savePack(id, file());
  expect(await savePack(id, file("rivers", "Great rivers"))).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Great rivers", prompts: 1 }]);
});

test("a file that is not a valid pack is refused, with the reasons", async () => {
  const id = await account();
  expect(await savePack(id, "{ not json")).toEqual([expect.stringContaining("not valid JSON")]);
  expect(await savePack(id, file("Rivers"))).toEqual([expect.stringContaining("the pack's id")]);
  expect(await savePack(id, `${file()}${" ".repeat(MAX_PACK_BYTES)}`)).toEqual([expect.stringContaining("at most 200 KB")]);
  expect(await listPacks(id)).toEqual([]);
});

test("an account keeps a limited number of packs, but can still replace one", async () => {
  const id = await account();
  for (let i = 0; i < MAX_PACKS; i++) expect(await savePack(id, file(`pack-${i}`))).toEqual([]);
  expect(await savePack(id, file("one-more"))).toEqual([expect.stringContaining("remove one first")]);
  expect(await savePack(id, file("pack-0", "Changed"))).toEqual([]);
});

test("a pack belongs to its account alone, and can be removed", async () => {
  const [mine, theirs] = [await account(), await account()];
  await savePack(mine, file());
  expect(await loadPack(theirs, "rivers")).toBeNull();
  await removePack(theirs, "rivers");
  expect(await listPacks(mine)).toHaveLength(1);
  await removePack(mine, "rivers");
  expect(await loadPack(mine, "rivers")).toBeNull();
});
