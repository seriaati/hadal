import app from "../web/index.html";
import type { BunRequest } from "bun";
import { MAX_PACK_BYTES, PROVIDERS, type Config, type Provider } from "../shared/types";
import { SESSION_DAYS, accountIdOf, accountOf, signIn, signOut, signUp } from "./accounts";
import { listPacks, loadPack, removePack, savePack } from "./custom";
import { migrate } from "./db";
import { OWN, buildIndex, judge, nearestAnswer, pickPrompts, type PromptIndex } from "./game";
import { writePack } from "./generate";
import { removeKey, saveKey } from "./keys";
import { judgeLive } from "./live";
import { loadPacks } from "./packs";
import { leave, receive, usePrompts, type Member } from "./rooms";

const PROMPTS_PER_GAME = 10;
/**
 * Developer mode (HADAL_DEV_MODE=1) gives the game a menu of shortcuts, and adds an endpoint
 * that gives away pack answers. Never turn it on for an instance other people play on.
 */
const DEV_MODE = process.env.HADAL_DEV_MODE === "1";
const PRODUCTION = process.env.NODE_ENV === "production";
/** The cookie that holds a signed-in player's session token. */
const SESSION = "session";
const prompts = buildIndex(await loadPacks());
usePrompts(prompts);
await migrate();

/** Sign up or sign in. The token goes into a cookie that scripts in the page cannot read. */
async function enter(req: BunRequest, entry: typeof signIn) {
  const { username, password } = (await req.json()) as { username: string; password: string };
  const result = await entry(String(username ?? ""), String(password ?? ""));
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  req.cookies.set(SESSION, result.token, {
    httpOnly: true, sameSite: "lax", secure: PRODUCTION, path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return Response.json(result.account);
}

/** The prompts of one of the signed-in player's own packs. Empty if there is no such pack, or nobody is signed in. */
async function ownIndex(req: BunRequest, packId: string): Promise<PromptIndex> {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  const pack = accountId && (await loadPack(accountId, packId));
  return pack ? buildIndex([pack], OWN) : new Map();
}

/** The prompts a prompt id is one of: the built-in ones, or those of the player's own pack it names. */
async function indexOf(req: BunRequest, promptId: string): Promise<PromptIndex> {
  return promptId.startsWith(OWN) ? ownIndex(req, promptId.slice(OWN.length).split("/")[0]!) : prompts;
}

/** Answer with the signed-in player's packs, after making `change` to them if there is one. */
async function packs(req: BunRequest, change?: (accountId: string) => Promise<string[] | void>) {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (!accountId) return Response.json({ problems: ["sign in first"] }, { status: 401 });
  const problems = (await change?.(accountId)) ?? [];
  if (problems.length) return Response.json({ problems }, { status: 400 });
  return Response.json(await listPacks(accountId));
}

/** Answer with the signed-in account as it stands after a change to one of its API keys, or say why the change was refused. */
async function key(req: BunRequest<"/api/account/key/:provider">, change: (accountId: string, provider: Provider) => Promise<string | null | void>) {
  const provider = PROVIDERS.find((known) => known === req.params.provider);
  if (!provider) return new Response("Unknown provider", { status: 404 });
  const token = req.cookies.get(SESSION);
  const accountId = await accountIdOf(token);
  if (!accountId) return Response.json({ error: "Sign in first" }, { status: 401 });
  const error = await change(accountId, provider);
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(await accountOf(token));
}

const server = Bun.serve({
  development: !PRODUCTION,
  // Nothing sent to the server is larger than a pack file.
  maxRequestBodySize: 2 * MAX_PACK_BYTES,
  routes: {
    "/": app,
    "/api/config": {
      GET: () => Response.json({ devMode: DEV_MODE } satisfies Config),
    },
    "/api/game": {
      // A dive draws from the built-in packs, or only from the player's own pack that `?pack=` names.
      GET: async (req) => {
        const pack = new URL(req.url).searchParams.get("pack");
        const index = pack === null ? prompts : await ownIndex(req, pack);
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
        // Not in the pack: the live judge may know it all the same.
        return Response.json(await judgeLive(index.get(promptId)!, String(answer ?? ""), await accountIdOf(req.cookies.get(SESSION))));
      },
    },
    "/api/account": {
      GET: async (req) => Response.json(await accountOf(req.cookies.get(SESSION))),
    },
    "/api/account/signup": { POST: (req) => enter(req, signUp) },
    "/api/account/signin": { POST: (req) => enter(req, signIn) },
    "/api/account/signout": {
      POST: async (req) => {
        const token = req.cookies.get(SESSION);
        if (token) await signOut(token);
        req.cookies.delete(SESSION);
        return new Response(null, { status: 204 });
      },
    },
    "/api/account/key/:provider": {
      PUT: (req) => key(req, async (accountId, provider) => saveKey(accountId, provider, String(((await req.json()) as { key: string }).key ?? ""))),
      DELETE: (req) => key(req, removeKey),
    },
    "/api/packs": {
      GET: (req) => packs(req),
      POST: (req) => packs(req, async (accountId) => savePack(accountId, await req.text())),
    },
    "/api/packs/:id": {
      // The pack as a file, to keep or to change and add again.
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
            const problems = accountId ? await writePack(accountId, topic, (prompts) => say({ prompts }), stop.signal) : ["sign in first"];
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
      if (server.upgrade(req, { data: { accountId, send() {} } })) return;
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
