import { afterAll, beforeEach, expect, test } from "bun:test";
import { accountIdOf, accountOf, signUp } from "./accounts";
import { migrate, sql } from "./db";
import { loadKey, noteUse, removeKey, saveKey } from "./keys";

// These tests need the database (`docker compose up -d db`). Their accounts, and so their keys, are removed afterwards.
await migrate();
const SECRET = "a secret for the tests, long enough";
const KEY = "sk-ant-test-0123456789";
const made: string[] = [];
const account = async () => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  const entry = await signUp(name, "correct horse");
  if ("error" in entry) throw new Error(entry.error);
  return { id: (await accountIdOf(entry.token))!, token: entry.token };
};

beforeEach(() => {
  process.env.HADAL_SECRET = SECRET;
});
afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
});

test("a key is kept sealed, and comes back for the server's use", async () => {
  const { id, token } = await account();
  expect((await accountOf(token))!.keys).toEqual({ anthropic: false, jev: false });
  expect(await saveKey(id, "anthropic", ` ${KEY}\n`)).toBeNull();
  expect(await loadKey(id, "anthropic")).toBe(KEY);
  expect((await accountOf(token))!.keys).toEqual({ anthropic: true, jev: false });
  const [row] = await sql`select sealed from keys where account_id = ${id}`;
  expect(row.sealed).not.toContain(KEY);
  expect(Buffer.from(row.sealed, "base64").toString("latin1")).not.toContain(KEY);
});

test("the same key is sealed differently every time", async () => {
  const { id } = await account();
  await saveKey(id, "anthropic", KEY);
  const [first] = await sql`select sealed from keys where account_id = ${id}`;
  await saveKey(id, "anthropic", KEY);
  const [second] = await sql`select sealed from keys where account_id = ${id}`;
  expect(second.sealed).not.toBe(first.sealed);
});

test("a sealed key copied to another account does not open there", async () => {
  const [mine, theirs] = [await account(), await account()];
  await saveKey(mine.id, "anthropic", KEY);
  await sql`insert into keys (account_id, provider, sealed) select ${theirs.id}, provider, sealed from keys where account_id = ${mine.id}`;
  expect(await loadKey(theirs.id, "anthropic")).toBeNull();
  expect(await loadKey(mine.id, "anthropic")).toBe(KEY);
});

test("without the server's secret no key is kept, and with another secret none opens", async () => {
  const { id } = await account();
  delete process.env.HADAL_SECRET;
  expect(await saveKey(id, "anthropic", KEY)).toContain("HADAL_SECRET");
  process.env.HADAL_SECRET = "too short";
  expect(await saveKey(id, "anthropic", KEY)).toContain("HADAL_SECRET");
  process.env.HADAL_SECRET = SECRET;
  await saveKey(id, "anthropic", KEY);
  process.env.HADAL_SECRET = "another secret, just as long as the first";
  expect(await loadKey(id, "anthropic")).toBeNull();
});

test("what is not a key is refused, and a key can be removed", async () => {
  const { id, token } = await account();
  for (const not of ["", "two words", "x".repeat(301)]) expect(await saveKey(id, "anthropic", not)).toContain("does not look like");
  await saveKey(id, "anthropic", KEY);
  await removeKey(id, "anthropic");
  expect(await loadKey(id, "anthropic")).toBeNull();
  expect((await accountOf(token))!.keys.anthropic).toBe(false);
});

test("a key is kept for each provider, apart from the other", async () => {
  const { id, token } = await account();
  await saveKey(id, "anthropic", KEY);
  await saveKey(id, "jev", "jev-test-0123456789");
  expect(await loadKey(id, "anthropic")).toBe(KEY);
  expect(await loadKey(id, "jev")).toBe("jev-test-0123456789");
  // A sealed key moved to the other provider's row does not open there.
  await sql`update keys set sealed = (select sealed from keys where account_id = ${id} and provider = 'anthropic') where account_id = ${id} and provider = 'jev'`;
  expect(await loadKey(id, "jev")).toBeNull();
  await removeKey(id, "jev");
  expect((await accountOf(token))!.keys).toEqual({ anthropic: true, jev: false });
});

test("why a key last failed is shown to its owner until it works again or is replaced", async () => {
  const { id, token } = await account();
  await saveKey(id, "anthropic", KEY);
  await noteUse(id, "anthropic", "refused");
  expect((await accountOf(token))!.failed).toEqual({ anthropic: "refused", jev: null });
  await noteUse(id, "anthropic", null);
  expect((await accountOf(token))!.failed.anthropic).toBeNull();
  await noteUse(id, "anthropic", "limited");
  await saveKey(id, "anthropic", KEY);
  expect((await accountOf(token))!.failed.anthropic).toBeNull();
});
