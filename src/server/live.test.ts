import { afterAll, beforeEach, expect, test } from "bun:test";
import type { Provider } from "../shared/types";
import { accountIdOf, signUp } from "./accounts";
import { migrate, sql } from "./db";
import { buildIndex } from "./game";
import { saveKey } from "./keys";
import { judgeLive, question, settle } from "./live";

// These tests need the database (`docker compose up -d db`). No request leaves this machine:
// stand-ins for Anthropic's API and for Jev's answer here, with whatever `reply` and `jev` say.
await migrate();
process.env.HADAL_SECRET = "a secret for the tests, long enough";
const KEY = "sk-ant-test-0123456789";
const JEV_KEY = "jev-test-0123456789";
// Rulings are kept by prompt, so each run of these tests asks a prompt of its own.
const ASKED = `Name a river in Africa ${crypto.randomUUID()}`;
const entry = buildIndex([
  {
    id: "rivers",
    name: "Rivers",
    prompts: [{ id: "africa", text: ASKED, answers: [{ text: "Nile", tier: "common" }, { text: "Okavango", aliases: ["Cubango"], tier: "gem" }] }],
  },
]).get("rivers/africa")!;
const WRONG = { answer: null, rarity: 0 };

let reply: { status?: number; stop?: string; ruling?: object };
let asked: { key: string | null; body: { model: string; messages: { content: string }[] } }[] = [];
const api = Bun.serve({
  port: 0,
  fetch: async (req) => {
    asked.push({ key: req.headers.get("authorization"), body: (await req.json()) as (typeof asked)[number]["body"] });
    if (reply.status) {
      return Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: reply.status });
    }
    return Response.json({
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(reply.ruling ?? { correct: true, answer: "Zambezi", tier: "familiar" }) }],
      stop_reason: reply.stop ?? "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  },
});

type JevBody = { model: string; state: Record<string, unknown>; questions: Record<string, { criteria: object }> };
let jev: { status?: number; right?: number; level?: number; same?: string; sure?: number };
let jevAsked: { key: string | null; body: JevBody }[] = [];
const jevApi = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = (await req.json()) as JevBody;
    jevAsked.push({ key: req.headers.get("authorization"), body });
    if (jev.status) return Response.json({ detail: "no" }, { status: jev.status });
    const answers = body.questions.same
      ? { same: { type: "choice", choice: jev.same ?? "none of these", confidence: jev.sure ?? 0.95 } }
      : { correct: { type: "noul", noul: jev.right ?? 0.99 }, rarity: { type: "score", score: jev.level ?? 2, confidence: 0.5 } };
    return Response.json({ model: "jev-1.14.0", answers, usage: { input_tokens: 1, output_tokens: 1 } });
  },
});

const made: string[] = [];
const account = async (...keys: Provider[]) => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  const signed = await signUp(name, "correct horse");
  if ("error" in signed) throw new Error(signed.error);
  const id = (await accountIdOf(signed.token))!;
  for (const provider of keys) await saveKey(id, provider, provider === "jev" ? JEV_KEY : KEY);
  return id;
};

beforeEach(() => {
  // Set here, not once: every test file runs in one process, and another has a stand-in of its own.
  process.env.ANTHROPIC_BASE_URL = api.url.href;
  process.env.TYPESAFE_BASE_URL = jevApi.url.origin;
  reply = {};
  asked = [];
  jev = {};
  jevAsked = [];
});
afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
  await sql`delete from verdicts where asked = ${ASKED}`;
  delete process.env.TYPESAFE_BASE_URL;
  await api.stop();
  await jevApi.stop();
});

test("Claude is sent the prompt, its listed answers and the player's answer", () => {
  expect(question(entry, "zambezi")).toBe(`Prompt: ${ASKED}\n\nListed answers:\n- Nile (common)\n- Okavango, also Cubango (gem)\n\nThe player's answer: zambezi`);
});

test("a ruling of Claude's comes to a verdict", () => {
  expect(settle(entry, "moon", { correct: false, answer: "moon", tier: "common" })).toEqual(WRONG);
  expect(settle(entry, "zambesi", { correct: true, answer: " Zambezi ", tier: "familiar" })).toEqual({ answer: "Zambezi", rarity: 30 });
  // An answer the judge knows as a listed one scores as that one.
  expect(settle(entry, "kubango", { correct: true, answer: "cubango", tier: "rare" })).toEqual({ answer: "Okavango", rarity: 100 });
  // A spelling the game cannot show falls back on what was typed.
  expect(settle(entry, "zambezi", { correct: true, answer: "Z".repeat(41), tier: "familiar" }).answer).toBe("zambezi");
});

test("an answer is judged once, with the player's key, and the ruling is then everyone's", async () => {
  expect(await judgeLive(entry, " zambezi ", await account("anthropic"))).toEqual({ answer: "Zambezi", rarity: 30 });
  expect(asked).toHaveLength(1);
  expect(asked[0]!.key).toBe(`Bearer ${KEY}`);
  expect(asked[0]!.body.model).toBe("claude-haiku-5-5");
  expect(asked[0]!.body.messages[0]!.content).toEndWith("The player's answer: zambezi");

  expect(await judgeLive(entry, "ZAMBEZI!", null)).toEqual({ answer: "Zambezi", rarity: 30 });
  expect(await judgeLive(entry, "the zambezi", await account())).toEqual({ answer: "Zambezi", rarity: 30 });
  expect(asked).toHaveLength(1);
  expect(jevAsked).toHaveLength(0);
});

