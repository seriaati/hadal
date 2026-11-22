// Finds other names for every answer of a pack: the titles that redirect to its Wikipedia article
// (aliases a player may type, though some are only old forms or nicknames to leave out), the aliases
// the pack gives the same answer in its other prompts, and its names on Wikidata in English, Simplified Chinese and Traditional Chinese as written in
// Taiwan (for making the Chinese packs; where Wikidata has none, its Chinese article's title or
// plain Chinese label, converted). Writes them to `curation/<pack id>.names.json`.
//   bun tools/names.ts packs/en/geography.json [--prompt germany-borders] [--hint "dog breed"]
import { Converter } from "opencc-js";
import { buildIndex, judge, normalize } from "../src/server/game";
import type { Answer } from "../src/shared/types";
import { namesFile, option, readPack, resolve, titlesOf, wikiOf } from "./curation";
import { entities, redirects } from "./wiki";

/** Wikidata's label languages, from the most particular: Taiwan's own before Traditional Chinese at large, and plain "zh" in either script. */
const LABELS = ["en", "zh-cn", "zh-hans", "zh-tw", "zh-hant", "zh"];
const toCN = Converter({ from: "t", to: "cn" });
/** With Taiwan's words as well as its characters: 软件 is 軟體. */
const toTW = Converter({ from: "cn", to: "twp" });
/** Some Chinese labels are only the English name copied in. */
const chinese = (name: string | undefined) => (name && /\p{Script=Han}/u.test(name) ? name : undefined);
/** Every name goes through the converter, since labels are sometimes filed under the wrong script. */
const once = (convert: (text: string) => string, name: string | undefined) => (name ? convert(name) : null);

const file = process.argv[2];
if (!file) {
  console.error("Name a pack file: bun tools/names.ts packs/en/geography.json");
  process.exit(1);
}
const only = option("--prompt");
const hint = option("--hint");
const pack = await readPack(file);
const language = wikiOf(file);
const titles = await titlesOf(pack.id);
const index = buildIndex([pack]);
const inPack = new Map<string, Set<string>>();
for (const answer of pack.prompts.flatMap((prompt) => prompt.answers)) {
  for (const alias of answer.aliases ?? []) inPack.set(answer.text, (inPack.get(answer.text) ?? new Set()).add(alias));
}
const latin = (text: string) => !/[^\P{L}\p{Script=Latin}]/u.test(text);

/**
 * Whether a redirect is worth reading as an alias. Not one the game already takes as an answer of the prompt (another case,
 * accent or a small typo), nor a longer title holding the answer ("Sport in Bahrain", "Kingdom of Bahrain"), nor another
 * kind of title ("ISO 3166-1:BH", "Bahrain (country)"), nor in another script than a Latin answer.
 */
function usable(promptId: string, answer: Answer, redirect: string): boolean {
  if (/[:()]/.test(redirect) || normalize(redirect).includes(normalize(answer.text))) return false;
  if (latin(answer.text) && !latin(redirect)) return false;
  return !judge(index, `${pack.id}/${promptId}`, redirect)?.answer;
}

/** The usable redirects by their comparison key, so spellings differing only in punctuation come once. */
const usableRedirects = (promptId: string, answer: Answer, redirects: string[]) =>
  redirects.filter((redirect) => usable(promptId, answer, redirect)).reverse().map((redirect) => [normalize(redirect), redirect] as const);

type Names = { title: string | null; redirects: string[]; inPack: string[]; en: string | null; zhCN: string | null; zhTW: string | null };
const out: Record<string, Record<string, Names>> = {};

for (const prompt of pack.prompts.filter((prompt) => !only || prompt.id === only)) {
  const names = prompt.answers.map((answer) => titles[prompt.id]?.[answer.text] ?? answer.text);
  const found = await resolve(names, language, hint);
  const others = await redirects([...new Set([...found.values()].map((article) => article.title))], language);
  const items = await entities([...found.values()].flatMap((article) => (article.qid ? [article.qid] : [])), LABELS);
  out[prompt.id] = Object.fromEntries(
    prompt.answers.map((answer, i) => {
      const article = found.get(names[i]!);
      const item = article?.qid ? items.get(article.qid) : undefined;
      const labels = item?.labels ?? {};
      const plain = chinese(labels.zh) ?? chinese(item?.zhwiki ?? undefined);
      return [
        answer.text,
        {
          title: article?.title ?? null,
          redirects: [...new Map(usableRedirects(prompt.id, answer, article ? (others.get(article.title) ?? []) : [])).values()],
          inPack: [...(inPack.get(answer.text) ?? [])].filter((alias) => !answer.aliases?.includes(alias)),
          en: labels.en ?? null,
          zhCN: once(toCN, chinese(labels["zh-cn"]) ?? chinese(labels["zh-hans"]) ?? plain),
          zhTW: once(toTW, chinese(labels["zh-tw"]) ?? chinese(labels["zh-hant"]) ?? plain),
        },
      ];
    }),
  );
  console.log(`${prompt.id}: ${found.size} of ${prompt.answers.length} answers found`);
}

await Bun.write(namesFile(pack.id), `${JSON.stringify(out, null, 2)}\n`);
console.log(`Written to ${namesFile(pack.id)}`);
