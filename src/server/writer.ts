// Claude writes each day's daily dive the day before, with the instance's own key: one new prompt for each of the
// day's themes, in English and then in both Chinese, made as docs/PACKS.md and the curate-pack skill say.
import Anthropic from "@anthropic-ai/sdk";
import type { Entry } from "../../tools/sources";
import { LANGUAGES, type Language } from "../shared/language";
import { TIERS, type Pack, type Prompt } from "../shared/types";
import { absorbDays } from "./absorb";
import { DAY_MS, PACK_PREFIX, dailyThemes, dayOf, seeded, type Written } from "./daily";
import { sql } from "./db";
import { normalize } from "./game";
import { tidy } from "./generate";
import { MAX_PROMPT_LENGTH, validatePack } from "./packs";
import { INSTANCE_KEY, SOURCE_SCHEMA, askOnce, guides, keyFailed, promptList, research, sourceProblems, text, toSources, type DraftedSource, type Spend } from "./research";
import { updateIfDue } from "./updates";

/** Attempts at a theme's prompt before the day asks one of the pack's own instead. */
const TRIES = 2;
/** Prompts the reviewer may reject in one attempt before it is given up. */
const REJECTIONS = 4;
/** How often the server looks whether a day is over (its prompts then join their packs), whether the month's update is due, and whether tomorrow's daily dive is written. */
const LOOK_EVERY_MS = 10 * 60 * 1000;

const LANGUAGE_FIELDS = { en: "en", "zh-CN": "zhCN", "zh-TW": "zhTW" } as const satisfies Record<Language, string>;

const PROMPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "answers"],
  properties: {
    text,
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "aliases", "tier"],
        properties: { text, aliases: { type: "array", items: text }, tier: { type: "string", enum: Object.keys(TIERS) } },
      },
    },
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["en", "zhCN", "zhTW", "sources"],
  properties: {
    en: PROMPT_SCHEMA,
    zhCN: PROMPT_SCHEMA,
    zhTW: PROMPT_SCHEMA,
    sources: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "until", "fixed", "sources", "note"],
      properties: {
        kind: { type: "string", enum: ["none", "open", "cutoff"], description: "none for a set that does not grow" },
        until: { type: "integer", description: "The cut-off year of a cutoff prompt; 0 otherwise" },
        fixed: { type: "boolean" },
        sources: { type: "array", items: SOURCE_SCHEMA },
        note: text,
      },
    },
  },
};
const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["accepted", "reasons"],
  properties: { accepted: { type: "boolean" }, reasons: { type: "array", items: text } },
};
type Review = { accepted: boolean; reasons: string[] };
type DraftedPrompt = { text: string; answers: { text: string; aliases: string[]; tier: Prompt["answers"][number]["tier"] }[] };
type Drafted = Record<(typeof LANGUAGE_FIELDS)[Language], DraftedPrompt> & {
  sources: { kind: "none" | Entry["kind"]; until: number; fixed: boolean; sources: DraftedSource[]; note: string };
};
/** A written prompt, and where its answers come from if its set grows. */
export type Writing = { prompt: Written; sources: Entry | null };

const PROPOSE: Anthropic.Beta.BetaToolUnion = {
  name: "propose_prompt",
  description:
    "Before writing any answers, propose the prompt you chose. A reviewer who has not seen your research checks it against the eight points of a good prompt and the game's prompts, and accepts or rejects it, saying why. Only an accepted prompt, worded exactly as accepted, may be your final answer; reword or replace a rejected one and propose again.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["text", "source", "edges"],
    properties: {
      text: { type: "string", description: `The prompt in English, at most ${MAX_PROMPT_LENGTH} characters` },
      source: { type: "string", description: "The source that lists the whole set, and about how many answers it has" },
      edges: { type: "string", description: "Five answers a player might argue for, and how the prompt's own words rule each in or out" },
    },
  },
};

