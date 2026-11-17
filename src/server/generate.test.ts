import { afterAll, beforeEach, expect, test } from "bun:test";
import { accountIdOf, signUp } from "./accounts";
import { listPacks, loadPack } from "./custom";
import { migrate, sql } from "./db";
import { tidy, writePack } from "./generate";
import { saveKey } from "./keys";
import { validatePack } from "./packs";

// These tests need the database (`docker compose up -d db`). No request leaves this machine:
// a stand-in for Anthropic's API answers here, with whatever `reply` says.
await migrate();
process.env.HADAL_SECRET = "a secret for the tests, long enough";
const KEY = "sk-ant-test-0123456789";
const DRAFT = {
  name: "Rivers",
  prompts: [
    { text: "Name a river in Africa", answers: [{ text: "Nile", aliases: [], rarity: 5 }, { text: "Okavango", aliases: ["Cubango"], rarity: 100 }] },
    { text: "Name a river in Europe", answers: [{ text: "Danube", aliases: [], rarity: 10 }, { text: "Vltava", aliases: ["Moldau"], rarity: 100 }] },
  ],
};

let reply: { status?: number; stop?: string; text?: string };
let asked: { key: string | null; body: { model: string; messages: { content: string }[] } }[] = [];
const event = (data: { type: string }) => `event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`;
const api = Bun.serve({
  port: 0,
  fetch: async (req) => {
    asked.push({ key: req.headers.get("authorization"), body: (await req.json()) as (typeof asked)[number]["body"] });
    if (reply.status) {
      return Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: reply.status });
    }
    const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    const events = [
      { type: "message_start", message },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: reply.text ?? JSON.stringify(DRAFT) } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: reply.stop ?? "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
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
  if (key) await saveKey(id, KEY);
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
  expect(await writePack(id, " rivers ")).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "rivers", name: "Rivers", prompts: 2 }]);
  expect(validatePack(await loadPack(id, "rivers"))).toEqual([]);
  expect(asked).toHaveLength(1);
  expect(asked[0]!.key).toBe(`Bearer ${KEY}`);
  expect(asked[0]!.body.model).toBe("claude-opus-5-5");
  expect(asked[0]!.body.messages[0]!.content).toBe("Topic: rivers");
});

test("a second pack of the same name does not replace the first", async () => {
  const id = await account();
  await writePack(id, "rivers");
  expect(await writePack(id, "rivers")).toEqual([]);
  expect((await listPacks(id)).map((pack) => pack.id)).toEqual(["rivers", "rivers-2"]);
});

test("a pack named in another script still gets an id", async () => {
  const id = await account();
  reply = { text: JSON.stringify({ ...DRAFT, name: "河流" }) };
  expect(await writePack(id, "河流")).toEqual([]);
  expect(await listPacks(id)).toEqual([{ id: "pack", name: "河流", prompts: 2 }]);
});

test("without a key, or a topic, nothing is asked of Anthropic", async () => {
  expect(await writePack(await account(false), "rivers")).toEqual([expect.stringContaining("API key")]);
  expect(await writePack(await account(), "  ")).toEqual([expect.stringContaining("topic")]);
  expect(await writePack(await account(), "x".repeat(61))).toEqual([expect.stringContaining("topic")]);
  expect(asked).toHaveLength(0);
});

test("what goes wrong at Anthropic is said in words, and no pack is kept", async () => {
  const id = await account();
  reply = { status: 401 };
  expect(await writePack(id, "rivers")).toEqual([expect.stringContaining("did not accept")]);
  reply = { stop: "refusal", text: "" };
  expect(await writePack(id, "rivers")).toEqual([expect.stringContaining("declined")]);
  reply = { stop: "max_tokens", text: '{"name": "Riv' };
  expect(await writePack(id, "rivers")).toEqual([expect.stringContaining("too long")]);
  reply = { text: JSON.stringify({ name: "Rivers", prompts: [] }) };
  expect(await writePack(id, "rivers")).toEqual([expect.stringContaining("could not be used")]);
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
            { text: "Nile", aliases: ["the Nile", "Nilus"], rarity: 0 },
            { text: "nile", aliases: [], rarity: 30 },
            { text: "Congo", aliases: ["Zaire", "ZAIRE", "x".repeat(41)], rarity: 40 },
            { text: "Okavango", aliases: [], rarity: 80.4 },
            { text: "!!", aliases: [], rarity: 90 },
          ],
        },
        { text: "Name a river with one answer", answers: [{ text: "Styx", aliases: [], rarity: 100 }] },
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
    { text: "Nile", aliases: ["Nilus"], rarity: 1 },
    { text: "Congo", aliases: ["Zaire"], rarity: 50 },
    { text: "Okavango", rarity: 100 },
  ]);
});
