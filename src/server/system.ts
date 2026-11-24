import { existsSync } from "node:fs";
import { LANGUAGES, isLanguage, type Language } from "../shared/language";
import type { Pack, SystemPackSummary } from "../shared/types";
import { sql } from "./db";
import { PACKS_DIR, loadBuiltIn, validatePack } from "./packs";

/** Saved, refused for its problems, or held back because it would remove prompts the pack has now (their texts). */
export type Saved = { saved: Pack } | { problems: string[] } | { removes: string[] };

export async function loadSystemPacks(): Promise<Record<Language, Pack[]>> {
  const packs = Object.fromEntries(LANGUAGES.map((language) => [language, [] as Pack[]])) as Record<Language, Pack[]>;
  for (const { language, data } of await sql`select language, data from system_packs order by id`) {
    const known: unknown = language;
    if (isLanguage(known)) packs[known].push(data);
  }
  return packs;
}

export async function listSystemPacks(): Promise<SystemPackSummary[]> {
  const rows = await sql`
    select id, language, data->>'name' as name, jsonb_array_length(data->'prompts') as prompts
    from system_packs order by language, id`;
  return [...rows];
}

export async function loadSystemPack(id: string): Promise<{ language: Language; pack: Pack } | null> {
  const [row] = await sql`select language, data from system_packs where id = ${id}`;
  return row ? { language: row.language, pack: row.data } : null;
}

/**
 * A pack with the id of one already there takes its place, and the one it replaces is kept in `system_pack_versions`.
 * Unless `replace`, it is held back if it would remove prompts the pack has: a copy edited before the day's prompts
 * were added would lose them.
 */
export async function saveSystemPack(language: Language, pack: unknown, replace: boolean): Promise<Saved> {
  const problems = validatePack(pack);
  if (problems.length) return { problems };
  const { id, prompts } = pack as Pack;
  const [row] = await sql`select language, data from system_packs where id = ${id}`;
  if (row && row.language !== language) return { problems: [`"${id}" is already a ${row.language} pack: a pack's id is unique across every language`] };
  const kept = new Set(prompts.map((prompt) => prompt.id));
  const removes = row ? (row.data as Pack).prompts.filter((prompt) => !kept.has(prompt.id)).map((prompt) => prompt.text) : [];
  if (removes.length && !replace) return { removes };
  await sql.begin(async (tx) => {
    await tx`insert into system_pack_versions (id, language, data, saved_at) select id, language, data, saved_at from system_packs where id = ${id}`;
    await tx`
      insert into system_packs (id, language, data) values (${id}, ${language}, ${pack})
      on conflict (id) do update set data = excluded.data, saved_at = now()`;
  });
  return { saved: pack as Pack };
}

/** An empty table takes the files of `packs/`, if there are any: how a new local database gets its packs. Returns how many. */
export async function seedSystemPacks(dir = PACKS_DIR): Promise<number> {
  const [{ count }] = await sql`select count(*)::int as count from system_packs`;
  if (count || !existsSync(dir)) return 0;
  const packs = await loadBuiltIn(dir);
  await sql.begin(async (tx) => {
    for (const language of LANGUAGES) {
      for (const pack of packs[language]) await tx`insert into system_packs (id, language, data) values (${pack.id}, ${language}, ${pack})`;
    }
  });
  return Object.values(packs).flat().length;
}
