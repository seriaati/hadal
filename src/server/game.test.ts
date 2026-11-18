import { expect, test } from "bun:test";
import type { Pack } from "../shared/types";
import { buildIndex, judge, nearestAnswer, normalize, pickPrompts, typos } from "./game";
import { loadBuiltIn } from "./packs";

const index = buildIndex(Object.values(await loadBuiltIn()).flat());
const ASIA = "geography/asia-countries";

test("normalize ignores case, accents, punctuation, spaces and a leading 'the'", () => {
  expect(normalize("  The Pont-l'Évêque ")).toBe("pontleveque");
  expect(normalize("TIMOR LESTE")).toBe(normalize("Timor-Leste"));
});

test("normalize keeps other scripts, and the marks that tell their words apart", () => {
  expect(normalize("Ελλάδα")).toBe("ελλάδα".normalize("NFD"));
  expect(normalize("かぎ")).not.toBe(normalize("かき"));
  expect(normalize("ソウル!")).toBe("ソウル");
});

test("normalize reads traditional and simplified Chinese as the same characters", () => {
  expect(normalize("關")).toBe(normalize("关"));
  expect(normalize("臺灣")).toBe(normalize("台湾"));
  expect(judge(index, "zh-geography/asia-countries", "韓國")?.answer).toBe("韩国");
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

test("typos counts letters added, dropped, changed and swapped", () => {
  expect(typos("spaghetti", "spaghetti")).toBe(0);
  expect(typos("spaghetti", "spagetti")).toBe(1);
  expect(typos("israel", "isreal")).toBe(1);
  expect(typos("philippines", "phillipines")).toBe(2);
});

test("a misspelling counts as the answer it is nearest to", () => {
  expect(judge(index, ASIA, "Kazakstan")?.answer).toBe("Kazakhstan");
  expect(judge(index, ASIA, "Isreal")?.answer).toBe("Israel");
  expect(judge(index, ASIA, "Phillipines")?.answer).toBe("Philippines");
  expect(judge(index, "food/pasta", "spagetti")?.answer).toBe("Spaghetti");
});

test("a misspelling is refused when it is too far off, too short to be sure of, or could be two answers", () => {
  const only = (...texts: string[]): Pack[] => [
    { id: "p", name: "P", prompts: [{ id: "q", text: "Q", answers: texts.map((text) => ({ text, rarity: 100 })) }] },
  ];
  const wrong = { answer: null, rarity: 0 };
  expect(judge(index, ASIA, "Irak")).toEqual(wrong);
  expect(judge(index, ASIA, "Kazakstaan")?.answer).toBe("Kazakhstan");
  expect(judge(index, ASIA, "Kasakstaan")).toEqual(wrong);
  expect(judge(buildIndex(only("Slovenia", "Peach")), "p/q", "Slovakia")).toEqual(wrong);
  expect(judge(buildIndex(only("Slovenia", "Peach")), "p/q", "Beach")).toEqual(wrong);
  expect(judge(buildIndex(only("Apollo 11", "Apollo 13")), "p/q", "Apollo 12")).toEqual(wrong);
  expect(judge(buildIndex(only("Marten", "Martin")), "p/q", "Martan")).toEqual(wrong);
  expect(judge(buildIndex(only("Marten", "Martin")), "p/q", "Martinn")?.answer).toBe("Martin");
});
