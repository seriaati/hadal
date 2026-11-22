// The review page of developer mode reads and writes the built-in pack files through this.
import { join } from "node:path";
import { isLanguage, LANGUAGES } from "../shared/language";
import type { Reviewed, ReviewSummary, Signals } from "../shared/review";
import type { Pack } from "../shared/types";
import { countsOf } from "./counts";
import { formatPack, validatePack } from "./packs";

const PACKS = join(import.meta.dir, "../../packs");
const CURATION = join(import.meta.dir, "../../curation");
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The file of a built-in pack that exists, or null: a name that is not a plain id never reaches the disk. */
async function fileOf(language: string, id: string) {
  if (!isLanguage(language) || !ID.test(id)) return null;
  const file = Bun.file(join(PACKS, language, `${id}.json`));
  return (await file.exists()) ? file : null;
}

export async function reviewList(): Promise<ReviewSummary[]> {
  const list: ReviewSummary[] = [];
  for (const language of LANGUAGES) {
    for (const name of [...new Bun.Glob("*.json").scanSync(join(PACKS, language))].sort()) {
      const pack = (await Bun.file(join(PACKS, language, name)).json()) as Pack;
      list.push({ language, id: pack.id, name: pack.name, prompts: pack.prompts.length });
    }
  }
  return list;
}

export async function review(language: string, id: string): Promise<Reviewed | null> {
  const file = await fileOf(language, id);
  if (!file) return null;
  const pack = (await file.json()) as Pack;
  const found = Bun.file(join(CURATION, `${id}.signals.json`));
  const signals = (await found.exists()) ? ((await found.json()) as Signals) : null;
  const counts = Object.fromEntries(await Promise.all(pack.prompts.map(async (prompt) => [prompt.id, await countsOf(`${id}/${prompt.id}`)])));
  return { language, pack, signals, counts };
}

/** Writes a reviewed pack over its file. Returns what is wrong with it instead, or null when there is no such pack. */
export async function saveReviewed(language: string, id: string, pack: unknown): Promise<string[] | null> {
  const file = await fileOf(language, id);
  if (!file) return null;
  const problems = validatePack(pack);
  if (!problems.length && (pack as Pack).id !== id) problems.push("the pack's id must stay as it is");
  if (!problems.length) await Bun.write(file, formatPack(pack as Pack));
  return problems;
}
