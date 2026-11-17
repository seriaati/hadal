import app from "../web/index.html";
import type { BunRequest } from "bun";
import { MAX_PACK_BYTES, type Config } from "../shared/types";
import { SESSION_DAYS, accountIdOf, accountOf, signIn, signOut, signUp } from "./accounts";
import { listPacks, loadPack, removePack, savePack } from "./custom";
import { migrate } from "./db";
import { buildIndex, judge, nearestAnswer, pickPrompts, type PromptIndex } from "./game";
import { writePack } from "./generate";
import { removeKey, saveKey } from "./keys";
import { loadPacks } from "./packs";

const PROMPTS_PER_GAME = 10;
/**
 * Developer mode (HADAL_DEV_MODE=1) gives the game a menu of shortcuts, and adds an endpoint
 * that gives away pack answers. Never turn it on for an instance other people play on.
 */
const DEV_MODE = process.env.HADAL_DEV_MODE === "1";
const PRODUCTION = process.env.NODE_ENV === "production";
/** The cookie that holds a signed-in player's session token. */
const SESSION = "session";
/** Starts the prompt ids of a player's own pack. No built-in pack's id can hold a colon. */
const OWN = "own:";
const prompts = buildIndex(await loadPacks());
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

/** Answer with the signed-in account as it stands after a change to its API key, or say why the change was refused. */
async function key(req: BunRequest, change: (accountId: string) => Promise<string | null | void>) {
  const token = req.cookies.get(SESSION);
  const accountId = await accountIdOf(token);
  if (!accountId) return Response.json({ error: "Sign in first" }, { status: 401 });
  const error = await change(accountId);
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
      POST: async (req) => {
        const { promptId, answer } = (await req.json()) as { promptId: string; answer: string };
        const verdict = judge(await indexOf(req, String(promptId)), promptId, String(answer ?? ""));
        return verdict ? Response.json(verdict) : new Response("Unknown prompt", { status: 404 });
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
    "/api/account/key": {
      PUT: (req) => key(req, async (accountId) => saveKey(accountId, String(((await req.json()) as { key: string }).key ?? ""))),
      DELETE: (req) => key(req, removeKey),
    },
    "/api/packs": {
      GET: (req) => packs(req),
      POST: (req) => packs(req, async (accountId) => savePack(accountId, await req.text())),
    },
    "/api/packs/:id": {
      DELETE: (req) => packs(req, (accountId) => removePack(accountId, req.params.id)),
    },
    "/api/write": {
      POST: (req, server) => {
        // Writing a pack takes a minute or so, and Bun closes a request that is silent for ten seconds unless told otherwise.
        server.timeout(req, 0);
        return packs(req, async (accountId) => writePack(accountId, String(((await req.json()) as { topic: string }).topic ?? "")));
      },
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
});

console.log(`hadal is running at ${server.url}`);
