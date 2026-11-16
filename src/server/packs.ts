import { basename, join } from "node:path";
import { MAX_ANSWER_LENGTH, type Pack } from "../shared/types";
import { normalize } from "./game";

const PACKS_DIR = join(import.meta.dir, "../../packs");
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 40;
// The pack's name shares one line of the screen with the round count.
const MAX_NAME_LENGTH = 24;
const MAX_PROMPT_LENGTH = 80;

/** Everything wrong with a pack, in words its author can act on. An empty list means the pack is valid. */
export function validatePack(data: unknown): string[] {
  const problems: string[] = [];
  const fields = (value: unknown, allowed: string[], where: string): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      problems.push(`${where} must be an object`);
      return false;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) problems.push(`${where} has an unknown field "${key}"`);
    }
    return true;
  };
  const text = (value: unknown, max: number, where: string): value is string => {
    const ok = typeof value === "string" && value.trim() !== "" && value.length <= max;
    if (!ok) problems.push(`${where} must be text of 1 to ${max} characters`);
    return ok;
  };
  const slug = (value: unknown, where: string): value is string => {
    const ok = typeof value === "string" && value.length <= MAX_ID_LENGTH && SLUG.test(value);
    if (!ok) problems.push(`${where} must be lower-case letters and digits joined by hyphens, like "asia-countries"`);
    return ok;
  };
  const list = (value: unknown, min: number, where: string): unknown[] => {
    if (Array.isArray(value) && value.length >= min) return value;
    problems.push(`${where} must be a list${min ? ` of at least ${min}` : ""}`);
    return Array.isArray(value) ? value : [];
  };

  if (!fields(data, ["id", "name", "prompts"], "the pack")) return problems;
  slug(data.id, "the pack's id");
  text(data.name, MAX_NAME_LENGTH, "the pack's name");
  const promptIds = new Set<string>();
  list(data.prompts, 1, "the pack's prompts").forEach((prompt, i) => {
    let where = `prompt ${i + 1}`;
    if (!fields(prompt, ["id", "text", "answers"], where)) return;
    if (slug(prompt.id, `${where}: id`)) {
      where = `prompt "${prompt.id}"`;
      if (promptIds.has(prompt.id)) problems.push(`${where}: another prompt already has this id`);
      promptIds.add(prompt.id);
    }
    text(prompt.text, MAX_PROMPT_LENGTH, `${where}: text`);

    const spellings = new Set<string>();
    let rarest = 0;
    const answers = list(prompt.answers, 2, `${where}: answers`);
    answers.forEach((answer, j) => {
      let at = `${where}, answer ${j + 1}`;
      if (!fields(answer, ["text", "aliases", "rarity"], at)) return;
      if (typeof answer.text === "string") at = `${where}, answer "${answer.text}"`;
      const rarity = answer.rarity;
      if (typeof rarity === "number" && Number.isInteger(rarity) && rarity >= 1 && rarity <= 100) {
        rarest = Math.max(rarest, rarity);
      } else {
        problems.push(`${at}: rarity must be a whole number from 1 to 100`);
        rarest = 100;
      }
      const aliases = answer.aliases === undefined ? [] : list(answer.aliases, 0, `${at}: aliases`);
      for (const spelling of [answer.text, ...aliases]) {
        if (!text(spelling, MAX_ANSWER_LENGTH, `${at}: every spelling`)) continue;
        const key = normalize(spelling);
        if (!key) problems.push(`${at}: "${spelling}" has no letters or digits`);
        else if (spellings.has(key)) problems.push(`${at}: "${spelling}" is already an answer to this prompt`);
        spellings.add(key);
      }
    });
    // Rarity is relative to the prompt's other answers, so that every prompt can take the diver equally deep.
    if (answers.length && rarest < 100) problems.push(`${where}: the rarest answer must have rarity 100`);
  });
  return problems;
}

export async function loadPacks(dir = PACKS_DIR): Promise<Pack[]> {
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
