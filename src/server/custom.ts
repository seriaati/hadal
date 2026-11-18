import { MAX_PACK_BYTES, type Pack, type PackSummary } from "../shared/types";
import { en, type Words } from "../shared/words/en";
import { sql } from "./db";
import { validatePack } from "./packs";

/** As many as the packs panel shows without scrolling. */
export const MAX_PACKS = 10;

export async function listPacks(accountId: string): Promise<PackSummary[]> {
  const rows = await sql`
    select id, data->>'name' as name, jsonb_array_length(data->'prompts') as prompts
    from packs where account_id = ${accountId}
    order by lower(data->>'name'), id`;
  return [...rows];
}

/** A pack with the id of one the account already has takes its place: that is how a pack is edited. */
export async function savePack(accountId: string, file: string, words: Words = en): Promise<string[]> {
  if (Buffer.byteLength(file) > MAX_PACK_BYTES) return [words.packs.tooBig(MAX_PACK_BYTES / 1000)];
  let pack: unknown;
  try {
    pack = JSON.parse(file);
  } catch (error) {
    return [words.packs.notJson((error as Error).message)];
  }
  const problems = validatePack(pack, words);
  if (problems.length) return problems;
  const { id } = pack as Pack;
  const [{ others }] = await sql`select count(*)::int as others from packs where account_id = ${accountId} and id <> ${id}`;
  if (others >= MAX_PACKS) return [words.packs.tooMany(MAX_PACKS)];
  await sql`
    insert into packs (account_id, id, data) values (${accountId}, ${id}, ${pack})
    on conflict (account_id, id) do update set data = excluded.data`;
  return [];
}

export async function loadPack(accountId: string, id: string): Promise<Pack | null> {
  const [row] = await sql`select data from packs where account_id = ${accountId} and id = ${id}`;
  return row?.data ?? null;
}

export async function removePack(accountId: string, id: string) {
  await sql`delete from packs where account_id = ${accountId} and id = ${id}`;
}
