/**
 * What writing a pack costs the player's key, at Claude Opus 5.5's list prices in US dollars
 * (November 2026): per input token, per output token, and per web search. A request Anthropic
 * hands to another model after a refusal is priced the same, which is close enough for this.
 */
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, search: 10 / 1000 };

export type Used = { input: number; output: number; searches: number };

export function dollars(used: Used): number {
  return used.input * PRICE.input + used.output * PRICE.output + used.searches * PRICE.search;
}

/** The most web searches and page fetches one request of the writing may make, and how much of a page it reads. */
export const SEARCHES_PER_REQUEST = 5;
export const FETCHES_PER_REQUEST = 2;
export const MAX_FETCHED_TOKENS = 40000;

/**
 * Guesses for one request, from the fewest tokens to the most: the instructions it is sent, what
 * it writes (thinking included), and what searching adds. Rough, until real writings are measured:
 * a prompt's answers may be a dozen or a few thousand.
 */
const SEARCHED = 20000 + FETCHES_PER_REQUEST * MAX_FETCHED_TOKENS;
const PLAN = { input: 1500, output: [3000, 10000], searched: SEARCHED } as const;
const PROMPT = { input: 1500, output: [4000, 40000], searched: SEARCHED } as const;

/** The least and the most a pack of so many prompts is likely to cost, in dollars. */
export function estimate(prompts: number, search: boolean): [number, number] {
  const least: Used = { input: PLAN.input + prompts * PROMPT.input, output: PLAN.output[0] + prompts * PROMPT.output[0], searches: 0 };
  const most: Used = {
    input: least.input + (search ? PLAN.searched + prompts * PROMPT.searched : 0),
    output: PLAN.output[1] + prompts * PROMPT.output[1],
    searches: search ? (1 + prompts) * SEARCHES_PER_REQUEST : 0,
  };
  return [dollars(least), dollars(most)];
}
