// Once a month the prompts whose answers grow (award winners, a studio's films, a list that gains members) are read
// against their sources, and Claude adds the answers they gained; in January it also moves the cut-off years forward.
// It was a GitHub workflow that opened a pull request. The packs live in the database now, so the changes are made
// there at once, through `saveSystemPack`, which keeps the version each replaces, and the admin panel shows them.
import type Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { lookUp } from "../../tools/names";
import { check, reader, type Checked, type Entry, type Listed } from "../../tools/sources";
import { LANGUAGES, type Language } from "../shared/language";
import { MAX_ANSWER_LENGTH, TIERS, type Answer, type Pack, type Tier, type UpdateSummary, type Updated } from "../shared/types";
import { PACK_PREFIX, dayOf } from "./daily";
import { sql } from "./db";
import { normalize } from "./game";
import { validatePack } from "./packs";
import { SOURCE_SCHEMA, guides, keyFailed, research, sourceProblems, text, toSources, type DraftedSource, type Spend } from "./research";
import { loadSystemPack, saveSystemPack } from "./system";

const CURATION = join(import.meta.dir, "../../curation");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE_FIELDS = { en: "en", "zh-CN": "zhCN", "zh-TW": "zhTW" } as const satisfies Record<Language, string>;

const ANSWERS = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["text", "aliases", "tier"],
    properties: { text, aliases: { type: "array", items: text }, tier: { type: "string", enum: Object.keys(TIERS) } },
  },
};
const byLanguage = (schema: object) => ({ type: "object", additionalProperties: false, required: ["en", "zhCN", "zhTW"], properties: { en: schema, zhCN: schema, zhTW: schema } });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["add", "until", "texts", "sources", "skipped"],
  properties: {
    add: byLanguage(ANSWERS),
    until: { type: "integer", description: "The new cut-off year; 0 to leave it" },
    texts: byLanguage({ type: "string", description: "The prompt's text with the new cut-off year; empty to leave it" }),
    sources: { type: "array", items: SOURCE_SCHEMA, description: "The entry's whole sources list, mended; empty to leave it" },
    skipped: { type: "array", items: { type: "object", additionalProperties: false, required: ["value", "why"], properties: { value: text, why: text } } },
  },
};
type Drafted = {
  add: Record<(typeof LANGUAGE_FIELDS)[Language], { text: string; aliases: string[]; tier: Tier }[]>;
  until: number;
  texts: Record<(typeof LANGUAGE_FIELDS)[Language], string>;
  sources: DraftedSource[];
  skipped: { value: string; why: string }[];
};
type Asking = { language: Language; pack: Pack };
type Row = { pack: string; prompt: string; entry: Entry; seen: Listed };

/** An empty table takes the files of `curation/`, if there are any: how a new database gets the sources. Returns how many. */
export async function seedSources(dir = CURATION): Promise<number> {
  const [{ count }] = await sql`select count(*)::int as count from prompt_sources`;
  if (count || !existsSync(dir)) return 0;
  let seeded = 0;
  await sql.begin(async (tx) => {
    for (const file of (await readdir(dir)).filter((name) => name.endsWith(".sources.json")).sort()) {
      const pack = file.slice(0, -".sources.json".length);
      const entries = (await Bun.file(join(dir, file)).json()) as Record<string, Entry>;
      const seenFile = Bun.file(join(dir, `${pack}.seen.json`));
      const seen = (await seenFile.exists()) ? ((await seenFile.json()) as Record<string, Listed>) : {};
      for (const [prompt, entry] of Object.entries(entries)) {
        await tx`insert into prompt_sources (pack, prompt, entry, seen) values (${pack}, ${prompt}, ${entry}, ${seen[prompt] ?? {}})`;
        seeded++;
      }
    }
  });
  return seeded;
}

/** The built-in packs that ask a prompt: a Chinese pack's own, or every language's that has it for an English pack's. */
async function packsAsking(pack: string, prompt: string): Promise<Asking[]> {
  const only = LANGUAGES.find((language) => PACK_PREFIX[language] && pack.startsWith(PACK_PREFIX[language]));
  const stem = only ? pack.slice(PACK_PREFIX[only].length) : pack;
  const asking: Asking[] = [];
  for (const language of only ? [only] : LANGUAGES) {
    const found = await loadSystemPack(PACK_PREFIX[language] + stem);
    if (found?.language === language && found.pack.prompts.some((one) => one.id === prompt)) asking.push({ language, pack: found.pack });
  }
  return asking;
}

