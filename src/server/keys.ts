import { MAX_KEY_LENGTH, type KeyFailure, type Provider } from "../shared/types";
import { en, type Words } from "../shared/words/en";
import { sql } from "./db";

const MIN_SECRET_LENGTH = 32;

async function seal(): Promise<CryptoKey | null> {
  const secret = process.env.HADAL_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// A sealed key opens only for the account and provider it was sealed for, even if its row is copied to another.
const cipher = (accountId: string, provider: Provider, iv: Uint8Array<ArrayBuffer>) => ({
  name: "AES-GCM",
  iv,
  additionalData: new TextEncoder().encode(`${accountId}:${provider}`),
});

/** Returns why the key was not kept, or null when it was. */
export async function saveKey(accountId: string, provider: Provider, key: string, words: Words = en): Promise<string | null> {
  key = key.trim();
  if (!key || key.length > MAX_KEY_LENGTH || /\s/.test(key)) return words.account.notKey;
  const secret = await seal();
  if (!secret) return words.account.noSecret;
  // GCM must never use the same iv twice with one key: a fresh random one is stored in front of each sealed key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(cipher(accountId, provider, iv), secret, new TextEncoder().encode(key));
  const stored = Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64");
  await sql`
    insert into keys (account_id, provider, sealed) values (${accountId}, ${provider}, ${stored})
    on conflict (account_id, provider) do update set sealed = excluded.sealed, failed = null`;
  return null;
}

/** For the server's own use: it never goes back to the browser. Null if none is kept, or it can no longer be opened. */
export async function loadKey(accountId: string, provider: Provider): Promise<string | null> {
  const [row] = await sql`select sealed from keys where account_id = ${accountId} and provider = ${provider}`;
  const secret = await seal();
  if (!row || !secret) return null;
  const stored = new Uint8Array(Buffer.from(row.sealed, "base64"));
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt(cipher(accountId, provider, stored.slice(0, 12)), secret, stored.slice(12)));
  } catch {
    return null; // sealed with another secret, or tampered with
  }
}

export async function removeKey(accountId: string, provider: Provider) {
  await sql`delete from keys where account_id = ${accountId} and provider = ${provider}`;
}

export async function noteUse(accountId: string, provider: Provider, failed: KeyFailure | null) {
  await sql`update keys set failed = ${failed} where account_id = ${accountId} and provider = ${provider} and failed is distinct from ${failed}`;
}
