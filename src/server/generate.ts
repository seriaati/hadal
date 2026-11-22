import Anthropic from "@anthropic-ai/sdk";
import { FETCHES_PER_REQUEST, MAX_FETCHED_TOKENS, SEARCHES_PER_REQUEST, dollars, type Used } from "../shared/cost";
import { LANGUAGE_NAMES, isLanguage, wordsIn, type Language } from "../shared/language";
import { MAX_ANSWER_LENGTH, MAX_INSTRUCTIONS_LENGTH, MAX_TOPIC_LENGTH, TIERS, WRITTEN_PROMPTS, type Answer, type Pack, type Tier, type Writing, type WriteOrder } from "../shared/types";
import { MAX_PACKS, listPacks, savePack } from "./custom";
import { sql } from "./db";
import { normalize } from "./game";
import { loadKey } from "./keys";
import { MAX_NAME_LENGTH, MAX_PROMPT_LENGTH } from "./packs";

const MODEL = "claude-opus-5-5";
/** Prompts written at the same time: quicker, while staying near the rate limits of a new API key. */
const AT_ONCE = 2;
/** Nobody waits on a request, so one the API turns away for now is tried again, after the wait it asks for. */
const RETRIES = 8;

const GAME = `You write trivia packs for Hadal, a deep-sea diving game.

How the game works: the player is shown a prompt such as "Name a country that borders Germany" and types one answer. A correct answer scores by its tier: the answers few players think of take the diver deepest. An answer that is not listed counts as wrong, so a list with gaps punishes exactly the well-informed players the game is meant to reward.`;

const PLAN = `${GAME}

A pack is written in two steps, and this is the first: its name and its prompts. Each prompt's answers are written afterwards, one prompt at a time, so write no answers now.

Write the plan on the topic the player gives, with as many prompts as they ask for, in the language the player plays the game in. The player may add instructions of their own; follow them, except where they would break the rules below.

Prompts
- Each asks for one item of a well-defined set and can be judged as plainly right or wrong: "Name a moon of Jupiter", not "Name a good film". The best sets are a familiar set cut by a property ("Name a country whose flag has a star"), a set some authority lists in full (an award's winners, an official register), or a large set closed by a stated cut-off. Avoid sets that rest on judgement and "Name something used to…": their lists can never be complete.
- Each is widely known: an ordinary adult who is no specialist or fan can name two or three answers. "Name a dog breed", not "Name a Uralic language" or "Name a Kanto Gym Leader".
- Each has at least 8 correct answers, and there is no upper limit: a set of hundreds or thousands is welcome, as long as every member can be listed and checked. Up to six divers answer the same prompt in a room, and an answer once given is taken.
- A player can tell where its set ends. Where that would be unclear, the prompt says it, as in "Name a fish (living species)".
- Its answers clearly differ in how well known they are, so their tiers are plain. Avoid sets whose members are all about as well known as each other, such as the signs of the zodiac.
- Its rare answers are ones a player could reason their way to, not only ones nobody could think of.
- Its set stays put, unless the player asks otherwise. Avoid sets that change within a few years, such as current team rosters or the latest winners of a yearly award, and list nothing not yet released or not yet happened.
- It suits the people who play in the pack's language. A pack in English does not ask about works that English speakers seldom know, such as the characters of the classic Chinese novels; a pack in Chinese may.
- No two prompts ask for nearly the same set.
- The prompts cover different corners of the topic, and mix easier sets with harder ones.
- A prompt is at most ${MAX_PROMPT_LENGTH} characters.

Name
- The pack's name says plainly what the pack is about, the way a player would put it: "Programming", "Rivers of Europe". At most ${MAX_NAME_LENGTH} characters.
- Leave the sea and the game out of it: no "Depths", "Abyss", "Dive" or other wordplay.`;

const ANSWERS = `${GAME}

You write the answers to one prompt of a pack, in the language of the pack. The player who asked for the pack may have added instructions of their own; follow them, except where they would break the rules below.

- List every correct answer, not a selection: for a large set, that may be hundreds or thousands. Check each one: a wrong answer in the list is worse than a missing one.
- "text" is the usual way to write the answer. "aliases" are other names or spellings a player might type for the same thing ("Holland" for "Netherlands", "JFK" for "John F. Kennedy"); leave the list empty when there are none. The game already ignores capitals, accents, punctuation, spaces and a leading "the", and forgives small typos, so do not list such variants.
- Every text and alias is at most ${MAX_ANSWER_LENGTH} characters, and none appears twice.
- "tier" is how likely a typical player is to give this answer: "common" is what nearly everyone says first, "familiar" what most players would think of, "uncommon" what some would, and "rare" what few would. Few answers are common; in a long list, most are rare.
- Give "gem" to the rarest answers that are a pleasure to land on: ones a player could reason their way to and would know at once to be right, not merely the most obscure. Every prompt has at least one gem, and seldom more than three.`;

const SEARCH = `

You can search the web and read the pages you find. Use it for what may have changed since you were trained (this season's teams, recent releases, who holds an office now), to check answers you are unsure of, and to read a long list from a source you trust (a Wikipedia list, an official register) rather than recall it from memory. Do not use it for what you know well.`;

