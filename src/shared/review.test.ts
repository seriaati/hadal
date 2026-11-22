import { expect, test } from "bun:test";
import { pyramid } from "./review";

test("the most read answers are suggested common, and fewer reach each tier the longer the list", () => {
  expect(pyramid([900, 50, 400, null, 10, 300, 20, 100, 30, 200])).toEqual(["common", "rare", "common", null, "rare", "familiar", "rare", "uncommon", "rare", "uncommon"]);
  const tiers = pyramid(Array.from({ length: 1000 }, (_, i) => 1000 - i));
  expect(["common", "familiar", "uncommon", "rare"].map((tier) => tiers.filter((one) => one === tier).length)).toEqual([8, 24, 94, 874]);
});
