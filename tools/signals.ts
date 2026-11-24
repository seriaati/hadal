// Looks every answer of a pack up on Wikipedia: which article it means, how often that was read in
// the last 60 days, and in how many Wikipedias it has an article. Suggests a tier from the reads,
// writes it all to `curation/<pack id>.signals.json` for the review page, and lists the answers
// whose tier is far from the suggestion, and those it found no article for. `--known` suggests on
// the curve for sets most players know well (countries, capitals) rather than open ones (species).
//   bun tools/signals.ts packs/en/geography.json [--prompt germany-borders] [--hint "dog breed"] [--known]
import { pyramid, type Curve, type Signal, type Signals } from "../src/shared/review";
import { TIERS, type Tier } from "../src/shared/types";
import { option, readPack, resolve, signalsFile, titlesOf, wikiOf } from "./curation";
import { entities, views } from "./wiki";

/** How often each name's article was read in the last 60 days, in how many Wikipedias it has one, and the tier that suggests. */
export async function readsOf(names: string[], language: string, curve: Curve, hint?: string): Promise<Signal[]> {
  const found = await resolve(names, language, hint);
  const read = await views([...new Set([...found.values()].map((article) => article.title))], language);
  const items = await entities([...found.values()].flatMap((article) => (article.qid ? [article.qid] : [])), [language]);
  const amounts = names.map((name) => {
    const article = found.get(name);
    return article ? (read.get(article.title) ?? 0) : null;
  });
  const suggested = pyramid(amounts, curve);
  return names.map((name, i) => {
    const article = found.get(name);
    const item = article?.qid ? items.get(article.qid) : undefined;
    return { title: article?.title ?? null, views: amounts[i]!, sitelinks: item?.sitelinks ?? null, suggested: suggested[i]! };
  });
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Name a pack file: bun tools/signals.ts packs/en/geography.json");
    process.exit(1);
  }
  const only = option("--prompt");
  const hint = option("--hint");
  const curve: Curve = process.argv.includes("--known") ? "known" : "open";
  const pack = await readPack(file);
  const language = wikiOf(file);
  const titles = await titlesOf(pack.id);
  const out = Bun.file(signalsFile(pack.id));
  const signals: Signals = (await out.exists()) ? await out.json() : {};
  const order = Object.keys(TIERS) as Tier[];

  for (const prompt of pack.prompts.filter((prompt) => !only || prompt.id === only)) {
    const names = prompt.answers.map((answer) => titles[prompt.id]?.[answer.text] ?? answer.text);
    const reads = await readsOf(names, language, curve, hint);
    const amounts = reads.map((read) => read.views);
    signals[prompt.id] = Object.fromEntries(prompt.answers.map((answer, i) => [answer.text, reads[i]!]));

    console.log(`\n${prompt.id}: ${amounts.filter((amount) => amount !== null).length} of ${prompt.answers.length} answers found on ${language}.wikipedia.org, suggested on the ${curve} curve`);
    prompt.answers.forEach((answer, i) => {
      const tip = reads[i]!.suggested;
      // A gem is chosen among the rarest, so it is weighed as one of them.
      const tier = answer.tier === "gem" ? "rare" : answer.tier;
      if (tip && Math.abs(order.indexOf(tier) - order.indexOf(tip)) >= 2) {
        console.log(`  ${answer.text}: ${answer.tier}, but read like ${tip} (${amounts[i]} views of "${reads[i]!.title}")`);
      }
    });
    const missing = prompt.answers.filter((_, i) => amounts[i] === null).map((answer) => answer.text);
    if (missing.length) console.log(`  no article: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? `, and ${missing.length - 20} more` : ""}`);
  }

  await Bun.write(out, `${JSON.stringify(signals, null, 2)}\n`);
  console.log(`\nWritten to ${signalsFile(pack.id)}`);
}
