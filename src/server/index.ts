import app from "../web/index.html";
import { buildIndex, judge, loadPacks, pickPrompts } from "./game";

const PROMPTS_PER_GAME = 10;
const prompts = buildIndex(await loadPacks());

const server = Bun.serve({
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": app,
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
  },
});

console.log(`hadal is running at ${server.url}`);
