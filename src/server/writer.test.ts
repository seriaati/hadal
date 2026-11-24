import { afterAll, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { Language } from "../shared/language";
import type { Pack } from "../shared/types";
import { dailyThemes, writtenPacks, type Written } from "./daily";
import { migrate, sql } from "./db";
import { finish, writePrompt } from "./writer";

// These tests need the database (`docker compose up -d db`). They use a day far in the past, whose rows are removed afterwards.
await migrate();
const DAY = "1999-01-02";

afterAll(async () => {
  await sql`delete from daily_prompts where day = ${DAY}`;
  await sql`delete from daily_sets where day = ${DAY}`;
});

const prompt = (id: string, text: string) => ({ id, text, answers: [{ text: "Nile", tier: "common" as const }, { text: "Okavango", tier: "gem" as const }] });
const packsOf = (themes: number): Record<Language, Pack[]> => {
  const make = (prefix: string) =>
    Array.from({ length: themes }, (_, i): Pack => ({ id: `${prefix}theme${i}`, name: `Theme ${i}`, prompts: [prompt("old", `Name an old thing ${i}`)] }));
  return { en: make(""), "zh-CN": make("zh-"), "zh-TW": make("tw-") };
};

test("a day's themes are ten English packs that have both Chinese packs, the same all day", () => {
  const packs = packsOf(13);
  packs["zh-TW"].pop();
  const themes = dailyThemes(packs, DAY);
  expect(themes).toHaveLength(10);
  expect(themes).not.toContain("theme12");
  expect(dailyThemes(packs, DAY)).toEqual(themes);
});

/** A client that answers each request with the next of `answers`, and keeps what it was sent. */
function fake(answers: Partial<Anthropic.Beta.BetaMessage>[]) {
  const sent: Anthropic.Beta.BetaMessageParam[][] = [];
  const client = {
    beta: {
      messages: {
        stream: (body: { messages: Anthropic.Beta.BetaMessageParam[] }) => {
          sent.push(structuredClone(body.messages));
          const answer = answers.shift()!;
          return { finalMessage: async () => ({ usage: { input_tokens: 10, output_tokens: 5 }, ...answer }) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

const json = (value: unknown): Partial<Anthropic.Beta.BetaMessage> => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value), citations: null }] });
const draft = (text: string, answers: { text: string; aliases: string[]; tier: string }[]) => ({ text, answers });
const still = { kind: "none", until: 0, fixed: false, sources: [], note: "" };
const answers = [
  { text: "Nile", aliases: [], tier: "common" },
  { text: "Okavango", aliases: [], tier: "rare" },
];

const propose = (id: string, text: string): Partial<Anthropic.Beta.BetaMessage> => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name: "propose_prompt", input: { text, source: "a list", edges: "none" }, caller: { type: "direct" } }],
});
const verdict = (accepted: boolean) => json({ accepted, reasons: [accepted ? "a closed set" : "its edges are left to judgement"] });
const said = (sent: Anthropic.Beta.BetaMessageParam[][]) => JSON.stringify(sent);

test("a prompt is written after the tools Claude asks for, once the reviewer accepts it, and what the game refuses is sent back", async () => {
  const packs = packsOf(10);
  await sql`insert into daily_prompts (day, theme, tries) values (${DAY}, 'theme0', 1)`;
  const river = (zhCN = answers) => json({ sources: still, en: draft("Name a river in Africa", answers), zhCN: draft("说出一条非洲的河流", zhCN), zhTW: draft("說出一條非洲的河流", answers) });
  const { client, sent } = fake([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "call1", name: "no_such_tool", input: {}, caller: { type: "direct" } }] },
    river(),
    propose("call2", "Name a kind of cake"),
    verdict(false),
    propose("call3", "Name a river in Africa"),
    verdict(true),
    river(answers.slice(0, 1)),
    river(),
  ]);
  const { prompt: written, sources } = await writePrompt(client, "theme0", DAY, packs, "system", "reviewer");
  expect(sources).toBeNull();

  expect(written.en).toEqual({ id: "river-in-africa", text: "Name a river in Africa", answers: [{ text: "Nile", tier: "common" }, { text: "Okavango", tier: "gem" }] });
  expect(written["zh-CN"].id).toBe("river-in-africa");
  expect(sent[1]!.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "call1", is_error: true }] });
  expect(said(sent)).toContain("the reviewer has not accepted this prompt");
  expect(said(sent)).toContain("Rejected:\\n- its edges are left to judgement");
  expect(said(sent)).toContain("zh-CN: the prompt must have text of at most 80 characters and at least two answers");
  const [row] = await sql`select input_tokens, output_tokens from daily_prompts where day = ${DAY} and theme = 'theme0'`;
  expect(row).toEqual({ input_tokens: "80", output_tokens: "40" });
});

