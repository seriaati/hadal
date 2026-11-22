import type { Counted } from "../shared/review";
import { MAX_ANSWER_LENGTH, type Verdict } from "../shared/types";
import { sql } from "./db";
import { OWN, normalize } from "./game";

/** Counts an answer given to a built-in prompt. A player's own packs are theirs alone: nothing of them is kept. */
export async function countAnswer(promptId: string, input: string, verdict: Verdict) {
  const typed = input.trim();
  const answer = normalize(typed);
  if (promptId.startsWith(OWN) || !answer || typed.length > MAX_ANSWER_LENGTH) return;
  await sql`
    insert into answer_counts (prompt, answer, typed, judged) values (${promptId}, ${answer}, ${typed}, ${verdict.answer})
    on conflict (prompt, answer) do update set times = answer_counts.times + 1, typed = excluded.typed, judged = excluded.judged`;
}

/** Counting must never cost a player their answer, so what goes wrong is only logged. */
export function heard(promptId: string, typed: string, verdict: Verdict) {
  countAnswer(promptId, typed, verdict).catch((error) => console.error("An answer could not be counted:", error));
}

/** Every answer given to a prompt, the most given first. */
export async function countsOf(promptId: string): Promise<Counted[]> {
  return [...(await sql`select answer, typed, judged, times from answer_counts where prompt = ${promptId} order by times desc, answer`)];
}
