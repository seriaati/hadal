import { basename, join } from "node:path";
import { LANGUAGES, type Language } from "../shared/language";
import { MAX_ANSWER_LENGTH, TIERS, type Pack } from "../shared/types";
import { en, type Words } from "../shared/words/en";
import { normalize } from "./game";

const PACKS_DIR = join(import.meta.dir, "../../packs");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 40;
// The pack's name shares one line of the screen with the round count.
export const MAX_NAME_LENGTH = 24;
export const MAX_PROMPT_LENGTH = 80;

/** Everything wrong with a pack, in words its author can act on. An empty list means the pack is valid. */
export function validatePack(data: unknown, words: Words = en): string[] {
  const say = words.check;
  const problems: string[] = [];
  const fields = (value: unknown, allowed: string[], where: string): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      problems.push(say.object(where));
      return false;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) problems.push(say.unknownField(where, key));
    }
    return true;
  };
  const text = (value: unknown, max: number, where: string): value is string => {
    const ok = typeof value === "string" && value.trim() !== "" && value.length <= max;
    if (!ok) problems.push(say.text(where, max));
    return ok;
  };
  const slug = (value: unknown, where: string): value is string => {
    const ok = typeof value === "string" && value.length <= MAX_ID_LENGTH && SLUG.test(value);
    if (!ok) problems.push(say.slug(where));
    return ok;
  };
  const list = (value: unknown, min: number, where: string): unknown[] => {
    if (Array.isArray(value) && value.length >= min) return value;
    problems.push(say.list(where, min));
    return Array.isArray(value) ? value : [];
  };

  if (!fields(data, ["id", "name", "prompts"], say.pack)) return problems;
  slug(data.id, say.id);
  text(data.name, MAX_NAME_LENGTH, say.name);
  const promptIds = new Set<string>();
  list(data.prompts, 1, say.prompts).forEach((prompt, i) => {
    let where = say.prompt(i + 1);
    if (!fields(prompt, ["id", "text", "answers"], where)) return;
    if (slug(prompt.id, say.field(where, "id"))) {
      where = say.promptNamed(prompt.id);
      if (promptIds.has(prompt.id)) problems.push(say.sameId(where));
      promptIds.add(prompt.id);
    }
    text(prompt.text, MAX_PROMPT_LENGTH, say.field(where, "text"));

    const spellings = new Set<string>();
    let gems = 0;
    const answers = list(prompt.answers, 2, say.field(where, "answers"));
    answers.forEach((answer, j) => {
      let at = say.answer(where, j + 1);
      if (!fields(answer, ["text", "aliases", "tier"], at)) return;
      if (typeof answer.text === "string") at = say.answerNamed(where, answer.text);
      if (answer.tier === "gem") gems++;
      else if (typeof answer.tier !== "string" || !Object.hasOwn(TIERS, answer.tier)) problems.push(say.tier(at, Object.keys(TIERS)));
      const aliases = answer.aliases === undefined ? [] : list(answer.aliases, 0, say.field(at, "aliases"));
      for (const spelling of [answer.text, ...aliases]) {
        if (!text(spelling, MAX_ANSWER_LENGTH, say.everySpelling(at))) continue;
        const key = normalize(spelling);
        if (!key) problems.push(say.noLetters(at, spelling));
        else if (spellings.has(key)) problems.push(say.twice(at, spelling));
        spellings.add(key);
      }
    });
    // So that every prompt can take the diver equally deep.
    if (answers.length && !gems) problems.push(say.gem(where));
  });
  return problems;
}

/** The built-in packs of every language, each in the folder named after its language. */
export async function loadBuiltIn(dir = PACKS_DIR): Promise<Record<Language, Pack[]>> {
  const packs = Object.fromEntries(await Promise.all(LANGUAGES.map(async (language) => [language, await loadPacks(join(dir, language))]))) as Record<Language, Pack[]>;
  // A prompt's id starts with its pack's, and every language's prompts are judged together.
  const ids = Object.values(packs).flat().map((pack) => pack.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) throw new Error(`two built-in packs have the id "${twice}": a pack's id is unique across every language`);
  return packs;
}

export async function loadPacks(dir: string): Promise<Pack[]> {
  const files = await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: dir, absolute: true }));
  return Promise.all(
    files.sort().map(async (file) => {
      const pack: unknown = await Bun.file(file).json();
      const problems = validatePack(pack);
      // File names are unique, so this keeps pack ids unique too.
      if ((pack as Pack).id !== basename(file, ".json")) problems.push("the pack's id must be the file's name");
      if (problems.length) throw new Error(`${basename(file)} is not a valid pack:\n- ${problems.join("\n- ")}`);
      return pack as Pack;
    }),
  );
}