const text = { type: "string" };
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "prompts"],
  properties: { name: text, prompts: { type: "array", items: text } },
};
const ANSWERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "aliases", "tier"],
        properties: { text, aliases: { type: "array", items: text }, tier: { type: "string", enum: Object.keys(TIERS) } },
      },
    },
  },
};

type Plan = { name: string; prompts: string[] };
type Written = { text: string; aliases: string[]; tier: Tier };
/** A pack as the model writes it: no ids yet, and none of the pack format's limits checked. */
type Draft = { name: string; prompts: { text: string; answers: Written[] }[] };

/**
 * Thrown with words for the player. A `lasting` failure (the key, the account, the connection)
 * ends the whole writing; any other is about one request, and only that prompt is left out.
 */
class Refused extends Error {
  constructor(
    message: string,
    readonly lasting: boolean,
  ) {
    super(message);
  }
}

/** One request to Claude, whose answer is JSON of `schema`. `spend` hears what each answer used of the key. */
async function ask<T>(
  apiKey: string,
  system: string,
  content: string,
  schema: Record<string, unknown>,
  search: boolean,
  language: Language,
  signal: AbortSignal,
  spend: (used: Used) => Promise<unknown>,
): Promise<T> {
  const words = wordsIn(language).packs;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  let message: Anthropic.Beta.BetaMessage;
  try {
    for (;;) {
      // Streamed, because an answer takes minutes: a connection that carries nothing for that long may be dropped.
      message = await new Anthropic({ apiKey, maxRetries: RETRIES }).beta.messages
        .stream(
          {
            model: MODEL,
            max_tokens: 128000,
            // If the model declines on policy grounds, Anthropic tries again on the model it recommends instead.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: { effort: "high", format: { type: "json_schema", schema } },
            system: search ? system + SEARCH : system,
            tools: search
              ? [
                  { type: "web_search_20260318", name: "web_search", max_uses: SEARCHES_PER_REQUEST, response_inclusion: "excluded" },
                  { type: "web_fetch_20260318", name: "web_fetch", max_uses: FETCHES_PER_REQUEST, max_content_tokens: MAX_FETCHED_TOKENS, response_inclusion: "excluded" },
                ]
              : undefined,
            messages,
          },
          { signal },
        )
        .finalMessage();
      const { usage } = message;
      await spend({
        input: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
        output: usage.output_tokens,
        searches: usage.server_tool_use?.web_search_requests ?? 0,
      });
      // A long run of searches is paused by Anthropic, and goes on when what was said so far is sent back.
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) throw new Refused(words.stopped, true);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new Refused(words.keyRefused, true);
    if (error instanceof Anthropic.RateLimitError) throw new Refused(words.rateLimit, true);
    if (error instanceof Anthropic.APIConnectionError) throw new Refused(words.unreachable, true);
    if (error instanceof Anthropic.APIError) {
      if (error.type === "billing_error") throw new Refused(words.noCredit, true);
      throw new Refused(words.apiError(error.status), true);
    }
    throw error;
  }
  if (message.stop_reason === "refusal") throw new Refused(words.declined, false);
  if (message.stop_reason === "max_tokens") throw new Refused(words.tooLong, false);
  // The answer is the text after the last search: what Claude says before a search is not part of it.
  const searched = message.content.findLastIndex((block) => block.type !== "text" && block.type !== "thinking");
  const written = message.content
    .slice(searched + 1)
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  try {
    return JSON.parse(written) as T;
  } catch {
    throw new Refused(words.unusable, false);
  }
}

function asked(order: WriteOrder, language: Language): string {
  const lines = [`Topic: ${order.topic}`, `Language: ${LANGUAGE_NAMES[language]}`];
  if (order.instructions) lines.push(`Instructions from the player: ${order.instructions}`);
  return lines.join("\n");
}

/**
 * Make a draft into a pack that passes `validatePack`. The schema the model writes to fixes
 * the shape but not the limits, so whatever breaks one is dropped (a spelling that is too long
 * or given twice, a prompt left with fewer than two answers), and a prompt without a gem gets
 * one: the last answer of its rarest tier.
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
      return [{ text: spelling, ...(aliases.length > 0 && { aliases }), tier: answer.tier }];
    });
    const rarest = Math.max(...answers.map((answer) => TIERS[answer.tier]));
    const gem = answers.findLast((answer) => TIERS[answer.tier] === rarest);
    if (gem) gem.tier = "gem";
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

/**
 * The writings under way in this process, by account, to stop one or keep it from running twice.
 * Kept on `globalThis` because `bun --hot` runs this module afresh on every change, and the
 * writings it had begun go on: a second run would pay for every prompt twice.
 */
const running: Map<string, AbortController> = ((globalThis as { hadalWritings?: Map<string, AbortController> }).hadalWritings ??= new Map());