test("a wrong ruling is kept as well", async () => {
  reply = { ruling: { correct: false, answer: "thames", tier: "common" } };
  expect(await judgeLive(entry, "thames", await account("anthropic"))).toEqual(WRONG);
  expect(await judgeLive(entry, "Thames", await account("anthropic"))).toEqual(WRONG);
  expect(asked).toHaveLength(1);
});

test("without a key nothing is asked, and the answer stays wrong", async () => {
  expect(await judgeLive(entry, "congo", null)).toEqual(WRONG);
  expect(await judgeLive(entry, "congo", await account())).toEqual(WRONG);
  expect(await judgeLive(entry, "!!!", await account("anthropic", "jev"))).toEqual(WRONG);
  expect(await judgeLive(entry, "c".repeat(41), await account("anthropic", "jev"))).toEqual(WRONG);
  expect(asked).toHaveLength(0);
  expect(jevAsked).toHaveLength(0);
});

test("when Claude gives no ruling the answer is wrong for now, and nothing is kept", async () => {
  const id = await account("anthropic");
  reply = { status: 401 };
  expect(await judgeLive(entry, "niger", id)).toEqual(WRONG);
  reply = { stop: "refusal" };
  expect(await judgeLive(entry, "niger", id)).toEqual(WRONG);
  reply = { ruling: { correct: true, answer: "Niger", tier: "familiar" } };
  expect(await judgeLive(entry, "niger", id)).toEqual({ answer: "Niger", rarity: 30 });
  expect(asked).toHaveLength(3);
});

test("Jev rules first where it is sure, and its ruling is kept", async () => {
  jev = { right: 0.95, level: 2 };
  expect(await judgeLive(entry, "Limpopo", await account("anthropic", "jev"))).toEqual({ answer: "Limpopo", rarity: 60 });
  expect(asked).toHaveLength(0);
  expect(jevAsked).toHaveLength(2);
  expect(jevAsked.every((request) => request.key === `Bearer ${JEV_KEY}` && request.body.model === "jev-latest")).toBe(true);
  // It rules on the answer without seeing the listed ones, and is shown them only to say whether it is one of them.
  const [alone, among] = jevAsked.sort((a, b) => Number("same" in a.body.questions) - Number("same" in b.body.questions));
  expect(alone!.body.state).toEqual({ prompt: ASKED, answer: "Limpopo" });
  expect(among!.body.state).toEqual({ prompt: ASKED, "listed answers": ["Nile", "Okavango"], answer: "Limpopo" });
  expect(among!.body.questions.same!.criteria).toEqual({ Nile: null, Okavango: null, "none of these": null });

  jev = { right: 0.02 };
  expect(await judgeLive(entry, "Mekong", await account("jev"))).toEqual(WRONG);
  expect(await judgeLive(entry, "limpopo", null)).toEqual({ answer: "Limpopo", rarity: 60 });
  expect(await judgeLive(entry, "mekong", await account("anthropic"))).toEqual(WRONG);
  expect(asked).toHaveLength(0);
  expect(jevAsked).toHaveLength(4);
});

test("an answer Jev knows as a listed one under another name scores as that one", async () => {
  jev = { right: 0.3, same: "Okavango", sure: 0.97 };
  expect(await judgeLive(entry, "Kavango", await account("jev"))).toEqual({ answer: "Okavango", rarity: 100 });
});

test("where Jev is not sure, Claude rules; without Claude the answer is wrong for now", async () => {
  const both = await account("anthropic", "jev");
  const onlyJev = await account("jev");
  for (const [answer, unsure] of [["Orange", { right: 0.5 }], ["Senegal", { same: "Nile", sure: 0.4 }], ["Volta", { sure: 0.5 }], ["Tana", { status: 529 }]] as const) {
    jev = unsure;
    reply = { ruling: { correct: true, answer, tier: "uncommon" } };
    expect(await judgeLive(entry, answer, onlyJev)).toEqual(WRONG);
    expect(asked).toHaveLength(0);
    expect(await judgeLive(entry, answer, both)).toEqual({ answer, rarity: 60 });
    asked = [];
  }
});

test("a judge's failure is noted on the key that was used, and a later ruling clears it", async () => {
  const id = await account("anthropic", "jev");
  const failed = async () => Object.fromEntries((await sql`select provider, failed from keys where account_id = ${id}`).map((row: { provider: string; failed: string | null }) => [row.provider, row.failed]));
  jev = { status: 401 };
  reply = { status: 429 };
  expect(await judgeLive(entry, "Ruvuma", id)).toEqual(WRONG);
  expect(await failed()).toEqual({ jev: "refused", anthropic: "limited" });
  jev = { status: 529 };
  reply = { ruling: { correct: true, answer: "Ruvuma", tier: "rare" } };
  expect(await judgeLive(entry, "Ruvuma", id)).toEqual({ answer: "Ruvuma", rarity: 85 });
  expect(await failed()).toEqual({ jev: "unanswered", anthropic: null });
});