test("a prompt the pack already asks is refused, and so is an attempt whose prompts the reviewer keeps rejecting", async () => {
  const packs = packsOf(10);
  const same = draft("Name an old thing 1", answers);
  const again = json({ sources: still, en: same, zhCN: same, zhTW: same });
  const asks = fake([propose("call1", "Name an old thing 1"), verdict(true), again, again, again, again]);
  await expect(writePrompt(asks.client, "theme1", DAY, packs, "system", "reviewer")).rejects.toThrow('the pack already asks "Name an old thing 1"');
  // One too long for the game is refused without a review, and not counted.
  const rejected = fake([propose("long", "x".repeat(81)), ...Array.from({ length: 4 }, (_, i) => [propose(`call${i}`, `Name a kind of cake ${i}`), verdict(false)]).flat()]);
  await expect(writePrompt(rejected.client, "theme1", DAY, packs, "system", "reviewer")).rejects.toThrow("the reviewer rejected 4 prompts");
});

test("a prompt whose set grows must name sources the game can read", async () => {
  const packs = packsOf(10);
  const text = "Name a winner of an award (to 2025)";
  const grows = (sources: object) => json({ sources, en: draft(text, answers), zhCN: draft("说出一位获奖者", answers), zhTW: draft("說出一位得獎者", answers) });
  const { client, sent } = fake([propose("call1", text), verdict(true), grows({ ...still, kind: "cutoff", until: 2025 }), grows(still), grows({ ...still, kind: "open" }), grows(still)]);
  await expect(writePrompt(client, "theme4", DAY, packs, "system", "reviewer")).rejects.toThrow("the game kept refusing it");
  expect(said(sent)).toContain("sources: give at least one source");
  expect(said(sent)).toContain("sources: the prompt stops at 2025, so its sources must be kind cutoff with until 2025");
});

test("a long prompt's id ends at a whole word", async () => {
  const packs = packsOf(10);
  const text = "Name a god or goddess of Mesopotamian myth and legend";
  const long = json({ sources: still, en: draft(text, answers), zhCN: draft("说出美索不达米亚的神", answers), zhTW: draft("說出美索不達米亞的神", answers) });
  const { client } = fake([propose("call1", text), verdict(true), long]);
  expect((await writePrompt(client, "theme2", DAY, packs, "system", "reviewer")).prompt.en.id).toBe("god-or-goddess-of-mesopotamian-myth");
  const nobel = "Name a winner of the Nobel Prize in Physiology or Medicine";
  const short = json({ sources: still, en: draft(nobel, answers), zhCN: draft("说出诺贝尔生理学或医学奖得主", answers), zhTW: draft("說出諾貝爾生理學或醫學獎得主", answers) });
  const second = fake([propose("call1", nobel), verdict(true), short]);
  expect((await writePrompt(second.client, "theme3", DAY, packs, "system", "reviewer")).prompt.en.id).toBe("winner-of-the-nobel-prize-in");
});

test("the day's set asks the written prompts in the themes' order, and a pack's own prompt where none was written", async () => {
  const packs = packsOf(10);
  const written: Written = { en: prompt("new-one", "Name a new thing"), "zh-CN": prompt("new-one", "说出新的"), "zh-TW": prompt("new-one", "說出新的") };
  await sql`update daily_prompts set prompts = ${written} where day = ${DAY} and theme = 'theme0'`;
  await finish(DAY, ["theme1", "theme0"], packs);
  const [row] = await sql`select prompts from daily_sets where day = ${DAY} and language = 'zh-TW'`;
  expect(row.prompts).toEqual(["tw-theme1/old", "tw-theme0/new-one"]);
  expect(await writtenPacks(packs)).toContainEqual({ id: "zh-theme0", name: "Theme 0", prompts: [written["zh-CN"]] });
});
