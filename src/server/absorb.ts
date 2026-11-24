// When a day is over, the prompts written for its daily dive join their packs, tiered by what the day's players gave.
import type { Entry } from "../../tools/sources";
import { MIN_COUNTED, pyramid, type Counted } from "../shared/review";
import { LANGUAGES } from "../shared/language";
import { MAX_ANSWER_LENGTH, TIERS, type Answer, type Prompt } from "../shared/types";
import { countsOf } from "./counts";
import { PACK_PREFIX, dayOf, type Written } from "./daily";
import { sql } from "./db";
import { normalize } from "./game";
import { loadSystemPack, saveSystemPack } from "./system";
import { recordSources } from "./updates";

/**
 * The prompt as the day's players found it. Once it has had MIN_COUNTED answers, each answer players gave takes the tier
 * their counts suggest, as the review page suggests it; one nobody gave keeps its own, since a day's players are too few
 * to call it rare. A gem stays one unless players found it common or familiar, and a prompt left without a gem gets the
 * last answer of its rarest tier. A right answer the list missed, which the live judge allowed, is added as rare.
 */
export function retier(prompt: Prompt, counts: Counted[]): Prompt {
  const answers: Answer[] = prompt.answers.map((answer) => ({ ...answer }));
  const listed = new Set(answers.map((answer) => answer.text));
  const given = new Map<string, number>();
  for (const count of counts) if (count.judged && listed.has(count.judged)) given.set(count.judged, (given.get(count.judged) ?? 0) + count.times);
  const total = counts.reduce((sum, count) => sum + count.times, 0);
  if (total >= MIN_COUNTED) {
    const suggested = pyramid(answers.map((answer) => given.get(answer.text) ?? null));
    answers.forEach((answer, i) => {
      const tier = suggested[i];
      if (!tier || (answer.tier === "gem" && tier !== "common" && tier !== "familiar")) return;
      answer.tier = tier;
    });
    if (!answers.some((answer) => answer.tier === "gem")) {
      const rarest = Math.max(...answers.map((answer) => TIERS[answer.tier]));
      answers.findLast((answer) => TIERS[answer.tier] === rarest)!.tier = "gem";
    }
  }
  const spellings = new Set(answers.flatMap((answer) => [answer.text, ...(answer.aliases ?? [])]).map(normalize));
  for (const count of counts) {
    const spelling = count.judged;
    if (!spelling || spelling.length > MAX_ANSWER_LENGTH || !normalize(spelling) || spellings.has(normalize(spelling))) continue;
    spellings.add(normalize(spelling));
    answers.push({ text: spelling, tier: "rare" });
  }
  return { ...prompt, answers };
}

/**
 * Settles the written prompts of every day before today: each one its day asked joins its pack in every language,
 * through `saveSystemPack`, which keeps the version it replaces, and one whose set grows is checked monthly from then
 * on. One its day did not ask (the day began before it was written) is left out. Says whether any pack changed.
 */
export async function absorbDays(today = dayOf()): Promise<boolean> {
  const rows = await sql`
    select to_char(day, 'YYYY-MM-DD') as day, theme, prompts, sources from daily_prompts
    where absorbed_at is null and day < ${today}`;
  let changed = false;
  for (const { day, theme, prompts, sources } of rows as { day: string; theme: string; prompts: Written | null; sources: Entry | null }[]) {
    const [set] = await sql`select prompts from daily_sets where day = ${day} and language = 'en'`;
    const asked = prompts && (set?.prompts as string[] | undefined)?.includes(`${theme}/${prompts.en.id}`);
    for (const language of asked ? LANGUAGES : []) {
      const found = await loadSystemPack(PACK_PREFIX[language] + theme);
      const prompt = prompts![language];
      if (!found || found.pack.prompts.some((one) => one.id === prompt.id)) continue;
      const joined = retier(prompt, await countsOf(`${found.pack.id}/${prompt.id}`));
      const saved = await saveSystemPack(language, { ...found.pack, prompts: [...found.pack.prompts, joined] }, false);
      if ("problems" in saved) console.error(`daily ${day}: "${prompt.text}" could not join ${found.pack.id}: ${saved.problems.join("; ")}`);
      else changed = true;
    }
    if (asked && sources) await recordSources(theme, prompts!.en.id, sources);
    await sql`update daily_prompts set absorbed_at = now() where day = ${day} and theme = ${theme}`;
  }
  return changed;
}