/** The same for every theme of a day, so that it is read from the cache after the first. */
async function system(packs: Record<Language, Pack[]>): Promise<string> {
  const { guide, skill } = await guides();
  return `You write prompts for Hadal, a deep-sea diving trivia game. A prompt such as "Name a country that borders Germany" is shown and the player types one answer. A correct answer scores by its tier: the answers few players think of take the diver deepest. An answer that is not listed counts as wrong, so a list with gaps punishes exactly the well-read players the game rewards.

Every day the game's daily dive asks everyone the same ten new prompts, one from each of ten of its built-in packs, and when the day is over each joins its pack for good. You write one of them: a new prompt for the pack the message names, in English, then in Simplified Chinese and in Traditional Chinese as written in Taiwan.

How the built-in packs are made is below: docs/PACKS.md, the guide to a good prompt, answer list and tiers, and the curate-pack skill, the steps a curator follows. Follow both, with these differences:
- You work alone and nobody reviews your prompt before players see it. Where the skill says to show the owner or let them choose, decide yourself, and check your own work as strictly as the owner would.
- There are no files, no review page and no players' counts yet. The skill's commands are tools here: \`tools/table.ts\` is wikipedia_tables, \`tools/members.ts\` is wikipedia_links, \`tools/names.ts\` is answer_names and \`tools/signals.ts\` is answer_reads. You can also search the web and read pages. The game checks the pack format itself when you are done.
- Draft several candidate prompts, test each against the eight points of a good prompt, and choose the best one. Propose it with propose_prompt before writing any answers: a strict reviewer accepts or rejects it. Then build the accepted prompt's complete answer list from sources, add aliases, and tier it.
- Every answer is written in three languages, so choose a set of at most about 500 answers.
- The prompt must not ask for the same set as any prompt the game has, nor nearly the same set, nor a subset or superset of one: every built-in prompt is listed at the end, by pack. Asking about the same subject is fine; asking for the same things is not.
- The Chinese versions ask the same prompt: the prompt in Chinese, every answer under its Chinese name with the English name among its aliases, as the skill's last section says. Tier them for Chinese players.
- If the prompt's set can grow (a cut-off year, a living person's work, a list that gains members), give its Wikipedia sources in \`sources\`, as the skill says for curation/<id>.sources.json: the game reads them every month and adds the answers they gain, so name the tables and columns (or the pages read with wikipedia_links) your answer list came from. The game reads them before taking the prompt. For a set that cannot grow, give kind none and no sources.
- Give your final answer only as the JSON asked for, after all your research, with the English text exactly as the reviewer accepted it.

<packs_guide>
${guide}
</packs_guide>

<curate_pack_skill>
${skill}
</curate_pack_skill>

<built_in_prompts>
${promptList(packs.en)}
</built_in_prompts>`;
}

/** The reviewer's: the guide and the game's prompts, but nothing of the writer's research, for a fresh and strict read. */
async function reviewerSystem(packs: Record<Language, Pack[]>): Promise<string> {
  const { guide } = await guides();
  return `You review a prompt proposed for one of the built-in packs of Hadal, a trivia game in which the player types one answer to a prompt and rarer correct answers score more. The prompt was written by Claude for the game's daily dive, and nobody else checks it before players see it. Its answers are not written yet.

Accept it only if it meets every one of the eight points of a good prompt in the guide below, avoids the patterns the guide says to avoid, and asks for no set the game already asks: not the same set, nearly the same set, a subset or a superset of one (every built-in prompt is listed at the end). Asking about the same subject as another prompt is fine.

Be strict, and reject when in doubt. Try to break it as the guide says: think of answers a player could fairly argue for, and check that the prompt's own words rule each one in or out. Reject a set whose edges are left to judgement, or that no single source lists whole. "Name a kind of cake" is such a prompt: is a birthday cake a kind of cake, or vanilla cake, or a Jaffa Cake? Nobody can list every cake, so a fair answer would be marked wrong.

Give a few short reasons. When you reject a prompt that could be saved, say how it could be narrowed or reworded.

<packs_guide>
${guide}
</packs_guide>

<built_in_prompts>
${promptList(packs.en)}
</built_in_prompts>`;
}

