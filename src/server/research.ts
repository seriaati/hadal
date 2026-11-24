// Claude on the instance's own key, for the daily writer and the monthly update: the pack tools as functions it can
// call, the web, and a loop that ends in JSON of a schema, which the game checks and sends back while it is wrong.
import Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { lookUp } from "../../tools/names";
import { readsOf } from "../../tools/signals";
import { check, reader, type Entry, type Source } from "../../tools/sources";
import { tables } from "../../tools/table";
import { members } from "../../tools/wiki";
import type { Pack } from "../shared/types";
import { FETCHES_PER_REQUEST, MAX_FETCHED_TOKENS, SEARCHES_PER_REQUEST } from "../shared/cost";

export const INSTANCE_KEY = process.env.HADAL_DAILY_KEY;
export const INSTANCE_MODEL = process.env.HADAL_DAILY_MODEL || "claude-opus-5-5";
/** Requests in one conversation: the research, the answer, and a few rounds of fixing what the game refused. */
const MAX_TURNS = 60;
const FIXES = 3;
/** A tool's answer is cut to this many characters (about 20,000 tokens); the rest is asked for in parts. */
const MAX_RESULT = 80_000;
const ROOT = join(import.meta.dir, "../..");

export const text = { type: "string" };
const language = { type: "string", enum: ["en", "zh"], description: "en for English Wikipedia, zh for Chinese Wikipedia (both Chinese packs)" };
const names = { type: "array", items: text, description: "Answers, or the article titles they mean (as wikipedia_tables gives them with links)" };
const hint = { type: "string", description: 'Tried when a name leads to no article or to a disambiguation page, as Wikipedia words such titles: "dog breed" for "Boxer (dog breed)"' };

/** The commands of the curate-pack skill, as tools, and the web. */
export const RESEARCH_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "wikipedia_tables",
    description:
      "The tables (class wikitable) of a Wikipedia page, as tab-separated rows, a cell spanning rows repeated in each. Most lists an answer list starts from are tables. With `links`, a cell gives the title of the article it first links to instead of its text: the name answer_names and answer_reads look it up by. A long answer comes in parts: ask again with `from`.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["page", "language"],
      properties: {
        page: text,
        language,
        links: { type: "boolean" },
        table: { type: "integer", description: "Only this table, counted from 1" },
        from: { type: "integer", description: "The first row to give, counted from 1 across the tables given" },
      },
    },
  },
  {
    name: "wikipedia_links",
    description: 'Every article a page links to, or every article in a category ("Category:Dog breeds"): candidates for a list, to keep the members of and drop the rest.',
    input_schema: { type: "object", additionalProperties: false, required: ["source", "language"], properties: { source: text, language } },
  },
  {
    name: "answer_names",
    description:
      "Other names of each answer: the article it leads to, the titles that redirect there (aliases a player could type, among old forms and nicknames to leave out), and its names on Wikidata in English, Simplified Chinese and Traditional Chinese as written in Taiwan.",
    input_schema: { type: "object", additionalProperties: false, required: ["answers", "language"], properties: { answers: names, language, hint } },
  },
  {
    name: "answer_reads",
    description:
      "How often each answer's article was read in the last 60 days, and the tier that suggests. `known` for a set most players know well (countries, capitals), where the suggestions are otherwise far too rare.",
    input_schema: { type: "object", additionalProperties: false, required: ["answers", "language", "known"], properties: { answers: names, language, hint, known: { type: "boolean" } } },
  },
  { type: "web_search_20260318", name: "web_search", max_uses: SEARCHES_PER_REQUEST, response_inclusion: "excluded" },
  { type: "web_fetch_20260318", name: "web_fetch", max_uses: FETCHES_PER_REQUEST, max_content_tokens: MAX_FETCHED_TOKENS, response_inclusion: "excluded" },
];

const cut = (result: string) => (result.length > MAX_RESULT ? `${result.slice(0, MAX_RESULT)}\n[cut here: ask for the rest with \`from\`]` : result);

