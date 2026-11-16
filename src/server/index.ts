import app from "../web/index.html";
import type { Config } from "../shared/types";
import { buildIndex, judge, nearestAnswer, pickPrompts } from "./game";
import { loadPacks } from "./packs";

const PROMPTS_PER_GAME = 10;
/**
 * Developer mode (HADAL_DEV_MODE=1) gives the game a menu of shortcuts, and adds an endpoint
 * that gives away pack answers. Never turn it on for an instance other people play on.
 */
const DEV_MODE = process.env.HADAL_DEV_MODE === "1";
const prompts = buildIndex(await loadPacks());

const server = Bun.serve({
  development: process.env.NODE_ENV !== "production",
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
