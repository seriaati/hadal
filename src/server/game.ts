import type { Answer, GamePrompt, Pack, Verdict } from "../shared/types";

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

/** Index every prompt by "pack/prompt" id, with its answers keyed by normalized spelling. Expects valid packs. */
export function buildIndex(packs: Pack[]): PromptIndex {
  const index: PromptIndex = new Map();
  for (const pack of packs) {
    for (const prompt of pack.prompts) {
      const id = `${pack.id}/${prompt.id}`;
      const answers = new Map<string, Answer>();
      for (const answer of prompt.answers) {
        for (const spelling of [answer.text, ...(answer.aliases ?? [])]) answers.set(normalize(spelling), answer);
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

/** The pack's spelling of the answer whose rarity is nearest to `rarity`, or null when the prompt id is unknown. */
export function nearestAnswer(index: PromptIndex, promptId: string, rarity: number): string | null {
  const answers = [...(index.get(promptId)?.answers.values() ?? [])];
  const nearest = answers.reduce<Answer | null>((best, answer) => (best && Math.abs(best.rarity - rarity) <= Math.abs(answer.rarity - rarity) ? best : answer), null);
  return nearest?.text ?? null;
}

/** Returns null when the prompt id is unknown. */
export function judge(index: PromptIndex, promptId: string, input: string): Verdict | null {
  const entry = index.get(promptId);
  if (!entry) return null;
  const answer = entry.answers.get(normalize(input));
  return answer ? { answer: answer.text, rarity: answer.rarity } : { answer: null, rarity: 0 };
}
