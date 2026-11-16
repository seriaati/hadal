import type { Answer, GamePrompt, Pack, Verdict } from "../shared/types";

export type PromptIndex = Map<string, { prompt: GamePrompt; answers: Map<string, Answer> }>;

/**
 * Reduce an answer to a comparison key: no case, accents, punctuation, spaces or leading "the".
 * Only Latin letters lose their accents: in other scripts the marks tell words apart.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
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

/** How many typos separate two spellings: a letter added, dropped or changed, or two neighbours swapped. */
export function typos(a: string, b: string): number {
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      let count = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) count = Math.min(count, before[j - 2]! + 1);
      row.push(count);
    }
    before = previous;
    previous = row;
  }
  return previous[b.length]!;
}

const digits = (text: string) => text.replace(/\P{N}/gu, "");

/**
 * The answer that `typed` misspells, if there is exactly one nearest. Short answers forgive
 * nothing ("Iran" is not "Iraq"), and the first letter and any digits must be right: those are
 * rarely typos and often another word ("Beach" is not "Peach", "Apollo 12" is not "Apollo 11").
 */
function misspelled(answers: Map<string, Answer>, typed: string): Answer | undefined {
  let nearest: Answer | undefined;
  let fewest = Infinity;
  let tied = false;
  for (const [spelling, answer] of answers) {
    if (spelling[0] !== typed[0] || digits(spelling) !== digits(typed)) continue;
    const allowed = spelling.length < 5 ? 0 : spelling.length < 9 ? 1 : 2;
    const count = typos(spelling, typed);
    if (count > allowed || count > fewest) continue;
    if (count < fewest) tied = false;
    else if (answer !== nearest) tied = true;
    nearest = answer;
    fewest = count;
  }
  return tied ? undefined : nearest;
}

/** Returns null when the prompt id is unknown. */
export function judge(index: PromptIndex, promptId: string, input: string): Verdict | null {
  const entry = index.get(promptId);
  if (!entry) return null;
  const typed = normalize(input);
  const answer = entry.answers.get(typed) ?? misspelled(entry.answers, typed);
  return answer ? { answer: answer.text, rarity: answer.rarity } : { answer: null, rarity: 0 };
}
