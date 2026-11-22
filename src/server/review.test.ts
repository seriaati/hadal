import { expect, test } from "bun:test";
import { migrate } from "./db";
import { review, saveReviewed } from "./review";

// These tests need the database (`docker compose up -d db`), for the players' counts.
await migrate();

test("only a built-in pack that exists can be read or written", async () => {
  expect(await review("en", "../../package")).toBeNull();
  expect(await review("xx", "animals")).toBeNull();
  expect(await review("en", "no-such-pack")).toBeNull();
  expect(await saveReviewed("en", "..%2F..%2Fpackage", {})).toBeNull();
});

test("a pack is read with its players' counts, and is not written while it has problems", async () => {
  const reviewed = (await review("en", "animals"))!;
  expect(Object.keys(reviewed.counts)).toEqual(reviewed.pack.prompts.map((prompt) => prompt.id));
  const before = await Bun.file(`${import.meta.dir}/../../packs/en/animals.json`).text();
  expect(await saveReviewed("en", "animals", { ...reviewed.pack, prompts: [] })).toEqual([expect.stringContaining("at least 1")]);
  expect(await saveReviewed("en", "animals", { ...reviewed.pack, id: "beasts" })).toEqual(["the pack's id must stay as it is"]);
  expect(await Bun.file(`${import.meta.dir}/../../packs/en/animals.json`).text()).toBe(before);
});