/** The pack and two of its prompts in full, in every language, as the owner made them: the standard to meet. */
function brief(theme: string, packs: Record<Language, Pack[]>): string {
  const packOf = (language: Language) => packs[language].find((pack) => pack.id === PACK_PREFIX[language] + theme)!;
  const en = packOf("en");
  // The two nearest 60 answers: long enough to show the tiers' pyramid, short enough to read.
  const shown = en.prompts.toSorted((a, b) => Math.abs(a.answers.length - 60) - Math.abs(b.answers.length - 60)).slice(0, 2);
  const examples = shown.map((prompt) => {
    const versions = Object.fromEntries(LANGUAGES.map((language) => [LANGUAGE_FIELDS[language], packOf(language).prompts.find((one) => one.id === prompt.id) ?? null]));
    return JSON.stringify(versions);
  });
  return `Write a new prompt for the pack "${en.name}" (${theme}).

Two of its prompts in full, in all three languages, as the owner made them:
${examples.join("\n")}`;
}

/**
 * Makes the drafted prompt what the packs take: its spellings tidied as a player's written pack is, then checked as an
 * uploaded pack is. Returns the prompt in each language, or what is wrong with it.
 */
function check(drafted: Drafted, theme: string, id: string, packs: Record<Language, Pack[]>): Written | string[] {
  const problems: string[] = [];
  const written: Partial<Written> = {};
  for (const language of LANGUAGES) {
    const pack = packs[language].find((one) => one.id === PACK_PREFIX[language] + theme)!;
    const tidied = tidy({ name: pack.name, prompts: [drafted[LANGUAGE_FIELDS[language]]] }, pack.id).prompts[0];
    if (!tidied) {
      problems.push(`${language}: the prompt must have text of at most ${MAX_PROMPT_LENGTH} characters and at least two answers`);
      continue;
    }
    const prompt = { ...tidied, id };
    problems.push(...validatePack({ id: pack.id, name: pack.name, prompts: [prompt] }).map((problem) => `${language}: ${problem}`));
    if (pack.prompts.some((one) => normalize(one.text) === normalize(prompt.text))) problems.push(`${language}: the pack already asks "${prompt.text}"`);
    written[language] = prompt;
  }
  return problems.length ? problems : (written as Written);
}

/** Where a drafted prompt's answers come from, as the monthly update reads it; null for a set that does not grow. */
function entryOf({ kind, until, fixed, sources, note }: Drafted["sources"]): Entry | null {
  if (kind === "none") return null;
  return { kind, ...(kind === "cutoff" && { until }), ...(fixed && { fixed }), sources: toSources(sources), ...(note && { note }) };
}

/** The year a prompt's own words stop at ("to 2026", "to the 2026 Oscars"), which its sources must stop at too. */
const cutoffIn = (text: string) => Number(/\bto (?:the )?(\d{4})\b/i.exec(text)?.[1]) || null;

