// Checks pack files as the game does, and shows how each prompt's answers spread over the tiers.
// With --write, also lays each valid file out as the built-in packs are.
//   bun tools/check.ts [--write] packs/en/geography.json ...
import { basename } from "node:path";
import { formatPack, validatePack } from "../src/server/packs";
import { TIERS, type Pack, type Tier } from "../src/shared/types";

const write = process.argv.includes("--write");
const files = process.argv.slice(2).filter((arg) => arg !== "--write");
let failed = false;

for (const file of files) {
  const text = await Bun.file(file).text();
  const pack = JSON.parse(text) as Pack;
  const problems = validatePack(pack);
  if (pack.id !== basename(file, ".json")) problems.push("the pack's id must be the file's name");
  if (problems.length) {
    failed = true;
    console.log(`${file}:\n- ${problems.join("\n- ")}`);
    continue;
  }
  if (formatPack(pack) !== text) {
    if (write) await Bun.write(file, formatPack(pack));
    else {
      failed = true;
      console.log(`${file}: valid, but not laid out as the built-in packs are (run again with --write)`);
      continue;
    }
  }
  console.log(`${file}: valid`);
  for (const prompt of pack.prompts) {
    const of = (tier: Tier) => prompt.answers.filter((answer) => answer.tier === tier).length;
    const spread = (Object.keys(TIERS) as Tier[]).map((tier) => `${tier} ${of(tier)}`).join(", ");
    console.log(`  ${prompt.id}: ${prompt.answers.length} answers (${spread})`);
  }
}
process.exit(failed ? 1 : 0);
