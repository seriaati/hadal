// Finds other names for every answer of a pack: the titles that redirect to its Wikipedia article
// (aliases a player may type, though some are only misspellings or old forms to leave out), and
// its names on Wikidata in English, Simplified Chinese and Traditional Chinese as written in
// Taiwan (for making the Chinese packs; where Wikidata has none, its Chinese article's title or
// plain Chinese label, converted). Writes them to `curation/<pack id>.names.json`.
//   bun tools/names.ts packs/en/geography.json [--prompt germany-borders] [--hint "dog breed"]
import { Converter } from "opencc-js";
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
type Names = { title: string | null; redirects: string[]; en: string | null; zhCN: string | null; zhTW: string | null };
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
          redirects: article ? (others.get(article.title) ?? []) : [],
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
