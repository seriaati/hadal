import { afterAll, beforeEach, expect, test } from "bun:test";
import { accountIdOf, accountOf, signUp } from "./accounts";
import { migrate, sql } from "./db";
import { loadKey, removeKey, saveKey } from "./keys";

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
  expect((await accountOf(token))!.key).toBe(false);
  expect(await saveKey(id, ` ${KEY}\n`)).toBeNull();
  expect(await loadKey(id)).toBe(KEY);
  expect((await accountOf(token))!.key).toBe(true);
  const [row] = await sql`select sealed from keys where account_id = ${id}`;
  expect(row.sealed).not.toContain(KEY);
  expect(Buffer.from(row.sealed, "base64").toString("latin1")).not.toContain(KEY);
});

test("the same key is sealed differently every time", async () => {
  const { id } = await account();
  await saveKey(id, KEY);
  const [first] = await sql`select sealed from keys where account_id = ${id}`;
  await saveKey(id, KEY);
  const [second] = await sql`select sealed from keys where account_id = ${id}`;
  expect(second.sealed).not.toBe(first.sealed);
});

test("a sealed key copied to another account does not open there", async () => {
  const [mine, theirs] = [await account(), await account()];
  await saveKey(mine.id, KEY);
  await sql`insert into keys (account_id, provider, sealed) select ${theirs.id}, provider, sealed from keys where account_id = ${mine.id}`;
  expect(await loadKey(theirs.id)).toBeNull();
  expect(await loadKey(mine.id)).toBe(KEY);
});

test("without the server's secret no key is kept, and with another secret none opens", async () => {
  const { id } = await account();
  delete process.env.HADAL_SECRET;
  expect(await saveKey(id, KEY)).toContain("HADAL_SECRET");
  process.env.HADAL_SECRET = "too short";
  expect(await saveKey(id, KEY)).toContain("HADAL_SECRET");
  process.env.HADAL_SECRET = SECRET;
  await saveKey(id, KEY);
  process.env.HADAL_SECRET = "another secret, just as long as the first";
  expect(await loadKey(id)).toBeNull();
});

test("what is not a key is refused, and a key can be removed", async () => {
  const { id, token } = await account();
  for (const not of ["", "two words", "x".repeat(301)]) expect(await saveKey(id, not)).toContain("does not look like");
  await saveKey(id, KEY);
  await removeKey(id);
  expect(await loadKey(id)).toBeNull();
  expect((await accountOf(token))!.key).toBe(false);
});
