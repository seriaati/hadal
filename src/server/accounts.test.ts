import { afterAll, expect, test } from "bun:test";
import { accountOf, signIn, signOut, signUp } from "./accounts";
import { migrate, sql } from "./db";

// These tests need the database (`docker compose up -d db`). Their accounts are removed afterwards.
await migrate();
const made: string[] = [];
const fresh = () => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  return name;
};
const PASSWORD = "correct horse";

afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
});

test("signing up opens a session that names the account", async () => {
  const name = fresh();
  const entry = await signUp(name, PASSWORD);
  if ("error" in entry) throw new Error(entry.error);
  expect(entry.account).toEqual({ username: name });
  expect(await accountOf(entry.token)).toEqual({ username: name });
});

test("the password is stored as a hash, and the session token is not stored at all", async () => {
  const name = fresh();
  const entry = await signUp(name, PASSWORD);
  if ("error" in entry) throw new Error(entry.error);
  const [row] = await sql`
    select password_hash, token_hash from accounts join sessions on account_id = accounts.id
    where username = ${name}`;
  expect(row.password_hash).toStartWith("$argon2id$");
  expect(row.token_hash).not.toBe(entry.token);
});

test("names are kept in lower case and cannot be taken twice", async () => {
  const name = fresh();
  expect(await signUp(` ${name.toUpperCase()} `, PASSWORD)).toHaveProperty("account.username", name);
  expect(await signUp(name, PASSWORD)).toEqual({ error: "That name is taken" });
});

test("a bad name or password is refused", async () => {
  expect(await signUp("ab", PASSWORD)).toHaveProperty("error");
  expect(await signUp("not a name", PASSWORD)).toHaveProperty("error");
  expect(await signUp("seventeenletters0", PASSWORD)).toHaveProperty("error");
  expect(await signUp(fresh(), "short")).toHaveProperty("error");
  expect(await signUp(fresh(), "x".repeat(101))).toHaveProperty("error");
});

test("signing in needs the right password, and says the same for an unknown name", async () => {
  const name = fresh();
  await signUp(name, PASSWORD);
  expect(await signIn(name.toUpperCase(), PASSWORD)).toHaveProperty("account.username", name);
  const wrong = await signIn(name, "wrong horse");
  expect(wrong).toEqual({ error: "Wrong name or password" });
  expect(await signIn(fresh(), PASSWORD)).toEqual(wrong);
});

test("signing out ends that session and no other", async () => {
  const name = fresh();
  const first = await signUp(name, PASSWORD);
  const second = await signIn(name, PASSWORD);
  if ("error" in first || "error" in second) throw new Error("could not sign in");
  await signOut(first.token);
  expect(await accountOf(first.token)).toBeNull();
  expect(await accountOf(second.token)).toEqual({ username: name });
});

test("an expired or unknown session names nobody", async () => {
  const name = fresh();
  const entry = await signUp(name, PASSWORD);
  if ("error" in entry) throw new Error(entry.error);
  await sql`
    update sessions set expires_at = now() - interval '1 second'
    where account_id = (select id from accounts where username = ${name})`;
  expect(await accountOf(entry.token)).toBeNull();
  expect(await accountOf("no such token")).toBeNull();
  expect(await accountOf(null)).toBeNull();
});
