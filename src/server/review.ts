// The review page of developer mode reads and writes the built-in packs through this.
import { join } from "node:path";
import type { Reviewed, ReviewSummary, Signals } from "../shared/review";
import { countsOf } from "./counts";
import { listSystemPacks, loadSystemPack, saveSystemPack } from "./system";

const CURATION = join(import.meta.dir, "../../curation");

export const reviewList = (): Promise<ReviewSummary[]> => listSystemPacks();

/** A built-in pack of that language, or null. */
async function packOf(language: string, id: string) {
  const found = await loadSystemPack(id);
  return found?.language === language ? found : null;
}

export async function review(language: string, id: string): Promise<Reviewed | null> {
  const found = await packOf(language, id);
  if (!found) return null;
  const { pack } = found;
  const file = Bun.file(join(CURATION, `${id}.signals.json`));
  const signals = (await file.exists()) ? ((await file.json()) as Signals) : null;
  const counts = Object.fromEntries(await Promise.all(pack.prompts.map(async (prompt) => [prompt.id, await countsOf(`${id}/${prompt.id}`)])));
  return { language: found.language, pack, signals, counts };
}

/** Saves a reviewed pack over the one there. Returns what is wrong with it instead, or null when there is no such pack. */
export async function saveReviewed(language: string, id: string, pack: unknown): Promise<string[] | null> {
  const found = await packOf(language, id);
  if (!found) return null;
  if ((pack as { id?: unknown })?.id !== id) return ["the pack's id must stay as it is"];
  const saved = await saveSystemPack(found.language, pack, true);
  return "problems" in saved ? saved.problems : [];
}
