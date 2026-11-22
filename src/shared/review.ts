// For the review page of developer mode, and the pack tools that feed it (`tools/`).
import type { Pack, Tier } from "./types";

/** "known" for a set most players know well (countries, capitals), "open" for one nobody knows whole (species, films). */
export type Curve = "known" | "open";

/**
 * How many answers of a prompt with `n` answers reach each tier and those above it: `n` to these
 * powers. Fitted to krillion.io's lists on 2026-11-22: its 217 capitals reach 0.45, 0.69 and 0.86,
 * its fish, rom-coms and video games about 0.2, 0.4 and 0.65. To tune by the players' counts.
 */
const PYRAMIDS: Record<Curve, [Tier, number][]> = {
  known: [
    ["common", 0.45],
    ["familiar", 0.69],
    ["uncommon", 0.86],
  ],
  open: [
    ["common", 0.3],
    ["familiar", 0.5],
    ["uncommon", 0.7],
  ],
};

/**
 * A tier for each answer from how much it is read or given (null where that is not known), by its
 * rank among the others. The first answer is always common; a gem is chosen, never suggested.
 */
export function pyramid(amounts: (number | null)[], curve: Curve = "open"): (Tier | null)[] {
  const known = amounts.filter((amount): amount is number => amount !== null).sort((a, b) => b - a);
  return amounts.map((amount) => {
    if (amount === null) return null;
    const rank = known.indexOf(amount);
    return PYRAMIDS[curve].find(([, power]) => rank < known.length ** power)?.[0] ?? "rare";
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
