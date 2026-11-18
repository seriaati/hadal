import app from "../web/index.html";
import type { BunRequest, Server } from "bun";
import { LANGUAGES, LANGUAGE_COOKIE, isLanguage, wordsIn, type Language } from "../shared/language";
import { MAX_PACK_BYTES, PROVIDERS, type Config, type Pack, type PackSummary, type Provider } from "../shared/types";
import type { Words } from "../shared/words/en";
import { SESSION_DAYS, accountIdOf, accountOf, signInFrom, signOut, signUp, type Entry } from "./accounts";
import { listPacks, loadPack, removePack, savePack } from "./custom";
import { migrate } from "./db";
import { OWN, buildIndex, judge, nearestAnswer, pickPrompts, type PromptIndex } from "./game";
import { writePack } from "./generate";
import { removeKey, saveKey } from "./keys";
import { judgeLive } from "./live";
import { loadBuiltIn } from "./packs";
import { leave, receive, usePrompts, type Member } from "./rooms";

const PROMPTS_PER_GAME = 10;
/**
 * Developer mode (HADAL_DEV_MODE=1) gives the game a menu of shortcuts, and adds an endpoint
 * that gives away pack answers. Never turn it on for an instance other people play on.
 */
const DEV_MODE = process.env.HADAL_DEV_MODE === "1";
const PRODUCTION = process.env.NODE_ENV === "production";
const SESSION = "session";
const builtIn = await loadBuiltIn();
const inEach = <T>(make: (packs: Pack[]) => T) => Object.fromEntries(LANGUAGES.map((language) => [language, make(builtIn[language])])) as Record<Language, T>;
const summaries = inEach((packs): PackSummary[] => packs.map((pack) => ({ id: pack.id, name: pack.name, prompts: pack.prompts.length })));
/** A dive draws from the packs of the player's language; an answer is judged against every built-in prompt. */
const promptsIn = inEach(buildIndex);
const prompts = buildIndex(Object.values(builtIn).flat());
usePrompts(builtIn);
await migrate();

/** The language the player plays in, which the browser keeps in a cookie. */
function languageOf(req: BunRequest): Language {
  const language = req.cookies.get(LANGUAGE_COOKIE);
  return isLanguage(language) ? language : "en";
}

const wordsOf = (req: BunRequest) => wordsIn(languageOf(req));

