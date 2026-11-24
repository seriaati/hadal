import { Converter } from "opencc-js/t2cn";
import { TIERS, type Answer, type GamePrompt, type Pack, type Verdict } from "../shared/types";

export type PromptEntry = { prompt: GamePrompt; answers: Map<string, Answer> };
export type PromptIndex = Map<string, PromptEntry>;
const simplified = Converter({ from: "t", to: "cn" });
/** Starts the prompt ids of a player's own pack. No built-in pack's id can hold a colon. */
export const OWN = "own:";

/**
 * Reduce an answer to a comparison key: no case, accents, punctuation, spaces or leading "the",
 * and Chinese in simplified characters, so "關" and "关" are the same answer.
 * Only Latin letters lose their accents: in other scripts the marks tell words apart.
 */
export function normalize(text: string): string {
  return simplified(text)
    .normalize("NFD")
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .replace(/^the /, "")
    .replaceAll(" ", "");
}

/**
 * The answers to a prompt that a text names: as whole words (up to 8 together), or anywhere in it for one written without
 * spaces (Chinese). It keeps what players say in a dive from giving an answer away.
 */
export function named(entry: PromptEntry, text: string): Answer[] {
  const words = text.split(/[^\p{L}\p{N}\p{M}]+/u).map(normalize).filter(Boolean);
  const found = new Set<Answer>();
  for (let i = 0; i < words.length; i++) {
    let key = "";
    for (let j = i; j < Math.min(words.length, i + 8); j++) {
      key += words[j];
      const answer = entry.answers.get(key);
      if (answer) found.add(answer);
    }
  }
  const whole = normalize(text);
  for (const [key, answer] of entry.answers) if (/\p{Script=Han}/u.test(key) && whole.includes(key)) found.add(answer);
  return [...found];
}

/** Expects valid packs. `prefix` keeps a player's own packs' ids apart from the built-in ones. */
export function buildIndex(packs: Pack[], prefix = ""): PromptIndex {
  const index: PromptIndex = new Map();
  for (const pack of packs) {
    for (const prompt of pack.prompts) {
      const id = `${prefix}${pack.id}/${prompt.id}`;
      const answers = new Map<string, Answer>();
      for (const answer of prompt.answers) {
        for (const spelling of [answer.text, ...(answer.aliases ?? [])]) answers.set(normalize(spelling), answer);
      }
      index.set(id, { prompt: { id, text: prompt.text, pack: pack.name }, answers });
    }
  }
  return index;
}

export function shuffle<T>(things: T[], random = Math.random): T[] {
  const shuffled = [...things];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * Every pack gives one prompt first, while the dive has room for them all (when it has not, a bigger
 * pack is likelier to get a place). After that a pack's chance is the prompts it has left, divided by
 * one more than the prompts it has given: big packs give the most, but each prompt they give makes
 * the next one less likely, and a tiny pack seldom gives a second.
 */
export function pickPrompts(index: PromptIndex, count: number): GamePrompt[] {
  const byPack = new Map<string, GamePrompt[]>();
  for (const [id, { prompt }] of index) {
    const pack = id.slice(0, id.indexOf("/"));
    byPack.set(pack, [...(byPack.get(pack) ?? []), prompt]);
  }
  const packs = [...byPack.values()].map((prompts) => ({ left: shuffle(prompts), given: 0 }));
  const firstRound = Math.min(count, packs.length);
  const picked: GamePrompt[] = [];
  while (picked.length < count && packs.some((pack) => pack.left.length)) {
    const weights = packs.map((pack) =>
      picked.length < firstRound ? (pack.given ? 0 : pack.left.length) : pack.left.length / (1 + pack.given),
    );
    let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    let i = 0;
    while (roll >= weights[i]! || !packs[i]!.left.length) roll -= weights[i++]!;
    const pack = packs[i]!;
    picked.push(pack.left.pop()!);
    pack.given++;
  }
  // Otherwise the one-from-each round would always open the dive.
  return shuffle(picked);
}

export function nearestAnswer(index: PromptIndex, promptId: string, rarity: number): string | null {
  const answers = [...(index.get(promptId)?.answers.values() ?? [])];
  const off = (answer: Answer) => Math.abs(TIERS[answer.tier] - rarity);
  const nearest = answers.reduce<Answer | null>((best, answer) => (best && off(best) <= off(answer) ? best : answer), null);
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

export function judge(index: PromptIndex, promptId: string, input: string): Verdict | null {
  const entry = index.get(promptId);
  if (!entry) return null;
  const typed = normalize(input);
  const answer = entry.answers.get(typed) ?? misspelled(entry.answers, typed);
  return answer ? { answer: answer.text, rarity: TIERS[answer.tier] } : { answer: null, rarity: 0 };
}
