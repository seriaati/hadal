import app from "../web/index.html";
import type { BunRequest } from "bun";
import type { Config } from "../shared/types";
import { SESSION_DAYS, accountOf, signIn, signOut, signUp } from "./accounts";
import { migrate } from "./db";
import { buildIndex, judge, nearestAnswer, pickPrompts } from "./game";
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

const server = Bun.serve({
  development: !PRODUCTION,
  routes: {
    "/": app,
    "/api/config": {
      GET: () => Response.json({ devMode: DEV_MODE } satisfies Config),
    },
    "/api/game": {
      GET: () => Response.json({ prompts: pickPrompts(prompts, PROMPTS_PER_GAME) }),
    },
    "/api/answer": {
      POST: async (req) => {
        const { promptId, answer } = (await req.json()) as { promptId: string; answer: string };
        const verdict = judge(prompts, promptId, String(answer ?? ""));
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
    "/api/dev/answer": {
      GET: (req) => {
        if (!DEV_MODE) return new Response("Not found", { status: 404 });
        const query = new URL(req.url).searchParams;
        const answer = nearestAnswer(prompts, query.get("promptId") ?? "", Number(query.get("rarity")));
        return answer ? Response.json({ answer }) : new Response("Unknown prompt", { status: 404 });
      },
    },
  },
});

console.log(`hadal is running at ${server.url}`);
