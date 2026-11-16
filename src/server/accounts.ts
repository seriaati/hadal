import { PASSWORD_MAX, PASSWORD_MIN, USERNAME, type Account } from "../shared/types";
import { sql } from "./db";

export const SESSION_DAYS = 30;

/** Signing up or in gives the account and the token for the player's cookie, or says why not. */
export type Entry = { account: Account; token: string } | { error: string };

const hashToken = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

async function openSession(accountId: string, username: string): Promise<Entry> {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  await sql`
    insert into sessions (token_hash, account_id, expires_at)
    values (${hashToken(token)}, ${accountId}, now() + ${SESSION_DAYS} * interval '1 day')`;
  return { account: { username }, token };
}

export async function signUp(username: string, password: string): Promise<Entry> {
  username = username.trim().toLowerCase();
  if (!USERNAME.test(username)) return { error: "A name is 3 to 16 letters or digits" };
  if (password.length < PASSWORD_MIN) return { error: `A password is at least ${PASSWORD_MIN} characters` };
  if (password.length > PASSWORD_MAX) return { error: `A password is at most ${PASSWORD_MAX} characters` };
  const [row] = await sql`
    insert into accounts (username, password_hash)
    values (${username}, ${await Bun.password.hash(password)})
    on conflict (username) do nothing
    returning id`;
  return row ? openSession(row.id, username) : { error: "That name is taken" };
}

/** The same refusal for an unknown name and a wrong password, so neither tells who has an account. */
export async function signIn(username: string, password: string): Promise<Entry> {
  username = username.trim().toLowerCase();
  const [row] = await sql`select id, password_hash from accounts where username = ${username}`;
  const known = row && password.length <= PASSWORD_MAX && (await Bun.password.verify(password, row.password_hash));
  if (!known) return { error: "Wrong name or password" };
  await sql`delete from sessions where expires_at < now()`;
  return openSession(row.id, username);
}

export async function accountOf(token: string | null): Promise<Account | null> {
  if (!token) return null;
  const [row] = await sql`
    select username from sessions join accounts on accounts.id = account_id
    where token_hash = ${hashToken(token)} and expires_at > now()`;
  return row ? { username: row.username } : null;
}

/** The id of the signed-in account, for the tables that hang off it. It never goes to the browser. */
export async function accountIdOf(token: string | null): Promise<string | null> {
  if (!token) return null;
  const [row] = await sql`select account_id from sessions where token_hash = ${hashToken(token)} and expires_at > now()`;
  return row?.account_id ?? null;
}

export async function signOut(token: string) {
  await sql`delete from sessions where token_hash = ${hashToken(token)}`;
}
