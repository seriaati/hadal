// Where the pack tools keep what they learn about a pack: `curation/`, beside `packs/`.
import { basename, dirname, join } from "node:path";
import type { Pack } from "../src/shared/types";
import { articles, type Article } from "./wiki";

export const CURATION = join(import.meta.dir, "../curation");

/** The Wikipedia a pack's answers are looked up in: the one of its language, which both Chinese packs share. */
export function wikiOf(file: string): string {
  const language = basename(dirname(file));
  return language.startsWith("zh") ? "zh" : language;
}

export async function readPack(file: string): Promise<Pack> {
  return (await Bun.file(file).json()) as Pack;
}

/**
 * The article an answer means, where its own name leads elsewhere ("Boxer" to the sport): kept by
 * hand in `curation/<pack id>.titles.json`, by prompt id and then by the answer's text.
 */
export async function titlesOf(packId: string): Promise<Record<string, Record<string, string>>> {
  const file = Bun.file(join(CURATION, `${packId}.titles.json`));
  return (await file.exists()) ? file.json() : {};
}

/**
 * The article each name leads to. A name that leads to none, or to a disambiguation page, is tried
 * again with the hint, as Wikipedia words such titles: "Boxer (dog breed)", "Boxer dog breed".
 */
export async function resolve(names: string[], language: string, hint?: string): Promise<Map<string, Article>> {
  const found = await articles(names, language);
  if (!hint) return found;
  const left = names.filter((name) => !found.has(name));
  const tries = [(name: string) => `${name} (${hint})`, (name: string) => `${name} ${hint}`];
  for (const named of tries) {
    const more = await articles(left.map(named), language);
    for (const name of left) {
      const article = more.get(named(name));
      if (article && !found.has(name)) found.set(name, article);
    }
  }
  return found;
}

/** The value given after a flag such as `--prompt`, if any. */
export function option(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at > 0 ? process.argv[at + 1] : undefined;
}

export const signalsFile = (packId: string) => join(CURATION, `${packId}.signals.json`);
export const namesFile = (packId: string) => join(CURATION, `${packId}.names.json`);