/** Runs one of the research tools; what goes wrong is told to Claude, who may try again another way. */
async function use(name: string, input: Record<string, unknown>): Promise<string> {
  const wiki = input.language === "zh" ? "zh" : "en";
  const list = Array.isArray(input.answers) ? input.answers.filter((one): one is string => typeof one === "string") : [];
  const hinted = typeof input.hint === "string" ? input.hint : undefined;
  if (name === "wikipedia_tables" && typeof input.page === "string") {
    const all = await tables(input.page, wiki);
    const chosen = typeof input.table === "number" ? [all[input.table - 1] ?? []] : all;
    const lines = chosen.flatMap((rows, i) => [
      `## Table ${typeof input.table === "number" ? input.table : i + 1} (${rows.length} rows)`,
      ...rows.map((row) => row.map((cell) => (input.links && cell.link ? cell.link : cell.text)).join("\t")),
    ]);
    const from = typeof input.from === "number" ? Math.max(1, input.from) : 1;
    return cut(lines.slice(from - 1).join("\n")) || "No tables on this page";
  }
  if (name === "wikipedia_links" && typeof input.source === "string") return cut((await members(input.source, wiki)).join("\n")) || "No links";
  if (name === "answer_names" && list.length) {
    const found = await lookUp(list, wiki, hinted);
    return cut(
      JSON.stringify(
        Object.fromEntries(
          list.map((answer) => {
            const { article, redirects, zhCN, zhTW } = found.get(answer)!;
            return [answer, { title: article?.title ?? null, redirects, zhCN, zhTW }];
          }),
        ),
      ),
    );
  }
  if (name === "answer_reads" && list.length) {
    const reads = await readsOf(list, wiki, input.known ? "known" : "open", hinted);
    return cut(JSON.stringify(Object.fromEntries(list.map((answer, i) => [answer, { title: reads[i]!.title, views: reads[i]!.views, suggested: reads[i]!.suggested }]))));
  }
  throw new Error(`${name} was asked with what it does not take: ${JSON.stringify(input).slice(0, 200)}`);
}

/** docs/PACKS.md and the curate-pack skill, read afresh, so that a change to either changes what Claude is told. */
export async function guides(): Promise<{ guide: string; skill: string }> {
  return {
    guide: await Bun.file(join(ROOT, "docs/PACKS.md")).text(),
    skill: await Bun.file(join(ROOT, ".claude/skills/curate-pack/SKILL.md")).text(),
  };
}

/** Every English prompt, by pack: the prompts a new one must not repeat. */
export const promptList = (packs: Pack[]) => packs.map((pack) => [`## ${pack.name} (${pack.id})`, ...pack.prompts.map((prompt) => `- ${prompt.text}`)].join("\n")).join("\n\n");

/** What a request used of the key. */
export type Spend = (usage: Anthropic.Beta.BetaUsage) => Promise<unknown>;

const request = (schema: Record<string, unknown>, maxTokens: number) => ({
  model: INSTANCE_MODEL,
  max_tokens: maxTokens,
  // If the model declines on policy grounds, Anthropic tries again on the model it recommends instead.
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
  output_config: { effort: "high" as const, format: { type: "json_schema" as const, schema } },
});

/** One request with no tools, answered with JSON of `schema`; null if Claude declined or the answer could not be read. */
export async function askOnce<T>(client: Anthropic, system: string, content: string, schema: Record<string, unknown>, spend: Spend): Promise<T | null> {
  const message = await client.beta.messages
    .stream({ ...request(schema, 32000), system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content }] })
    .finalMessage();
  await spend(message.usage);
  if (message.stop_reason === "refusal") return null;
  try {
    return JSON.parse(message.content.map((block) => (block.type === "text" ? block.text : "")).join("")) as T;
  } catch {
    return null;
  }
}

export type Research<T> = {
  system: string;
  content: string;
  schema: Record<string, unknown>;
  spend: Spend;
  /** Tools of its own, before the research tools, run by `handle`, which may throw to end the conversation. */
  tools?: Anthropic.Beta.BetaToolUnion[];
  handle?: (name: string, input: Record<string, unknown>) => Promise<string | undefined>;
  /** What the final JSON makes, or what is wrong with it, which is sent back to be fixed. */
  accept: (answer: unknown) => Promise<T | string[]>;
};

