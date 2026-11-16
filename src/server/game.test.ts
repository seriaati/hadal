import { expect, test } from "bun:test";
import { buildIndex, judge, nearestAnswer, normalize, pickPrompts } from "./game";
import { loadPacks } from "./packs";

const index = buildIndex(await loadPacks());
const ASIA = "geography/asia-countries";

test("normalize ignores case, accents, punctuation, spaces and a leading 'the'", () => {
  expect(normalize("  The Pont-l'Évêque ")).toBe("pontleveque");
  expect(normalize("TIMOR LESTE")).toBe(normalize("Timor-Leste"));
});

test("normalize keeps other scripts, and the marks that tell their words apart", () => {
  expect(normalize("Ελλάδα")).toBe("ελλάδα".normalize("NFD"));
  expect(normalize("かぎ")).not.toBe(normalize("かき"));
  expect(normalize("東京!")).toBe("東京");
});

test("a correct answer returns the pack's spelling and its rarity", () => {
  const verdict = judge(index, ASIA, "  taiwan ");
  expect(verdict?.answer).toBe("Taiwan");
  expect(verdict?.rarity).toBeGreaterThan(judge(index, ASIA, "China")!.rarity);
});

test("an alias counts as the answer it belongs to", () => {
  expect(judge(index, ASIA, "East Timor")?.answer).toBe("Timor-Leste");
});

test("a wrong answer scores nothing", () => {
  expect(judge(index, ASIA, "USA")).toEqual({ answer: null, rarity: 0 });
  expect(judge(index, ASIA, "")).toEqual({ answer: null, rarity: 0 });
});

test("an unknown prompt is reported as null", () => {
  expect(judge(index, "nope/nope", "China")).toBeNull();
  expect(nearestAnswer(index, "nope/nope", 50)).toBeNull();
});

test("the nearest answer to a rarity is a correct answer of about that rarity", () => {
  const rarest = judge(index, ASIA, nearestAnswer(index, ASIA, 100)!)!;
  const commonest = judge(index, ASIA, nearestAnswer(index, ASIA, 1)!)!;
  expect(commonest.rarity).toBe(5);
  expect(rarest.rarity).toBeGreaterThan(60);
  expect(judge(index, ASIA, nearestAnswer(index, ASIA, 30)!)?.rarity).toBe(30);
});

test("pickPrompts returns distinct prompts", () => {
  const prompts = pickPrompts(index, 10);
  expect(prompts).toHaveLength(10);
  expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(10);
});
