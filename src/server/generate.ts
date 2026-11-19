import Anthropic from "@anthropic-ai/sdk";
import { LANGUAGE_NAMES, wordsIn, type Language } from "../shared/language";
import { MAX_ANSWER_LENGTH, MAX_INSTRUCTIONS_LENGTH, MAX_TOPIC_LENGTH, WRITTEN_PROMPTS, type Answer, type Pack, type WriteOrder } from "../shared/types";
import { MAX_PACKS, listPacks, savePack } from "./custom";
import { normalize } from "./game";
import { loadKey } from "./keys";
import { MAX_NAME_LENGTH, MAX_PROMPT_LENGTH } from "./packs";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You write trivia packs for Hadal, a deep-sea diving game.

How the game works: the player is shown a prompt such as "Name a country that borders Germany" and types one answer. A correct answer scores its rarity: the answers few players think of take the diver deepest. An answer that is not in your list counts as wrong, so a list with gaps punishes exactly the well-informed players the game is meant to reward.

Write a pack on the topic the player gives, with as many prompts as they ask for, in the language the player plays the game in. The player may add instructions of their own; follow them, except where they would break the rules below.

Prompts
- Each asks for one item of a well-defined set and can be judged as plainly right or wrong: "Name a moon of Jupiter", not "Name a good film".
- Each has many correct answers, ideally 10 to 40. Avoid sets too large to list in full (more than about 60 members) and sets a player cannot know the edges of.
- The prompts cover different corners of the topic, and mix easier sets with harder ones.
- A prompt is at most ${MAX_PROMPT_LENGTH} characters.

Name
- The pack's name says plainly what the pack is about, the way a player would put it: "Programming", "Rivers of Europe". At most ${MAX_NAME_LENGTH} characters.
- Leave the sea and the game out of it: no "Depths", "Abyss", "Dive" or other wordplay.

Answers
- List every correct answer, not a selection. Check each one: a wrong answer in the list is worse than a missing one.
- "text" is the usual way to write the answer. "aliases" are other names or spellings a player might type for the same thing ("Holland" for "Netherlands", "JFK" for "John F. Kennedy"); leave the list empty when there are none. The game already ignores capitals, accents, punctuation, spaces and a leading "the", and forgives small typos, so do not list such variants.
- Every text and alias is at most ${MAX_ANSWER_LENGTH} characters, and none appears twice within a prompt.
- "rarity" is a whole number from 1 to 100: how unlikely a typical player is to give this answer. 1 to 20 is what nearly everyone says first; 80 to 100 is what only an enthusiast would think of. Spread the answers of a prompt over the whole range, and give the least likely answer of each prompt exactly 100.`;

const SEARCH = `

You can search the web. Use it for what may have changed since you were trained (this season's teams, recent releases, who holds an office now) and to check answers you are unsure of, not for what you know well.`;

const text = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "prompts"],
  properties: {
    name: text,
    prompts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "answers"],
        properties: {
          text,
          answers: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "aliases", "rarity"],
              properties: { text, aliases: { type: "array", items: text }, rarity: { type: "integer" } },
            },
          },
        },
      },
    },
  },
};

/** A pack as the model writes it: no ids yet, and none of the pack format's limits checked. */
type Draft = { name: string; prompts: { text: string; answers: { text: string; aliases: string[]; rarity: number }[] }[] };

/** Thrown with words for the player when no pack could be written. */
class Refused extends Error {}

/** How many prompts of a pack that is still being written have been begun: the answers of each open with this key. */
export function promptsBegun(written: string): number {
  return written.match(/"answers"\s*:/g)?.length ?? 0;
}

