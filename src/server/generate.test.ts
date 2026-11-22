import { afterAll, beforeEach, expect, test } from "bun:test";
import { dollars } from "../shared/cost";
import { wordsIn } from "../shared/language";
import { MAX_TOPIC_LENGTH } from "../shared/types";
import { accountIdOf, signUp } from "./accounts";
import { listPacks, loadPack } from "./custom";
import { migrate, sql } from "./db";
import { run, stopWriting, tidy, writePack, writingOf } from "./generate";
import { saveKey } from "./keys";
import { validatePack } from "./packs";

// These tests need the database (`docker compose up -d db`). No request leaves this machine:
// a stand-in for Anthropic's API answers here, with whatever `reply` says.
await migrate();
process.env.HADAL_SECRET = "a secret for the tests, long enough";
const KEY = "sk-ant-test-0123456789";
const DRAFT: Parameters<typeof tidy>[0] = {
  name: "Rivers",
  prompts: [
    { text: "Name a river in Africa", answers: [{ text: "Nile", aliases: [], tier: "common" }, { text: "Okavango", aliases: ["Cubango"], tier: "gem" }] },
    { text: "Name a river in Europe", answers: [{ text: "Danube", aliases: [], tier: "common" }, { text: "Vltava", aliases: ["Moldau"], tier: "gem" }] },
  ],
};
const PLAN = { name: DRAFT.name, prompts: DRAFT.prompts.map((prompt) => prompt.text) };

/**
 * How the stand-in answers a request: for the plan ("plan") or for one prompt (its text). `searched`: Claude says
 * something and searches before its answer. `paused`: the first such request is paused after a search.
 */
type Reply = { status?: number; stop?: string; text?: string; searched?: boolean; paused?: boolean; delay?: number };
let reply: (asking: string) => Reply;
type Body = { model: string; system: string; tools?: object[]; messages: { role: string; content: string | object[] }[] };
let asked: { key: string | null; asking: string; body: Body }[] = [];
const event = (data: { type: string }) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
const api = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = (await req.json()) as Body;
    const first = String(body.messages[0]!.content);
    const asking = first.match(/^Prompt: (.*)$/m)?.[1] ?? "plan";
    const answer = reply(asking);
    const paused = answer.paused === true && !asked.some((one) => one.asking === asking);
    asked.push({ key: req.headers.get("authorization"), asking, body });
    if (answer.delay) await Bun.sleep(answer.delay);
    if (answer.status) {
      return Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: answer.status });
    }
    const written = asking === "plan" ? PLAN : { answers: DRAFT.prompts.find((prompt) => prompt.text === asking)?.answers ?? [] };
    const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    const search = [
      { type: "text", text: "Let me check." },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] },
    ];
    const blocks = paused ? search : [...(answer.searched ? search : []), { type: "text", text: answer.text ?? JSON.stringify(written) }];
    const events = [
      { type: "message_start", message },
      ...blocks.flatMap((block, index) => [
        block.type === "text"
          ? [{ type: "content_block_start", index, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]
          : [{ type: "content_block_start", index, content_block: block }],
        { type: "content_block_stop", index },
      ].flat()),
      { type: "message_delta", delta: { stop_reason: paused ? "pause_turn" : (answer.stop ?? "end_turn"), stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: "message_stop" },
    ];
    return new Response(events.map(event).join(""), { headers: { "content-type": "text/event-stream" } });
  },
});
process.env.ANTHROPIC_BASE_URL = api.url.href;

const made: string[] = [];
const account = async (key = true) => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  const entry = await signUp(name, "correct horse");
  if ("error" in entry) throw new Error(entry.error);
  const id = (await accountIdOf(entry.token))!;
  if (key) await saveKey(id, "anthropic", KEY);
  return id;
};
/** Begins a writing and waits for it to end; returns why it could not begin. */
const write = async (id: string, order: Parameters<typeof writePack>[1], language?: Parameters<typeof writePack>[2]) => {
  const problems = await writePack(id, order, language);
  if (!problems.length) await run(id);
  return problems;
};

beforeEach(() => {
  reply = () => ({});
  asked = [];
});
afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
  await api.stop();
});