/** What is wrong with an entry as a sources file has it. */
function entryProblems(prompt: string, value: unknown): string[] {
  const where = `"${prompt}"`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${where} must be an object`];
  const entry = value as Partial<Entry>;
  const problems: string[] = [];
  if (entry.kind !== "open" && entry.kind !== "cutoff") problems.push(`${where}: kind must be "open" or "cutoff"`);
  if (entry.kind === "cutoff" && !Number.isInteger(entry.until)) problems.push(`${where}: a cutoff entry needs its year in until`);
  if (!Array.isArray(entry.sources) || !entry.sources.length) return [...problems, `${where}: sources must list at least one source`];
  entry.sources.forEach((source, i) => {
    const one = source as Record<string, unknown>;
    const wiki = typeof one.lang === "string" && typeof one.page === "string";
    const table = Number.isInteger(one.table) && (typeof one.column === "string" || Number.isInteger(one.column));
    if (typeof one.url !== "string" && !(wiki && (one.members === true || table))) {
      problems.push(`${where}: source ${i + 1} must name a url, or a lang and page with members, or with a table and column`);
    }
  });
  return problems;
}

/**
 * A pack's sources file, as `curation/<pack>.sources.json` has it, from the admin panel. Its entries replace the pack's,
 * keeping what each kept prompt's sources were last seen to list, so that its next check reports only what is new.
 */
export async function saveSources(pack: string, file: string): Promise<string[]> {
  if (!SLUG.test(pack)) return ["the file must be named after its pack: <pack id>.sources.json"];
  let entries: unknown;
  try {
    entries = JSON.parse(file);
  } catch (error) {
    return [`the file is not valid JSON (${(error as Error).message})`];
  }
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) return ["the file must be an object of entries by prompt id"];
  const problems = Object.entries(entries).flatMap(([prompt, entry]) => entryProblems(prompt, entry));
  for (const prompt of Object.keys(entries)) if (!(await packsAsking(pack, prompt)).length) problems.push(`no built-in pack asks "${prompt}" for ${pack}`);
  if (problems.length) return problems;
  const kept = Object.keys(entries);
  await sql.begin(async (tx) => {
    if (kept.length) await tx`delete from prompt_sources where pack = ${pack} and prompt not in ${tx(kept)}`;
    else await tx`delete from prompt_sources where pack = ${pack}`;
    for (const [prompt, entry] of Object.entries(entries as Record<string, Entry>)) {
      await tx`insert into prompt_sources (pack, prompt, entry) values (${pack}, ${prompt}, ${entry}) on conflict (pack, prompt) do update set entry = excluded.entry`;
    }
  });
  return [];
}

/** A prompt that grows, from now on: what its sources list now is what the next check is read against. */
export async function recordSources(pack: string, prompt: string, entry: Entry) {
  const { now } = await check(entry, undefined, reader());
  await sql`insert into prompt_sources (pack, prompt, entry, seen) values (${pack}, ${prompt}, ${entry}, ${now}) on conflict (pack, prompt) do update set entry = excluded.entry, seen = excluded.seen`;
}

function system(guide: string, skill: string): string {
  return `You keep the built-in prompts of Hadal, a deep-sea diving trivia game, up to date. A prompt such as "Name a country that borders Germany" is shown and the player types one answer, which scores by its tier. An answer that is not listed counts as wrong, so a prompt whose set grows (award winners, a studio's films, a list that gains members) must gain its new answers.

Once a month the game reads the sources of every such prompt and compares them with what they listed last month. You are given one prompt: where its answers come from (its entry: a "cutoff" prompt lists answers up to the year \`until\`, an "open" one stays current; the note says how the source was filtered), the rows its sources gained ("added", each with its value and its whole table row), in January the rows dated past its cut-off ("pastCutoff"), the sources that could not be read ("problems"), and the prompt as every pack that asks it has it now.

1. Decide for every added row whether it is a fair answer to the prompt as worded. Skip rows the note filters out, answers already listed under another spelling, and anything that is not an answer. Give each row you skip in \`skipped\`, with a few words on why.
2. Add each new answer for every pack that asks the prompt, under the name a player would type, with aliases. answer_names gives redirects and Chinese names: the zh-CN pack uses mainland names and the zh-TW pack Taiwan's, each with the other's and the English name as aliases. Look every answer a Chinese pack gains up with answer_names (on its English name, in English Wikipedia), and give it under the Chinese name it finds for that pack's script. Where it finds none but the name itself comes from Chinese (as some star names do), give the Chinese original. Only an answer with no Chinese name at all keeps its English name in a Chinese pack; the game looks those up too, and refuses one that has a Chinese name. Tier each as the curate-pack skill says (new answers are usually rare; answer_reads helps). Never make a new answer a gem. Leave the list of a language whose pack does not ask the prompt empty.
3. Only when there are pastCutoff rows: move the cut-off forward to the newest year the source lists in full (an award whose ceremony has happened, a season that has ended; when unsure, the earlier year). Give it in \`until\`, give the prompt's text with the new year in \`texts\` for every pack that asks it, and add the rows up to that year as in step 2. Otherwise \`until\` is 0 and the texts are empty.
4. For each problem, find where the list is now with wikipedia_tables, and give the entry's whole sources list again, mended, in \`sources\`. Change no answers because of a problem. Otherwise \`sources\` is empty.

The game only adds what you give: it never removes an answer or a prompt, nor changes a prompt's id. Political sensitivity is no reason to leave anything out. Give your final answer only as the JSON asked for.

<packs_guide>
${guide}
</packs_guide>

<curate_pack_skill>
${skill}
</curate_pack_skill>`;
}

const han = (text: string) => /\p{Script=Han}/u.test(text);

/**
 * The prompt with what Claude added, in every pack that asks it, checked as an upload is: new spellings only, no new
 * gem, a cut-off moved only forward, to no later than this year, and in a Chinese pack no answer under an English name
 * that Wikidata (as `names` reads it) has a Chinese name for. Returns the packs and the entry, or what is wrong.
 */
export async function apply(
  drafted: Drafted,
  row: Row,
  asking: Asking[],
  year: number,
  names: typeof lookUp = lookUp,
): Promise<{ packs: Asking[]; entry: Entry; updated: Updated } | string[]> {
  const { entry } = row;
  const problems: string[] = [];
  let until: [number, number] | null = null;
  if (drafted.until) {
    if (entry.kind !== "cutoff" || entry.fixed) problems.push("until: this prompt has no cut-off to move");
    else if (drafted.until <= entry.until! || drafted.until > year) problems.push(`until: a new cut-off must be after ${entry.until} and no later than ${year}`);
    else until = [entry.until!, drafted.until];
  }
  const mended = drafted.sources.length > 0;
  const next: Entry = { ...entry, ...(until && { until: until[1] }), ...(mended && { sources: toSources(drafted.sources) }) };
  if (mended) problems.push(...(await sourceProblems(next)).map((problem) => `sources: ${problem}`));
  const packs: Asking[] = [];
  const added: Record<string, string[]> = {};
  let text = "";
  for (const { language, pack } of asking) {
    const field = LANGUAGE_FIELDS[language];
    const prompt = pack.prompts.find((one) => one.id === row.prompt)!;
    const spellings = new Set(prompt.answers.flatMap((answer) => [answer.text, ...(answer.aliases ?? [])]).map(normalize));
    const fresh = (spelling: string) => {
      const key = normalize(spelling);
      if (!key || spelling.length > MAX_ANSWER_LENGTH || spellings.has(key)) return false;
      spellings.add(key);
      return true;
    };
    const gained = drafted.add[field].flatMap((answer): Answer[] => {
      const spelling = answer.text.trim();
      if (!fresh(spelling)) return [];
      const aliases = answer.aliases.map((alias) => alias.trim()).filter(fresh);
      return [{ text: spelling, ...(aliases.length > 0 && { aliases }), tier: answer.tier === "gem" ? "rare" : answer.tier }];
    });
    const newText = until ? drafted.texts[field].trim() : "";
    if (until && !newText) problems.push(`${language}: give the prompt's text with the new cut-off year`);
    const changed = { ...prompt, ...(newText && { text: newText }), answers: [...prompt.answers, ...gained] };
    const updated = { ...pack, prompts: pack.prompts.map((one) => (one.id === prompt.id ? changed : one)) };
    problems.push(...validatePack(updated).map((problem) => `${language}: ${problem}`));
    packs.push({ language, pack: updated });
    added[language] = gained.map((answer) => answer.text);
    text ||= changed.text;
    if (language !== "en") {
      const english = gained.filter((answer) => ![answer.text, ...(answer.aliases ?? [])].some(han)).map((answer) => answer.text);
      const found = english.length ? await names(english, "en") : new Map();
      for (const answer of english) {
        const chinese = found.get(answer)?.[language === "zh-CN" ? "zhCN" : "zhTW"];
        if (chinese) problems.push(`${language}: "${answer}" has the Chinese name ${chinese} on Wikidata: give it under that name, with "${answer}" among its aliases`);
      }
    }
  }
  if (problems.length) return problems;
  const shown = added.en ?? Object.values(added)[0] ?? [];
  const skipped = drafted.skipped.map(({ value, why }) => `${value}: ${why}`);
  return { packs, entry: next, updated: { pack: row.pack, prompt: row.prompt, text, added: shown, until, mended, skipped, failed: null } };
}

/** Reads every prompt's sources, has Claude add what they gained, and saves it. Throws only when the key fails. */
export async function updatePacks(client: Anthropic, month: string, year = Number(month.slice(0, 4))): Promise<UpdateSummary> {
  const summary: UpdateSummary = { month, prompts: [], problems: [], used: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, searches: 0 } };
  const spend: Spend = async (usage) => {
    summary.used.input += usage.input_tokens;
    summary.used.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    summary.used.cacheRead += usage.cache_read_input_tokens ?? 0;
    summary.used.output += usage.output_tokens;
    summary.used.searches += usage.server_tool_use?.web_search_requests ?? 0;
  };
  const bump = month.endsWith("-01");
  const read = reader();
  const { guide, skill } = await guides();
  const systemText = system(guide, skill);
  for (const row of (await sql`select pack, prompt, entry, seen from prompt_sources order by pack, prompt`) as Row[]) {
    const checked: Checked = await check(row.entry, row.seen, read, bump, year);
    summary.problems.push(...checked.problems.map((problem) => `${row.pack}/${row.prompt}: ${problem}`));
    const save = (entry: Entry, seen: Listed) => sql`update prompt_sources set entry = ${entry}, seen = ${seen} where pack = ${row.pack} and prompt = ${row.prompt}`;
    if (!checked.added.length && !checked.pastCutoff.length && !checked.problems.length) {
      await save(row.entry, checked.now);
      continue;
    }
    const asking = await packsAsking(row.pack, row.prompt);
    if (!asking.length) {
      summary.problems.push(`${row.pack}/${row.prompt}: no built-in pack asks it`);
      continue;
    }
    const content = JSON.stringify({
      prompt: row.prompt,
      entry: row.entry,
      added: checked.added,
      ...(bump && { pastCutoff: checked.pastCutoff }),
      problems: checked.problems,
      year,
      packs: asking.map(({ language, pack }) => ({ language, pack: pack.id, prompt: pack.prompts.find((one) => one.id === row.prompt) })),
    });
    try {
      const done = await research(client, {
        system: systemText,
        content,
        schema: SCHEMA,
        spend,
        accept: async (answer) => apply(answer as Drafted, row, asking, year),
      });
      for (const { language, pack } of done.packs) {
        const saved = await saveSystemPack(language, pack, false);
        if ("problems" in saved) throw new Error(`${pack.id} could not be saved: ${saved.problems.join("; ")}`);
      }
      await save(done.entry, done.updated.mended ? (await check(done.entry, undefined, read)).now : checked.now);
      summary.prompts.push(done.updated);
      console.log(`update ${month}: ${row.pack}/${row.prompt}: added ${done.updated.added.length}${done.updated.until ? `, cut-off moved to ${done.updated.until[1]}` : ""}`);
    } catch (error) {
      if (keyFailed(error)) throw error;
      const text = asking[0]!.pack.prompts.find((one) => one.id === row.prompt)!.text;
      summary.prompts.push({ pack: row.pack, prompt: row.prompt, text, added: [], until: null, mended: false, skipped: [], failed: String((error as Error).message ?? error) });
      console.error(`update ${month}: ${row.pack}/${row.prompt} failed: ${(error as Error).message ?? error}`);
    }
  }
  return summary;
}

/** Runs the month's update unless it has run. Says whether any pack changed. */
export async function updateIfDue(client: Anthropic): Promise<boolean> {
  const month = dayOf().slice(0, 7);
  const [done] = await sql`select 1 from pack_updates where month = ${month}`;
  if (done) return false;
  const summary = await updatePacks(client, month);
  await sql`insert into pack_updates (month, summary) values (${month}, ${summary}) on conflict (month) do update set summary = excluded.summary, ran_at = now()`;
  return summary.prompts.some((prompt) => prompt.added.length || prompt.until);
}

export async function lastUpdate(): Promise<UpdateSummary | null> {
  const [row] = await sql`select summary from pack_updates order by month desc limit 1`;
  return row?.summary ?? null;
}
