import { afterAll, beforeEach, expect, test } from "bun:test";
import { wordsIn } from "../shared/language";
import { MAX_TOPIC_LENGTH } from "../shared/types";
import { accountIdOf, signUp } from "./accounts";
import { listPacks, loadPack } from "./custom";
import { migrate, sql } from "./db";
import { promptsBegun, tidy, writePack } from "./generate";
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

/** `searched`: Claude says something and searches before the pack. `paused`: the first answer is paused after a search. */
let reply: { status?: number; stop?: string; text?: string; searched?: boolean; paused?: boolean };
let asked: { key: string | null; body: { model: string; system: string; tools?: object[]; messages: { role: string; content: string | object[] }[] } }[] = [];
const event = (data: { type: string }) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
const api = Bun.serve({
  port: 0,
  fetch: async (req) => {
    asked.push({ key: req.headers.get("authorization"), body: (await req.json()) as (typeof asked)[number]["body"] });
    if (reply.status) {
      return Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: reply.status });
    }
    const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    const search = [
      { type: "text", text: "Let me check." },
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] },
    ];
    const paused = reply.paused && asked.length === 1;
    const blocks = paused ? search : [...(reply.searched ? search : []), { type: "text", text: reply.text ?? JSON.stringify(DRAFT) }];
    const events = [
      { type: "message_start", message },
      ...blocks.flatMap((block, index) => [
        block.type === "text"
          ? [{ type: "content_block_start", index, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]
          : [{ type: "content_block_start", index, content_block: block }],
        { type: "content_block_stop", index },
      ].flat()),
      { type: "message_delta", delta: { stop_reason: paused ? "pause_turn" : (reply.stop ?? "end_turn"), stop_sequence: null }, usage: { output_tokens: 1 } },
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

beforeEach(() => {
  reply = {};
  asked = [];
});
afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
  await api.stop();
});

test("a written pack is kept among the player's packs, paid for with their key", async () => {
  const id = await account();
  expect(await writePack(id, { topic: " rivers " })).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 2 }]);
  expect(validatePack(await loadPack(id, "rivers"))).toEqual([]);
  expect(asked).toHaveLength(1);
  expect(asked[0]!.key).toBe(`Bearer ${KEY}`);
  expect(asked[0]!.body.model).toBe("claude-opus-5-5");
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: English\nPrompts: 10");
  expect(asked[0]!.body.tools).toBeUndefined();
});

test("Claude is told how many prompts to write and the player's notes, and searches only when asked to", async () => {
  const id = await account();
  expect(await writePack(id, { topic: "rivers", instructions: " only rivers in Asia ", prompts: 30, search: true })).toEqual([]);
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: English\nPrompts: 30\nInstructions from the player: only rivers in Asia");
  expect(asked[0]!.body.tools).toEqual([{ type: "web_search_20260318", name: "web_search", max_uses: 30, response_inclusion: "excluded" }]);
  expect(asked[0]!.body.system).toContain("search the web");
});

test("what Claude says before a search is not part of the pack, and a paused search goes on", async () => {
  const id = await account();
  reply = { searched: true };
  expect(await writePack(id, { topic: "rivers", search: true })).toEqual([]);
  reply = { paused: true };
  asked = [];
  expect(await writePack(id, { topic: "rivers", search: true })).toEqual([]);
  expect(asked).toHaveLength(2);
  expect(asked[1]!.body.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect((await listPacks(id)).map((pack) => pack.name)).toEqual(["Rivers", "Rivers"]);
});

test("the prompts that are finished are counted while the pack is written", async () => {
  const counts: number[] = [];
  expect(await writePack(await account(), { topic: "rivers" }, (prompts) => counts.push(prompts))).toEqual([]);
  expect(counts).toEqual([1]);
  expect(promptsBegun('{"name":"Rivers","prompts":[{"text":"Name a river","answers":[{"text":"Nile"')).toBe(1);
  expect(promptsBegun('{"prompts":[{"text":"Which word comes after \\"answers\\": in a pack?","answers" : [')).toBe(1);
  expect(promptsBegun('{"name":"Riv')).toBe(0);
});

test("writing that is stopped keeps no pack", async () => {
  const id = await account();
  const stop = new AbortController();
  stop.abort();
  expect(await writePack(id, { topic: "rivers" }, undefined, stop.signal)).toEqual([expect.stringContaining("stopped")]);
  expect(await listPacks(id)).toEqual([]);
});

test("a second pack of the same name does not replace the first", async () => {
  const id = await account();
  await writePack(id, { topic: "rivers" });
  expect(await writePack(id, { topic: "rivers" })).toEqual([]);
  expect((await listPacks(id)).map((pack) => pack.id)).toEqual(["rivers", "rivers-2"]);
});

test("a pack named in another script still gets an id", async () => {
  const id = await account();
  reply = { text: JSON.stringify({ ...DRAFT, name: "河流" }) };
  expect(await writePack(id, { topic: "河流" })).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "pack", name: "河流", prompts: 2 }]);
});

test("Claude is told the player's language, and a refusal comes back in it", async () => {
  const id = await account();
  expect(await writePack(id, { topic: "rivers" }, undefined, undefined, "zh-CN")).toEqual([]);
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers\nLanguage: Simplified Chinese\nPrompts: 10");
  expect(await writePack(id, { topic: "  " }, undefined, undefined, "zh-CN")).toEqual([wordsIn("zh-CN").packs.badTopic(MAX_TOPIC_LENGTH)]);
});

test("without a key, a topic or a sound order, nothing is asked of Anthropic", async () => {
  expect(await writePack(await account(false), { topic: "rivers" })).toEqual([expect.stringContaining("API key")]);
  expect(await writePack(await account(), { topic: "  " })).toEqual([expect.stringContaining("topic")]);
  expect(await writePack(await account(), { topic: "x".repeat(61) })).toEqual([expect.stringContaining("topic")]);
  expect(await writePack(await account(), { topic: "rivers", instructions: "x".repeat(301) })).toEqual([expect.stringContaining("notes")]);
  expect(await writePack(await account(), { topic: "rivers", prompts: 15 })).toEqual(["a pack has 10, 20, 30, 40 or 50 prompts"]);
  expect(asked).toHaveLength(0);
});

test("what goes wrong at Anthropic is said in words, and no pack is kept", async () => {
  const id = await account();
  reply = { status: 401 };
  expect(await writePack(id, { topic: "rivers" })).toEqual([expect.stringContaining("did not accept")]);
  reply = { stop: "refusal", text: "" };
  expect(await writePack(id, { topic: "rivers" })).toEqual([expect.stringContaining("declined")]);
  reply = { stop: "max_tokens", text: '{"name": "Riv' };
  expect(await writePack(id, { topic: "rivers" })).toEqual([expect.stringContaining("too long")]);
  reply = { text: JSON.stringify({ name: "Rivers", prompts: [] }) };
  expect(await writePack(id, { topic: "rivers" })).toEqual([expect.stringContaining("could not be used")]);
  expect(await listPacks(id)).toEqual([]);
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