test("a pack is planned, then each prompt's answers are written, paid for with the player's key", async () => {
  const id = await account();
  expect(await write(id, { topic: " rivers " })).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 2 }]);
  expect(validatePack(await loadPack(id, "rivers"))).toEqual([]);
  expect(await writingOf(id)).toBeNull();
  expect(asked.map((one) => one.asking).sort()).toEqual(["Name a river in Africa", "Name a river in Europe", "plan"]);
  expect(asked.every((one) => one.key === `Bearer ${KEY}` && one.body.model === "claude-opus-5-5" && one.body.tools === undefined)).toBe(true);
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: English\nPrompts: 10");
  expect(asked.find((one) => one.asking === "Name a river in Africa")!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: English\nPrompt: Name a river in Africa");
});

test("Claude is told how many prompts to write and the player's notes, and searches only when asked to", async () => {
  const id = await account();
  expect(await write(id, { topic: "rivers", instructions: " only rivers in Asia ", prompts: 30, search: true })).toEqual([]);
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: English\nInstructions from the player: only rivers in Asia\nPrompts: 30");
  expect(asked[1]!.body.messages[0]!.content).toContain("Instructions from the player: only rivers in Asia");
  for (const one of asked) {
    expect(one.body.tools).toEqual([
      { type: "web_search_20260318", name: "web_search", max_uses: 5, response_inclusion: "excluded" },
      { type: "web_fetch_20260318", name: "web_fetch", max_uses: 2, max_content_tokens: 40000, response_inclusion: "excluded" },
    ]);
    expect(one.body.system).toContain("search the web");
  }
});

test("what Claude says before a search is not part of the answer, and a paused search goes on", async () => {
  const id = await account();
  reply = () => ({ searched: true });
  expect(await write(id, { topic: "rivers", search: true })).toEqual([]);
  reply = () => ({ paused: true });
  asked = [];
  expect(await write(id, { topic: "rivers", search: true })).toEqual([]);
  expect(asked).toHaveLength(6);
  expect(asked[1]!.body.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect((await listPacks(id)).map((pack) => pack.prompts)).toEqual([2, 2]);
});

test("how a writing stands is told while it goes on, and it picks up where it stood", async () => {
  const id = await account();
  expect(await writePack(id, { topic: "rivers" })).toEqual([]);
  expect(await writingOf(id)).toEqual({ topic: "rivers", done: 0, of: 10, spent: 0 });
  // As if the server had stopped once the plan and the first prompt were written.
  await sql`update writings set plan = ${PLAN}, answers = ${{ 0: DRAFT.prompts[0]!.answers }}::jsonb where account_id = ${id}`;
  expect(await writingOf(id)).toEqual({ topic: "rivers", done: 1, of: 2, spent: 0 });
  await run(id);
  expect(asked.map((one) => one.asking)).toEqual(["Name a river in Europe"]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 2 }]);
});

test("a player has one writing at a time, and may stop it", async () => {
  const id = await account();
  expect(await writePack(id, { topic: "rivers" })).toEqual([]);
  expect(await writePack(id, { topic: "lakes" })).toEqual([expect.stringContaining("still writing")]);
  await stopWriting(id);
  expect(await writingOf(id)).toBeNull();
  // Stopped while a prompt is being written.
  reply = () => ({ delay: 200 });
  expect(await writePack(id, { topic: "rivers" })).toEqual([]);
  const going = run(id);
  await Bun.sleep(50);
  await stopWriting(id);
  await going;
  expect(await writingOf(id)).toBeNull();
  expect(await listPacks(id)).toEqual([]);
});

test("a second pack of the same name does not replace the first", async () => {
  const id = await account();
  await write(id, { topic: "rivers" });
  expect(await write(id, { topic: "rivers" })).toEqual([]);
  expect((await listPacks(id)).map((pack) => pack.id)).toEqual(["rivers", "rivers-2"]);
});

test("a pack named in another script still gets an id", async () => {
  const id = await account();
  reply = (asking) => (asking === "plan" ? { text: JSON.stringify({ ...PLAN, name: "河流" }) } : {});
  expect(await write(id, { topic: "河流" })).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "pack", name: "河流", prompts: 2 }]);
});

test("Claude is told the player's language, and what goes wrong is said in it", async () => {
  const id = await account();
  expect(await write(id, { topic: "rivers" }, "zh-CN")).toEqual([]);
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: Simplified Chinese\nPrompts: 10");
  expect(await writePack(id, { topic: "  " }, "zh-CN")).toEqual([wordsIn("zh-CN").packs.badTopic(MAX_TOPIC_LENGTH)]);
  reply = () => ({ status: 401 });
  await write(id, { topic: "rivers" }, "zh-CN");
  expect((await writingOf(id))?.failed).toBe(wordsIn("zh-CN").packs.keyRefused);
});