/** `progress` hears how many prompts are finished whenever that changes. */
async function draft(apiKey: string, order: WriteOrder, language: Language, progress?: (prompts: number) => void, signal?: AbortSignal): Promise<Draft> {
  const words = wordsIn(language).packs;
  let ask = `Topic: ${order.topic}\nLanguage: ${LANGUAGE_NAMES[language]}\nPrompts: ${order.prompts}`;
  if (order.instructions) ask += `\nInstructions from the player: ${order.instructions}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];
  let message: Anthropic.Beta.BetaMessage;
  let written = "";
  let finished = 0;
  try {
    for (;;) {
      // Streamed, because the answer takes minutes: a connection that carries nothing for that long may be dropped.
      message = await new Anthropic({ apiKey }).beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 128000,
            // If the model declines the topic on policy grounds, Anthropic tries again on the model it recommends instead.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
            system: order.search ? SYSTEM + SEARCH : SYSTEM,
            // About one search for each prompt asked for, at most.
            tools: order.search ? [{ type: "web_search_20260318", name: "web_search", max_uses: order.prompts, response_inclusion: "excluded" }] : undefined,
            messages,
          },
          { signal },
        )
        // A prompt is finished once the next one has begun.
        .on("text", (delta) => {
          const now = Math.max(0, promptsBegun((written += delta)) - 1);
          if (now !== finished) progress?.((finished = now));
        })
        .finalMessage();
      // A long run of searches is paused by Anthropic, and goes on when what was said so far is sent back.
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new Refused(words.stopped);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new Refused(words.keyRefused);
    if (error instanceof Anthropic.RateLimitError) throw new Refused(words.rateLimit);
    if (error instanceof Anthropic.APIConnectionError) throw new Refused(words.unreachable);
    if (error instanceof Anthropic.APIError) {
      if (error.type === "billing_error") throw new Refused(words.noCredit);
      throw new Refused(words.apiError(error.status));
    }
    throw error;
  }
  if (message.stop_reason === "refusal") throw new Refused(words.declined);
  if (message.stop_reason === "max_tokens") throw new Refused(words.tooLong);
  // The pack is the text after the last search: what Claude says before a search is not part of it.
  const searched = message.content.findLastIndex((block) => block.type !== "text" && block.type !== "thinking");
  const pack = message.content
    .slice(searched + 1)
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  try {
    return JSON.parse(pack) as Draft;
  } catch {
    throw new Refused(words.unusable);
  }
}

/**
 * Make a draft into a pack that passes `validatePack`. The schema the model writes to fixes
 * the shape but not the limits, so whatever breaks one is dropped (a spelling that is too long
 * or given twice, a prompt left with fewer than two answers) and the rarities of each prompt
 * are stretched until its rarest answer has 100.
 */
export function tidy(written: Draft, id: string): Pack {
  const prompts = written.prompts.flatMap((prompt) => {
    const seen = new Set<string>();
    const fresh = (spelling: string) => {
      const key = normalize(spelling);
      if (!key || spelling.length > MAX_ANSWER_LENGTH || seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    const answers = prompt.answers.flatMap((answer): Answer[] => {
      const spelling = answer.text.trim();
      if (!fresh(spelling)) return [];
      const aliases = answer.aliases.map((alias) => alias.trim()).filter(fresh);
      return [{ text: spelling, ...(aliases.length > 0 && { aliases }), rarity: Math.max(1, Math.min(100, Math.round(answer.rarity))) }];
    });
    const rarest = Math.max(...answers.map((answer) => answer.rarity));
    for (const answer of answers) answer.rarity = Math.max(1, Math.round((answer.rarity * 100) / rarest));
    const asked = prompt.text.trim();
    return asked && asked.length <= MAX_PROMPT_LENGTH && answers.length >= 2 ? [{ text: asked, answers }] : [];
  });
  return {
    id,
    name: written.name.trim().slice(0, MAX_NAME_LENGTH).trim(),
    prompts: prompts.map((prompt, i) => ({ id: `prompt-${i + 1}`, ...prompt })),
  };
}

function freeId(name: string, taken: string[]): string {
  const slug = name.normalize("NFD").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30).replace(/^-|-$/g, "") || "pack";
  for (let n = 1; ; n++) {
    const id = n === 1 ? slug : `${slug}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** Returns why no pack was kept, or nothing when one was. */
export async function writePack(
  accountId: string,
  asked: Partial<WriteOrder> & { topic: string },
  progress?: (prompts: number) => void,
  signal?: AbortSignal,
  language: Language = "en",
): Promise<string[]> {
  const words = wordsIn(language);
  const order: WriteOrder = {
    topic: asked.topic.trim(),
    instructions: (asked.instructions ?? "").trim(),
    prompts: asked.prompts ?? WRITTEN_PROMPTS[0]!,
    search: asked.search === true,
  };
  if (!order.topic || order.topic.length > MAX_TOPIC_LENGTH) return [words.packs.badTopic(MAX_TOPIC_LENGTH)];
  if (order.instructions.length > MAX_INSTRUCTIONS_LENGTH) return [words.packs.badInstructions(MAX_INSTRUCTIONS_LENGTH)];
  if (!WRITTEN_PROMPTS.includes(order.prompts)) return [words.packs.badCount(WRITTEN_PROMPTS)];
  // Checked first, so that nobody pays for a pack that cannot be kept.
  const packs = await listPacks(accountId);
  if (packs.length >= MAX_PACKS) return [words.packs.tooMany(MAX_PACKS)];
  const apiKey = await loadKey(accountId, "anthropic");
  if (!apiKey) return [words.packs.keyNeeded];
  try {
    const written = await draft(apiKey, order, language, progress, signal);
    const pack = tidy(written, freeId(written.name, packs.map((pack) => pack.id)));
    const problems = await savePack(accountId, JSON.stringify(pack));
    if (problems.length) {
      console.error(`A pack written about "${order.topic}" was not valid:\n- ${problems.join("\n- ")}`);
      return [words.packs.unusable];
    }
    return [];
  } catch (error) {
    if (error instanceof Refused) return [error.message];
    throw error;
  }
}