/** A prompt id from its English text, cut at a whole word, unused in the theme's packs and by the prompts written for it before. */
async function freeId(theme: string, englishText: string, packs: Record<Language, Pack[]>): Promise<string> {
  const taken = new Set(LANGUAGES.flatMap((language) => packs[language].find((pack) => pack.id === PACK_PREFIX[language] + theme)?.prompts.map((prompt) => prompt.id) ?? []));
  for (const row of await sql`select prompts from daily_prompts where theme = ${theme} and prompts is not null`) taken.add((row.prompts as Written).en.id);
  // Room for a "-2" after it, within the 40 characters an id may have.
  const words = englishText.toLowerCase().replace(/^name an? /, "").split(/[^a-z0-9]+/).filter(Boolean);
  let slug = words[0]?.slice(0, 37) ?? "daily";
  for (const word of words.slice(1)) {
    if (`${slug}-${word}`.length > 37) break;
    slug += `-${word}`;
  }
  for (let n = 1; ; n++) {
    const id = n === 1 ? slug : `${slug}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * One attempt at a theme's prompt: Claude researches with the tools and proposes a prompt, which a reviewer must accept,
 * then answers with the prompt, and fixes what the game refuses.
 */
export async function writePrompt(client: Anthropic, theme: string, day: string, packs: Record<Language, Pack[]>, systemText: string, reviewerText: string): Promise<Writing> {
  const spend: Spend = (usage) => sql`
    update daily_prompts set
      input_tokens = input_tokens + ${usage.input_tokens},
      cache_write_tokens = cache_write_tokens + ${usage.cache_creation_input_tokens ?? 0},
      cache_read_tokens = cache_read_tokens + ${usage.cache_read_input_tokens ?? 0},
      output_tokens = output_tokens + ${usage.output_tokens},
      searches = searches + ${usage.server_tool_use?.web_search_requests ?? 0}
    where day = ${day} and theme = ${theme}`;
  const pack = packs.en.find((one) => one.id === theme)!;
  let rejections = 0;
  const accepted = new Set<string>();
  return research<Writing>(client, {
    system: systemText,
    content: brief(theme, packs),
    schema: SCHEMA,
    spend,
    tools: [PROPOSE],
    handle: async (name, input) => {
      if (name !== "propose_prompt") return undefined;
      const proposed = String(input.text);
      // Refused before it is paid for, and not counted against the attempt.
      if (proposed.length > MAX_PROMPT_LENGTH) return `Rejected: the prompt is ${proposed.length} characters, and may have at most ${MAX_PROMPT_LENGTH}`;
      const content = `Pack: ${pack.name} (${theme})\nProposed prompt: ${proposed}\nThe source that lists the whole set: ${String(input.source)}\nAnswers a player might argue for, and how the prompt rules each: ${String(input.edges)}`;
      const verdict = (await askOnce<Review>(client, reviewerText, content, REVIEW_SCHEMA, spend)) ?? { accepted: false, reasons: ["the review could not be had: propose it again"] };
      console.log(`daily ${day}: ${theme}: "${proposed}" ${verdict.accepted ? "accepted" : "rejected"}: ${verdict.reasons.join(" / ")}`);
      if (verdict.accepted) accepted.add(normalize(proposed));
      else if (++rejections >= REJECTIONS) throw new Error(`the reviewer rejected ${rejections} prompts`);
      return `${verdict.accepted ? "Accepted" : "Rejected"}:\n- ${verdict.reasons.join("\n- ")}`;
    },
    accept: async (answer) => {
      const drafted = answer as Drafted;
      if (!accepted.has(normalize(drafted.en.text))) return ["the reviewer has not accepted this prompt: propose it with propose_prompt, and give it worded exactly as accepted"];
      const checked = check(drafted, theme, await freeId(theme, drafted.en.text, packs), packs);
      const sources = entryOf(drafted.sources);
      const problems = [...(Array.isArray(checked) ? checked : []), ...(sources ? (await sourceProblems(sources)).map((problem) => `sources: ${problem}`) : [])];
      const stops = cutoffIn(drafted.en.text);
      if (stops && (sources?.kind !== "cutoff" || sources.until !== stops)) problems.push(`sources: the prompt stops at ${stops}, so its sources must be kind cutoff with until ${stops}`);
      return problems.length ? problems : { prompt: checked as Written, sources };
    },
  });
}

/**
 * The day's set, once every theme has its prompt or has had its tries: the written prompts in the day's order, and for a
 * theme whose prompt could not be written, one of its pack's own. Kept in `daily_sets`, unless the day began without it.
 */
export async function finish(day: string, themes: string[], packs: Record<Language, Pack[]>) {
  const rows = await sql`select theme, prompts from daily_prompts where day = ${day}`;
  const written = new Map<string, Written | null>(rows.map((row: { theme: string; prompts: Written | null }) => [row.theme, row.prompts]));
  for (const language of LANGUAGES) {
    const ids = themes.map((theme) => {
      const pack = packs[language].find((one) => one.id === PACK_PREFIX[language] + theme)!;
      const prompt = written.get(theme)?.[language] ?? pack.prompts[Math.floor(seeded(`${day}/${theme}`)() * pack.prompts.length)]!;
      return `${pack.id}/${prompt.id}`;
    });
    await sql`insert into daily_sets (day, language, prompts) values (${day}, ${language}, ${ids}::jsonb) on conflict do nothing`;
  }
}

/** Writes the day's prompts that are still to be written, then its set. Stops once the day has begun: it then has a set. */
async function writeDay(client: Anthropic, day: string, packs: Record<Language, Pack[]>, written: () => Promise<void>) {
  const [done] = await sql`select 1 from daily_sets where day = ${day} limit 1`;
  if (done) return;
  const themes = dailyThemes(packs, day);
  const systemText = await system(packs);
  const reviewerText = await reviewerSystem(packs);
  for (const theme of themes) {
    if (dayOf() >= day) return;
    const [row] = await sql`select prompts, tries from daily_prompts where day = ${day} and theme = ${theme}`;
    if (row?.prompts || row?.tries >= TRIES) continue;
    await sql`
      insert into daily_prompts (day, theme, tries) values (${day}, ${theme}, 1)
      on conflict (day, theme) do update set tries = daily_prompts.tries + 1`;
    try {
      const { prompt, sources } = await writePrompt(client, theme, day, packs, systemText, reviewerText);
      await sql`update daily_prompts set prompts = ${prompt}, sources = ${sources} where day = ${day} and theme = ${theme}`;
      console.log(`daily ${day}: wrote "${prompt.en.text}" for ${theme}`);
    } catch (error) {
      console.error(`daily ${day}: could not write a prompt for ${theme}: ${(error as Error).message ?? error}`);
      if (keyFailed(error)) {
        await sql`update daily_prompts set tries = tries - 1 where day = ${day} and theme = ${theme}`;
        return;
      }
    }
  }
  const [left] = await sql`select count(*)::int as left from daily_prompts where day = ${day} and prompts is null and tries < ${TRIES}`;
  const [had] = await sql`select count(*)::int as had from daily_prompts where day = ${day}`;
  if (left.left || had.had < themes.length || dayOf() >= day) return;
  // The prompts are judged from the moment the set names them.
  await written();
  await finish(day, themes, packs);
}

/**
 * Kept on `globalThis` because `bun --hot` runs this module afresh on every change, and a writing it had begun goes on:
 * a second would pay for every prompt twice.
 */
const state = ((globalThis as { hadalDailyWriter?: { running: boolean; timer?: ReturnType<typeof setInterval> } }).hadalDailyWriter ??= { running: false });

/**
 * With the instance's key, every 10 minutes and now: brings the prompts of the days that are over into their packs, runs
 * the month's update of the prompts that grow when it is due, and writes tomorrow's daily dive.
 */
export function startWriting(packs: () => Record<Language, Pack[]>, written: () => Promise<void>) {
  if (!INSTANCE_KEY) return;
  const client = new Anthropic({ apiKey: INSTANCE_KEY, maxRetries: 8 });
  const look = async () => {
    if (state.running) return;
    state.running = true;
    try {
      if (await absorbDays()) await written();
      if (await updateIfDue(client)) await written();
      await writeDay(client, dayOf(Date.now() + DAY_MS), packs(), written);
    } catch (error) {
      console.error("daily: the work failed", error);
    } finally {
      state.running = false;
    }
  };
  clearInterval(state.timer);
  state.timer = setInterval(() => void look(), LOOK_EVERY_MS);
  void look();
}