/** A conversation in which Claude researches with the tools, then answers with JSON that `accept` takes. Throws when it cannot. */
export async function research<T>(client: Anthropic, { system, content, schema, spend, tools = [], handle, accept }: Research<T>): Promise<T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  let fixes = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Streamed, because a request takes minutes: a connection that carries nothing for that long may be dropped.
    const message = await client.beta.messages
      .stream({ ...request(schema, 128000), cache_control: { type: "ephemeral" }, system, tools: [...tools, ...RESEARCH_TOOLS], messages })
      .finalMessage();
    await spend(message.usage);
    if (message.stop_reason === "refusal") throw new Error("Claude declined");
    if (message.stop_reason === "max_tokens") throw new Error("the answer was too long");
    messages.push({ role: "assistant", content: message.content });
    // A long run of searches is paused by Anthropic, and goes on when what was said so far is sent back.
    if (message.stop_reason === "pause_turn") continue;
    const calls = message.content.filter((block) => block.type === "tool_use");
    if (calls.length) {
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const input = (call.input ?? {}) as Record<string, unknown>;
          const own = await handle?.(call.name, input);
          if (own !== undefined) return { type: "tool_result", tool_use_id: call.id, content: own };
          try {
            return { type: "tool_result", tool_use_id: call.id, content: await use(call.name, input) };
          } catch (error) {
            return { type: "tool_result", tool_use_id: call.id, content: String((error as Error).message ?? error), is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }
    // The answer is the text after the last tool: what Claude says before one is not part of it.
    const last = message.content.findLastIndex((block) => block.type !== "text" && block.type !== "thinking");
    let answer: unknown;
    try {
      answer = JSON.parse(message.content.slice(last + 1).map((block) => (block.type === "text" ? block.text : "")).join(""));
    } catch {
      throw new Error("the answer was not JSON");
    }
    const accepted = await accept(answer);
    if (!Array.isArray(accepted)) return accepted;
    if (++fixes > FIXES) throw new Error(`the game kept refusing it: ${accepted.slice(0, 3).join("; ")}`);
    messages.push({ role: "user", content: `The game refused it:\n- ${accepted.slice(0, 30).join("\n- ")}\nFix these and give the whole answer again.` });
  }
  throw new Error("it took too many requests");
}

/** A key that is refused or out of credit fails every request alike, so the work waits for the next look. */
export const keyFailed = (error: unknown) =>
  error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || (error instanceof Anthropic.APIError && error.type === "billing_error");

/** A Wikipedia source as Claude gives it: the schema has no optional fields, so a table of 0 means none. */
export const SOURCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lang", "page", "table", "column", "members"],
  properties: {
    lang: { type: "string", enum: ["en", "zh"] },
    page: text,
    table: { type: "integer", description: "The table, counted from 1, as wikipedia_tables numbers them; 0 with members" },
    column: { type: "string", description: "The column's header, or its number from 1 in a table with no header row; empty with members" },
    members: { type: "boolean", description: "Every article the page links to, or every article in the category, rather than a table" },
  },
};
export type DraftedSource = { lang: string; page: string; table: number; column: string; members: boolean };

export const toSources = (drafted: DraftedSource[]): Source[] =>
  drafted.map(({ lang, page, table, column, members: linked }) =>
    linked ? { lang, page, members: true } : { lang, page, table, column: /^\d+$/.test(column) ? Number(column) : column },
  );

/** What is wrong with sources: one that cannot be read, or lists nothing. */
export async function sourceProblems(entry: Entry): Promise<string[]> {
  if (!entry.sources.length) return ["give at least one source"];
  if (entry.kind === "cutoff" && !entry.until) return ["a cut-off prompt needs its year in until"];
  const checked = await check(entry, undefined, reader());
  return [...checked.problems, ...Object.entries(checked.now).flatMap(([key, values]) => (values.length ? [] : [`${key} lists nothing`]))];
}

