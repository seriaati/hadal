// Lists the articles a Wikipedia page links to, or the articles in a category: the raw material of
// an answer list, which still has to be sorted by hand (a list page also links to places, people
// and other lists).
//   bun tools/members.ts "List of dog breeds"
//   bun tools/members.ts "Category:Dog breeds originating in Japan" --language ja
import { members } from "./wiki";

const at = process.argv.indexOf("--language");
const language = at > 0 ? process.argv[at + 1]! : "en";
const source = process.argv.slice(2).find((arg, i, args) => !arg.startsWith("--") && args[i - 1] !== "--language");
if (!source) {
  console.error('Name a page or a category: bun tools/members.ts "List of dog breeds"');
  process.exit(1);
}
for (const title of await members(source, language)) console.log(title);
