// For the review page of developer mode, and the pack tools that feed it (`tools/`).
import type { Pack, Tier } from "./types";

/**
 * How many answers of a prompt with `n` answers reach each tier and those above it: `n` to these
 * powers. Fitted by eye to krillion.io's lists, where the top tiers grow far slower than the list
 * (2 common of 9 neighbours of Germany, 12 of 37,000 fish). To tune by the players' counts.
 */
const PYRAMID: [Tier, number][] = [
  ["common", 0.3],
  ["familiar", 0.5],
  ["uncommon", 0.7],
];

/**
 * A tier for each answer from how much it is read or given (null where that is not known), by its
 * rank among the others. The first answer is always common; a gem is chosen, never suggested.
 */
export function pyramid(amounts: (number | null)[]): (Tier | null)[] {
  const known = amounts.filter((amount): amount is number => amount !== null).sort((a, b) => b - a);
  return amounts.map((amount) => {
    if (amount === null) return null;
    const rank = known.indexOf(amount);
    return PYRAMID.find(([, power]) => rank < known.length ** power)?.[0] ?? "rare";
  });
}

/** Suggestions from players' counts are shown once a prompt has had this many answers. */
export const MIN_COUNTED = 100;

/** What `tools/signals.ts` learnt of an answer on Wikipedia. */
export type Signal = { title: string | null; views: number | null; sitelinks: number | null; suggested: Tier | null };
/** Signals by prompt id, then by answer text. */
export type Signals = Record<string, Record<string, Signal>>;
export type Counted = { answer: string; typed: string; judged: string | null; times: number };
export type Reviewed = { language: string; pack: Pack; signals: Signals | null; counts: Record<string, Counted[]> };
export type ReviewSummary = { language: string; id: string; name: string; prompts: number };
