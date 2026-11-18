import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltIn, loadPacks, validatePack } from "./packs";

const answers = [
  { text: "Peru", rarity: 20 },
  { text: "Suriname", aliases: ["Surinam"], rarity: 100 },
];
const pack = (prompt: object = {}, top: object = {}) => ({
  id: "p",
  name: "P",
  prompts: [{ id: "q", text: "Q", answers, ...prompt }],
  ...top,
});

test("every built-in pack is valid, and every language has some", async () => {
  for (const packs of Object.values(await loadBuiltIn())) expect(packs.length).toBeGreaterThan(0);
});

test("two built-in packs of different languages cannot share an id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hadal-"));
  await Bun.write(join(dir, "en", "seas.json"), JSON.stringify(pack({}, { id: "seas" })));
  await Bun.write(join(dir, "zh-CN", "seas.json"), JSON.stringify(pack({}, { id: "seas" })));
  await Bun.write(join(dir, "zh-TW", "tides.json"), JSON.stringify(pack({}, { id: "tides" })));
  await expect(loadBuiltIn(dir)).rejects.toThrow('two built-in packs have the id "seas"');
});

test("a well-formed pack has no problems", () => {
  expect(validatePack(pack())).toEqual([]);
});

test("the shape of a pack is checked", () => {
  expect(validatePack([])).toEqual(["the pack must be an object"]);
  expect(validatePack(pack({}, { id: "Not A Slug" }))).toEqual([expect.stringContaining("the pack's id")]);
  expect(validatePack(pack({}, { name: "" }))).toEqual([expect.stringContaining("the pack's name")]);
  expect(validatePack(pack({}, { prompts: [] }))).toEqual([expect.stringContaining("at least 1")]);
  expect(validatePack(pack({}, { author: "me" }))).toEqual(['the pack has an unknown field "author"']);
  expect(validatePack(pack({ text: "x".repeat(81) }))).toEqual([expect.stringContaining('prompt "q": text')]);
  expect(validatePack(pack({ answers: answers.slice(1) }))).toEqual([expect.stringContaining("at least 2")]);
});

test("prompt ids must be unique within a pack", () => {
  const prompt = { id: "q", text: "Q", answers };
  expect(validatePack({ id: "p", name: "P", prompts: [prompt, prompt] })).toEqual([
    'prompt "q": another prompt already has this id',
  ]);
});

test("answers are checked, and every problem is reported at once", () => {
  const problems = validatePack(
    pack({
      answers: [
        { text: "Peru", rarity: 0 },
        { text: "peru", alias: ["Perú"], rarity: 100 },
        { text: "???", rarity: 50.5 },
        { text: "x".repeat(41), rarity: 5 },
      ],
    }),
  );
  expect(problems).toEqual([
    'prompt "q", answer "Peru": rarity must be a whole number from 1 to 100',
    'prompt "q", answer 2 has an unknown field "alias"',
    'prompt "q", answer "peru": "peru" is already an answer to this prompt',
    'prompt "q", answer "???": rarity must be a whole number from 1 to 100',
    'prompt "q", answer "???": "???" has no letters or digits',
    expect.stringContaining("every spelling must be text of 1 to 40 characters"),
  ]);
});

test("the rarest answer of a prompt must have rarity 100", () => {
  expect(validatePack(pack({ answers: [{ text: "Peru", rarity: 20 }, { text: "Chile", rarity: 95 }] }))).toEqual([
    'prompt "q": the rarest answer must have rarity 100',
  ]);
});

test("a pack file that is not valid stops the server, naming the file and the problems", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hadal-"));
  await Bun.write(join(dir, "broken.json"), JSON.stringify(pack({}, { id: "other" })));
  await expect(loadPacks(dir)).rejects.toThrow("broken.json is not a valid pack:\n- the pack's id must be the file's name");
});