test("without a key, a topic or a sound order, nothing is asked of Anthropic", async () => {
  expect(await writePack(await account(false), { topic: "rivers" })).toEqual([expect.stringContaining("API key")]);
  expect(await writePack(await account(), { topic: "  " })).toEqual([expect.stringContaining("topic")]);
  expect(await writePack(await account(), { topic: "x".repeat(61) })).toEqual([expect.stringContaining("topic")]);
  expect(await writePack(await account(), { topic: "rivers", instructions: "x".repeat(301) })).toEqual([expect.stringContaining("notes")]);
  expect(await writePack(await account(), { topic: "rivers", prompts: 15 })).toEqual(["a pack has 10, 20, 30, 40 or 50 prompts"]);
  expect(asked).toHaveLength(0);
});

test("a writing that fails says why once, keeps no pack, and makes way for the next", async () => {
  const id = await account();
  const failsWith = async (answer: (asking: string) => Reply) => {
    reply = answer;
    expect(await write(id, { topic: "rivers" })).toEqual([]);
    const failed = (await writingOf(id))?.failed;
    expect(await writingOf(id)).toBeNull();
    return failed;
  };
  expect(await failsWith(() => ({ status: 401 }))).toContain("did not accept");
  expect(await failsWith((asking) => (asking === "plan" ? { stop: "refusal", text: "" } : {}))).toContain("declined");
  expect(await failsWith((asking) => (asking === "plan" ? { stop: "max_tokens", text: '{"name": "Riv' } : {}))).toContain("too long");
  expect(await failsWith((asking) => (asking === "plan" ? { text: JSON.stringify({ name: "Rivers", prompts: [] }) } : {}))).toContain("could not be used");
  expect(await failsWith((asking) => (asking === "plan" ? {} : { stop: "refusal", text: "" }))).toContain("could not be used");
  expect(await listPacks(id)).toEqual([]);
});

test("a key that fails on one prompt ends the writing, and no more prompts are asked for", async () => {
  const id = await account();
  const many = { name: "Rivers", prompts: Array.from({ length: 10 }, (_, i) => `Name river ${i}`) };
  reply = (asking) => (asking === "plan" ? { text: JSON.stringify(many) } : asking === "Name river 1" ? { status: 401 } : { delay: 100 });
  expect(await write(id, { topic: "rivers" })).toEqual([]);
  const writing = await writingOf(id);
  expect(writing?.failed).toContain("did not accept");
  // The plan, the failed prompt and the one being written beside it, of which two were answered (a token in and out each).
  expect(asked).toHaveLength(3);
  expect(writing?.spent).toBeCloseTo(dollars({ input: 2, output: 2, searches: 0 }));
});

test("a prompt Claude will not write is left out of the pack", async () => {
  const id = await account();
  reply = (asking) => (asking === "Name a river in Africa" ? { stop: "refusal", text: "" } : {});
  expect(await write(id, { topic: "rivers" })).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 1 }]);
});

test("a draft is mended into a valid pack", () => {
  const pack = tidy(
    {
      name: "  A name far too long for the screen  ",
      prompts: [
        {
          text: "Name a river in Africa",
          answers: [
            { text: "Nile", aliases: ["the Nile", "Nilus"], tier: "common" },
            { text: "nile", aliases: [], tier: "familiar" },
            { text: "Congo", aliases: ["Zaire", "ZAIRE", "x".repeat(41)], tier: "familiar" },
            { text: "Okavango", aliases: [], tier: "rare" },
            { text: "!!", aliases: [], tier: "rare" },
          ],
        },
        { text: "Name a river with one answer", answers: [{ text: "Styx", aliases: [], tier: "gem" }] },
        { text: "x".repeat(81), answers: DRAFT.prompts[0]!.answers },
        DRAFT.prompts[1]!,
      ],
    },
    "rivers",
  );
  expect(validatePack(pack)).toEqual([]);
  expect(pack.name).toBe("A name far too long for");
  expect(pack.prompts.map((prompt) => prompt.id)).toEqual(["prompt-1", "prompt-2"]);
  expect(pack.prompts[0]!.answers).toEqual([
    { text: "Nile", aliases: ["Nilus"], tier: "common" },
    { text: "Congo", aliases: ["Zaire"], tier: "familiar" },
    { text: "Okavango", tier: "gem" },
  ]);
});
