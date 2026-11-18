import { PASSWORD_MAX, PASSWORD_MIN, USERNAME, type Account } from "../shared/types";
import { en, type Words } from "../shared/words/en";
import { sql } from "./db";

export const SESSION_DAYS = 30;

export type Entry = { account: Account; token: string } | { error: string };

const hashToken = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

async function openSession(accountId: string): Promise<Entry> {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  await sql`
    insert into sessions (token_hash, account_id, expires_at)
    values (${hashToken(token)}, ${accountId}, now() + ${SESSION_DAYS} * interval '1 day')`;
  return { account: (await accountOf(token))!, token };
}

export async function signUp(username: string, password: string, words: Words = en): Promise<Entry> {
  username = username.trim().toLowerCase();
  if (!USERNAME.test(username)) return { error: words.account.badName };
  if (password.length < PASSWORD_MIN) return { error: words.account.shortPassword(PASSWORD_MIN) };
  if (password.length > PASSWORD_MAX) return { error: words.account.longPassword(PASSWORD_MAX) };
  const [row] = await sql`
    insert into accounts (username, password_hash)
    values (${username}, ${await Bun.password.hash(password)})
    on conflict (username) do nothing
    returning id`;
  return row ? openSession(row.id) : { error: words.account.nameTaken };
}

/** The same refusal for an unknown name and a wrong password, so neither tells who has an account. */
export async function signIn(username: string, password: string, words: Words = en): Promise<Entry> {
  username = username.trim().toLowerCase();
  const [row] = await sql`select id, password_hash from accounts where username = ${username}`;
  const known = row && password.length <= PASSWORD_MAX && (await Bun.password.verify(password, row.password_hash));
  if (!known) return { error: words.account.wrong };
  await sql`delete from sessions where expires_at < now()`;
  return openSession(row.id);
}

export const SIGN_IN_TRIES = 10;
const SIGN_IN_MINUTES = 15;
/** Failed sign-ins per address, each count kept for SIGN_IN_MINUTES from the first. Lost on restart. */
const tries = new Map<string, { failed: number; since: number }>();

export async function signInFrom(address: string, username: string, password: string, words: Words = en): Promise<Entry> {
  const now = Date.now();
  for (const [key, entry] of tries) if (now - entry.since > SIGN_IN_MINUTES * 60_000) tries.delete(key);
  const counted = tries.get(address) ?? { failed: 0, since: now };
  if (counted.failed >= SIGN_IN_TRIES) {
    const minutes = Math.ceil((counted.since + SIGN_IN_MINUTES * 60_000 - now) / 60_000);
    return { error: words.account.tooManyTries(minutes) };
  }
  // Counted before the password is checked, so tries sent all at once cannot slip past the limit.
  counted.failed++;
  tries.set(address, counted);
  const entry = await signIn(username, password, words);
  if (!("error" in entry)) counted.failed--;
  return entry;
}

export async function accountOf(token: string | null): Promise<Account | null> {
  if (!token) return null;
  const [row] = await sql`
    select username,
      exists (select from keys where keys.account_id = accounts.id and provider = 'anthropic') as anthropic,
      exists (select from keys where keys.account_id = accounts.id and provider = 'jev') as jev,
      (select failed from keys where keys.account_id = accounts.id and provider = 'anthropic') as anthropic_failed,
      (select failed from keys where keys.account_id = accounts.id and provider = 'jev') as jev_failed
    from sessions join accounts on accounts.id = account_id
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  if (!row) return null;
  return { username: row.username, keys: { anthropic: row.anthropic, jev: row.jev }, failed: { anthropic: row.anthropic_failed, jev: row.jev_failed } };
}

/** The account's id never goes to the browser. */
export async function accountIdOf(token: string | null): Promise<string | null> {
  if (!token) return null;
  const [row] = await sql`select account_id from sessions where token_hash = ${hashToken(token)} and expires_at > now()`;
  return row?.account_id ?? null;
}

export async function signOut(token: string) {
  await sql`delete from sessions where token_hash = ${hashToken(token)}`;
}