/** Returns why the writing could not begin; when it can, `run` writes the pack. */
export async function writePack(accountId: string, asked: Partial<WriteOrder> & { topic: string }, language: Language = "en"): Promise<string[]> {
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
  if ((await listPacks(accountId)).length >= MAX_PACKS) return [words.packs.tooMany(MAX_PACKS)];
  if (!(await loadKey(accountId, "anthropic"))) return [words.packs.keyNeeded];
  // A writing that failed has been told by now, or is replaced unread.
  const [begun] = await sql`
    insert into writings (account_id, language, request) values (${accountId}, ${language}, ${order})
    on conflict (account_id) do update set language = excluded.language, request = excluded.request, plan = null, answers = '{}', failed = null
      where writings.failed is not null
    returning account_id`;
  return begun ? [] : [words.packs.stillWriting];
}

/** How a player's writing stands, or null when there is none. A failure is told once, then forgotten. */
export async function writingOf(accountId: string): Promise<Writing | null> {
  const [row] = await sql`
    select request->>'topic' as topic, coalesce(jsonb_array_length(plan->'prompts'), (request->>'prompts')::int) as of,
      (select count(*)::int from jsonb_object_keys(answers)) as done, input_tokens::int as input, output_tokens::int as output, searches, failed
    from writings where account_id = ${accountId}`;
  if (!row) return null;
  if (row.failed) await sql`delete from writings where account_id = ${accountId} and failed is not null`;
  return { topic: row.topic, done: row.done, of: row.of, spent: dollars(row), ...(row.failed && { failed: row.failed }) };
}

export async function stopWriting(accountId: string) {
  running.get(accountId)?.abort();
  await sql`delete from writings where account_id = ${accountId}`;
}

/**
 * Writes the pack an account asked for, from where its writing stands: the plan first, then the
 * prompts still without answers. Never throws: what goes wrong is kept for the player.
 */
export async function run(accountId: string): Promise<void> {
  if (running.has(accountId)) return;
  const stop = new AbortController();
  running.set(accountId, stop);
  try {
    const [row] = await sql`select language, request, plan, answers from writings where account_id = ${accountId} and failed is null`;
    if (!row) return;
    const language: Language = isLanguage(row.language) ? row.language : "en";
    const words = wordsIn(language).packs;
    const order = row.request as WriteOrder;
    const fail = (why: string) => sql`update writings set failed = ${why} where account_id = ${accountId}`;
    const spend = (used: Used) => sql`
      update writings set input_tokens = input_tokens + ${used.input}, output_tokens = output_tokens + ${used.output}, searches = searches + ${used.searches}
      where account_id = ${accountId}`;
    try {
      const apiKey = await loadKey(accountId, "anthropic");
      if (!apiKey) return void (await fail(words.keyNeeded));
      let plan = row.plan as Plan | null;
      if (!plan) {
        plan = await ask<Plan>(apiKey, PLAN, `${asked(order, language)}\nPrompts: ${order.prompts}`, PLAN_SCHEMA, order.search, language, stop.signal, spend);
        if (!plan.prompts.length) return void (await fail(words.unusable));
        await sql`update writings set plan = ${plan} where account_id = ${accountId}`;
      }
      const answers = row.answers as Record<string, Written[] | null>;
      const left = plan.prompts.map((_, i) => i).filter((i) => !(i in answers));
      const writeNext = async (): Promise<void> => {
        const i = left.shift();
        if (i === undefined) return;
        let written: Written[] | null;
        try {
          const content = `${asked(order, language)}\nPrompt: ${plan.prompts[i]}`;
          written = (await ask<{ answers: Written[] }>(apiKey, ANSWERS, content, ANSWERS_SCHEMA, order.search, language, stop.signal, spend)).answers;
        } catch (error) {
          if (error instanceof Refused && !error.lasting) written = null;
          else {
            left.length = 0;
            throw error;
          }
        }
        answers[i] = written;
        await sql`update writings set answers = answers || ${{ [i]: written }}::jsonb where account_id = ${accountId}`;
        return writeNext();
      };
      // Every request is over before the writing is: a late one must not write into the next.
      const failure = (await Promise.allSettled(Array.from({ length: AT_ONCE }, writeNext))).find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
      const draft: Draft = {
        name: plan.name,
        prompts: plan.prompts.flatMap((text, i) => (answers[i] ? [{ text, answers: answers[i] }] : [])),
      };
      const pack = tidy(draft, freeId(plan.name, (await listPacks(accountId)).map((pack) => pack.id)));
      if (!pack.prompts.length) return void (await fail(words.unusable));
      const problems = await savePack(accountId, JSON.stringify(pack), wordsIn(language));
      if (problems.length) return void (await fail(problems[0]!));
      await sql`delete from writings where account_id = ${accountId}`;
    } catch (error) {
      // A stopped writing's row is gone already.
      if (stop.signal.aborted) return;
      if (!(error instanceof Refused)) console.error(`A pack about "${order.topic}" could not be written:`, error);
      await fail(error instanceof Refused ? error.message : words.unusable);
    }
  } finally {
    running.delete(accountId);
    // The player may have asked for another pack while this one was being stopped.
    if (stop.signal.aborted) void run(accountId);
  }
}

/** For a server that has just started: every writing goes on from where it stood. */
export async function resumeWritings() {
  const rows = await sql`select account_id from writings where failed is null`;
  for (const row of rows) void run(String(row.account_id));
}