/** Sign up or sign in. httpOnly keeps the token out of reach of scripts in the page. */
async function enter(req: BunRequest, entry: (username: string, password: string, words: Words) => Promise<Entry>) {
  const { username, password } = (await req.json()) as { username: string; password: string };
  const result = await entry(String(username ?? ""), String(password ?? ""), wordsOf(req));
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  req.cookies.set(SESSION, result.token, {
    httpOnly: true, sameSite: "lax", secure: PRODUCTION, path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return Response.json(result.account);
}

/**
 * The player's address. The production instance sits behind Cloudflare, which names the player in
 * CF-Connecting-IP; without that header, the server is reached directly.
 */
function addressOf(req: Request, server: Server<Member>) {
  return req.headers.get("cf-connecting-ip") ?? server.requestIP(req)?.address ?? "";
}

async function ownIndex(req: BunRequest, packId: string): Promise<PromptIndex> {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  const pack = accountId && (await loadPack(accountId, packId));
  return pack ? buildIndex([pack], OWN) : new Map();
}

async function indexOf(req: BunRequest, promptId: string): Promise<PromptIndex> {
  return promptId.startsWith(OWN) ? ownIndex(req, promptId.slice(OWN.length).split("/")[0]!) : prompts;
}

async function packs(req: BunRequest, change?: (accountId: string) => Promise<string[] | void>) {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (!accountId) return Response.json({ problems: [wordsOf(req).packs.signInFirst] }, { status: 401 });
  const problems = (await change?.(accountId)) ?? [];
  if (problems.length) return Response.json({ problems }, { status: 400 });
  return Response.json(await listPacks(accountId));
}

async function key(req: BunRequest<"/api/account/key/:provider">, change: (accountId: string, provider: Provider, words: Words) => Promise<string | null | void>) {
  const provider = PROVIDERS.find((known) => known === req.params.provider);
  if (!provider) return new Response("Unknown provider", { status: 404 });
  const token = req.cookies.get(SESSION);
  const accountId = await accountIdOf(token);
  if (!accountId) return Response.json({ error: wordsOf(req).account.signInFirst }, { status: 401 });
  const error = await change(accountId, provider, wordsOf(req));
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(await accountOf(token));
}

const server = Bun.serve({
  development: !PRODUCTION,
  // Nothing sent to the server is larger than a pack file.
  maxRequestBodySize: 2 * MAX_PACK_BYTES,
  routes: {
    "/": app,
    // The link preview, at an address that does not change, as the page's og:image names it.
    "/og-2.png": () => new Response(Bun.file(`${import.meta.dir}/../web/og-2.png`)),
    "/api/config": {
      GET: () => Response.json({ devMode: DEV_MODE } satisfies Config),
    },
    "/api/builtin": {
      GET: (req) => Response.json(summaries[languageOf(req)]),
    },
    "/api/game": {
      GET: async (req) => {
        const pack = new URL(req.url).searchParams.get("pack");
        const index = pack === null ? promptsIn[languageOf(req)] : await ownIndex(req, pack);
        if (!index.size) return new Response("Unknown pack", { status: 404 });
        return Response.json({ prompts: pickPrompts(index, PROMPTS_PER_GAME) });
      },
    },
    "/api/answer": {
      POST: async (req, server) => {
        // Two judges may be asked one after the other, and Bun closes a request that is silent for ten seconds.
        server.timeout(req, 20);
        const { promptId, answer } = (await req.json()) as { promptId: string; answer: string };
        const index = await indexOf(req, String(promptId));
        const verdict = judge(index, promptId, String(answer ?? ""));
        if (!verdict) return new Response("Unknown prompt", { status: 404 });
        if (verdict.answer !== null) return Response.json(verdict);
        return Response.json(await judgeLive(index.get(promptId)!, String(answer ?? ""), await accountIdOf(req.cookies.get(SESSION))));
      },
    },
    "/api/account": {
      GET: async (req) => Response.json(await accountOf(req.cookies.get(SESSION))),
    },
    "/api/account/signup": { POST: (req) => enter(req, signUp) },
    "/api/account/signin": {
      POST: (req, server) => enter(req, (username, password, words) => signInFrom(addressOf(req, server), username, password, words)),
    },
    "/api/account/signout": {
      POST: async (req) => {
        const token = req.cookies.get(SESSION);
        if (token) await signOut(token);
        req.cookies.delete(SESSION);
        return new Response(null, { status: 204 });
      },
    },
    "/api/account/key/:provider": {
      PUT: (req) => key(req, async (accountId, provider, words) => saveKey(accountId, provider, String(((await req.json()) as { key: string }).key ?? ""), words)),
      DELETE: (req) => key(req, removeKey),
    },
    "/api/packs": {
      GET: (req) => packs(req),
      POST: (req) => packs(req, async (accountId) => savePack(accountId, await req.text(), wordsOf(req))),
    },
    "/api/packs/:id": {
      GET: async (req) => {
        const accountId = await accountIdOf(req.cookies.get(SESSION));
        const pack = accountId && (await loadPack(accountId, req.params.id));
        if (!pack) return new Response("Unknown pack", { status: 404 });
        return new Response(JSON.stringify(pack, null, 2), {
          headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${pack.id}.json"` },
        });
      },
      DELETE: (req) => packs(req, (accountId) => removePack(accountId, req.params.id)),
    },
    "/api/write": {
      // The answer is a line of JSON at a time: `{"prompts": n}` each time another prompt is written, then the
      // player's packs (`{"packs": [...]}`) or why none was written (`{"problems": [...]}`).
      POST: async (req, server) => {
        // Writing a pack takes a minute or so, and Bun closes a request that is silent for ten seconds unless told otherwise.
        server.timeout(req, 0);
        const accountId = await accountIdOf(req.cookies.get(SESSION));
        const topic = String(((await req.json()) as { topic: string }).topic ?? "");
        // If the player stops the writing, or leaves, the request to Anthropic is ended too.
        const stop = new AbortController();
        req.signal.addEventListener("abort", () => stop.abort());
        const encoder = new TextEncoder();
        const lines = new ReadableStream({
          async start(controller) {
            const say = (line: object) => {
              if (!stop.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
            };
            const problems = accountId
              ? await writePack(accountId, topic, (prompts) => say({ prompts }), stop.signal, languageOf(req))
              : [wordsOf(req).packs.signInFirst];
            say(problems.length || !accountId ? { problems } : { packs: await listPacks(accountId) });
            if (!stop.signal.aborted) controller.close();
          },
          cancel: () => stop.abort(),
        });
        return new Response(lines, { headers: { "content-type": "application/x-ndjson" } });
      },
    },
    "/api/room": async (req, server) => {
      const accountId = await accountIdOf(req.cookies.get(SESSION));
      if (server.upgrade(req, { data: { accountId, language: languageOf(req), send() {} } })) return;
      return new Response("Expected a WebSocket", { status: 400 });
    },
    "/api/dev/answer": {
      GET: async (req) => {
        if (!DEV_MODE) return new Response("Not found", { status: 404 });
        const query = new URL(req.url).searchParams;
        const promptId = query.get("promptId") ?? "";
        const answer = nearestAnswer(await indexOf(req, promptId), promptId, Number(query.get("rarity")));
        return answer ? Response.json({ answer }) : new Response("Unknown prompt", { status: 404 });
      },
    },
  },
  websocket: {
    data: {} as Member,
    // A message about a room is a few lines of JSON.
    maxPayloadLength: 4096,
    open(ws) {
      ws.data.send = (message) => ws.send(JSON.stringify(message));
    },
    message: (ws, text) => receive(ws.data, String(text)),
    close: (ws) => leave(ws.data),
  },
});

console.log(`hadal is running at ${server.url}`);
