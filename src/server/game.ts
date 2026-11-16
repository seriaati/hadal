import { join } from "node:path";
import type { Answer, GamePrompt, Pack, Verdict } from "../shared/types";

const PACKS_DIR = join(import.meta.dir, "../../packs");

export type PromptIndex = Map<string, { prompt: GamePrompt; answers: Map<string, Answer> }>;

/** Reduce an answer to a comparison key: no case, accents, punctuation, spaces or leading "the". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replaceAll(" ", "");
}

export async function loadPacks(dir = PACKS_DIR): Promise<Pack[]> {
  const files = await Array.fromAsync(new Bun.Glob("*.json").scan({ cwd: dir, absolute: true }));
  return Promise.all(files.sort().map((file) => Bun.file(file).json()));
}

/** Index every prompt by "pack/prompt" id, with its answers keyed by normalized spelling. */
export function buildIndex(packs: Pack[]): PromptIndex {
  const index: PromptIndex = new Map();
  for (const pack of packs) {
    for (const prompt of pack.prompts) {
      const id = `${pack.id}/${prompt.id}`;
      const answers = new Map<string, Answer>();
      for (const answer of prompt.answers) {
        if (!(answer.rarity >= 1 && answer.rarity <= 100)) {
          throw new Error(`${id}: "${answer.text}" has a rarity outside 1-100`);
        }
        for (const spelling of [answer.text, ...(answer.aliases ?? [])]) {
          const key = normalize(spelling);
          if (answers.has(key)) throw new Error(`${id}: duplicate answer "${spelling}"`);
          answers.set(key, answer);
        }
      }
      index.set(id, { prompt: { id, text: prompt.text, pack: pack.name }, answers });
    }
  }
  return index;
}

export function pickPrompts(index: PromptIndex, count: number): GamePrompt[] {
  const prompts = [...index.values()].map((entry) => entry.prompt);
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j]!, prompts[i]!];
  }
  return prompts.slice(0, count);
}

/** Returns null when the prompt id is unknown. */
export function judge(index: PromptIndex, promptId: string, input: string): Verdict | null {
  const entry = index.get(promptId);
  if (!entry) return null;
  const answer = entry.answers.get(normalize(input));
  return answer ? { answer: answer.text, rarity: answer.rarity } : { answer: null, rarity: 0 };
}
