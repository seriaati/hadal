import app from "../web/index.html";
import reviewPage from "../web/review/index.html";
import type { BunRequest, Server } from "bun";
import { LANGUAGES, LANGUAGE_COOKIE, isLanguage, wordsIn, type Language } from "../shared/language";
import { MAX_PACK_BYTES, PROVIDERS, type Config, type DailyDive, type Pack, type PackSummary, type Provider, type WriteOrder } from "../shared/types";
import type { Words } from "../shared/words/en";
import { SESSION_DAYS, accountIdOf, accountOf, isAdmin, signInFrom, signOut, signUp, type Entry } from "./accounts";
import { MAX_PACKS, listPacks, loadPack, removePack, savePack } from "./custom";
import { heard } from "./counts";
import { claim, dailyPrompts, dayOf, isDay, numberOf, record, standing, writtenPacks } from "./daily";
import { migrate } from "./db";
import { OWN, buildIndex, judge, nearestAnswer, pickPrompts, type PromptIndex } from "./game";
import { resumeWritings, run, stopWriting, writePack, writingOf } from "./generate";
import { removeKey, saveKey } from "./keys";
import { judgeLive } from "./live";
import { formatPack } from "./packs";
import { review, reviewList, saveReviewed } from "./review";
import { lost, receive, usePrompts, type Member } from "./rooms";
import { listSystemPacks, loadSystemPack, loadSystemPacks, saveSystemPack, seedSystemPacks } from "./system";
import { lastUpdate, saveSources, seedSources } from "./updates";
import { startWriting } from "./writer";

const PROMPTS_PER_GAME = 10;
/**
 * Developer mode (HADAL_DEV_MODE=1) gives the game a menu of shortcuts, adds an endpoint that
 * gives away pack answers, and a page that rewrites the built-in pack files (`/dev/review`).
 * Never turn it on for an instance other people play on.
 */
const DEV_MODE = process.env.HADAL_DEV_MODE === "1";
const PRODUCTION = process.env.NODE_ENV === "production";
/** The daily dive is offered with the instance's own Anthropic key, which writes its prompts, and always in developer mode. */
const DAILY = DEV_MODE || !!process.env.HADAL_DAILY_KEY;
const SESSION = "session";
/** A random id the browser keeps, so that a room's ban holds a guest without an account, and their daily dive counts once. */
const BROWSER = "browser";
const BROWSER_COOKIE = { httpOnly: true, sameSite: "lax", secure: PRODUCTION, path: "/", maxAge: 400 * 24 * 60 * 60 } as const;
/** A digest of the code the browser runs, so that a page still open from before a release can tell that it is out of date. */
async function versionOf(): Promise<string> {
  const root = `${import.meta.dir}/..`;
  const paths = (await Array.fromAsync(new Bun.Glob("{web,shared}/**/*").scan(root))).sort();
  const hasher = new Bun.CryptoHasher("sha256");
  for (const path of paths) hasher.update(path).update(await Bun.file(`${root}/${path}`).bytes());
  return hasher.digest("hex").slice(0, 12);
}
const VERSION = await versionOf();
let summaries: Record<Language, PackSummary[]>;
let packsIn: Record<Language, Pack[]>;
/**
 * A dive draws from the packs of the player's language; an answer is judged against every built-in prompt, and the
 * prompts written for daily dives that have not joined their packs yet.
 */
let promptsIn: Record<Language, PromptIndex>;
let prompts: PromptIndex;
/** Loads the built-in packs: at start-up, and again whenever one changes. */
async function useBuiltIn() {
  const builtIn = await loadSystemPacks();
  packsIn = builtIn;
  const inEach = <T>(make: (packs: Pack[]) => T) => Object.fromEntries(LANGUAGES.map((language) => [language, make(builtIn[language])])) as Record<Language, T>;
  summaries = inEach((packs): PackSummary[] => packs.map((pack) => ({ id: pack.id, name: pack.name, prompts: pack.prompts.length })));
  promptsIn = inEach(buildIndex);
  prompts = buildIndex([...Object.values(builtIn).flat(), ...(await writtenPacks(builtIn))]);
  usePrompts(builtIn);
}
await migrate();
const seeded = await seedSystemPacks();
if (seeded) console.log(`filled the empty database with the ${seeded} packs of packs/`);
const sourced = await seedSources();
if (sourced) console.log(`filled the empty database with the sources of ${sourced} prompts from curation/`);
await useBuiltIn();
startWriting(() => packsIn, useBuiltIn);
void resumeWritings();

function languageOf(req: BunRequest): Language {
  const language = req.cookies.get(LANGUAGE_COOKIE);
  return isLanguage(language) ? language : "en";
}

const wordsOf = (req: BunRequest) => wordsIn(languageOf(req));

/** httpOnly keeps the token out of reach of scripts in the page. */
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

/** Of the player's own packs, those named that they have. */
async function ownIndex(req: BunRequest, packIds: string[]): Promise<PromptIndex> {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (!accountId) return new Map();
  const ids = [...new Set(packIds)].slice(0, MAX_PACKS);
  const packs = await Promise.all(ids.map((id) => loadPack(accountId, id)));
  return buildIndex(packs.filter((pack) => pack !== null), OWN);
}

async function indexOf(req: BunRequest, promptId: string): Promise<PromptIndex> {
  return promptId.startsWith(OWN) ? ownIndex(req, [promptId.slice(OWN.length).split("/")[0]!]) : prompts;
}

async function packs(req: BunRequest, change?: (accountId: string) => Promise<string[] | void>) {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (!accountId) return Response.json({ problems: [wordsOf(req).packs.signInFirst] }, { status: 401 });
  const problems = (await change?.(accountId)) ?? [];
  if (problems.length) return Response.json({ problems }, { status: 400 });
  return Response.json(await listPacks(accountId));
}

/** Only an admin is answered, and anyone else is told there is nothing here. */
async function admin(req: BunRequest, answer: () => Promise<Response>) {
  return (await isAdmin(req.cookies.get(SESSION))) ? answer() : new Response("Not found", { status: 404 });
}

/** Who dives the daily: the account when signed in, or else the browser, which is given an id if it has none. */
async function dailyPlayer(req: BunRequest, answer: (player: string) => Promise<Response>) {
  if (!DAILY) return new Response("Not found", { status: 404 });
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (accountId) return answer(`a${accountId}`);
  let browser = req.cookies.get(BROWSER);
  if (!browser) {
    browser = crypto.randomUUID();
    req.cookies.set(BROWSER, browser, BROWSER_COOKIE);
  }
  return answer(`b${browser}`);
}

async function writing(req: BunRequest, answer: (accountId: string) => Promise<Response>) {
  const accountId = await accountIdOf(req.cookies.get(SESSION));
  if (!accountId) return Response.json({ problems: [wordsOf(req).packs.signInFirst] }, { status: 401 });
  return answer(accountId);
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
    "/api/skill": () =>
      new Response(Bun.file(`${import.meta.dir}/../../skills/write-hadal-pack/SKILL.md`), {
        headers: { "content-disposition": 'attachment; filename="SKILL.md"' },
      }),
    "/api/config": {
      GET: () => Response.json({ devMode: DEV_MODE, version: VERSION, daily: DAILY } satisfies Config, { headers: { "cache-control": "no-store" } }),
    },
    "/api/builtin": {
      GET: (req) => Response.json(summaries[languageOf(req)]),
    },
    "/api/game": {
      // Without `builtIn` or `own` (pack ids joined by commas) the dive draws from the built-in packs of the player's language.
      GET: async (req) => {
        const query = new URL(req.url).searchParams;
        const ids = (name: string) => query.get(name)?.split(",").filter(Boolean) ?? [];
        let index = promptsIn[languageOf(req)];
        if (query.has("builtIn") || query.has("own")) {
          const builtInIds = ids("builtIn");
          const built = [...prompts].filter(([id]) => builtInIds.includes(id.slice(0, id.indexOf("/"))));
          index = new Map([...built, ...(await ownIndex(req, ids("own")))]);
        }
        if (!index.size) return new Response("Unknown pack", { status: 404 });
        return Response.json({ prompts: pickPrompts(index, PROMPTS_PER_GAME) });
      },
    },
    // GET says how the player stands today; POST begins a daily dive, the first of the day claiming the scored one.
    "/api/daily": {
      GET: (req) => dailyPlayer(req, async (player) => Response.json(await standing(player))),
      POST: (req) =>
        dailyPlayer(req, async (player) => {
          const day = dayOf();
          const language = languageOf(req);
          const asked = await dailyPrompts(language, packsIn[language], prompts, day);
          if (!asked.length) return new Response("No daily dive today", { status: 404 });
          const scored = await claim(player, day);
          const { depth } = await standing(player, day);
          return Response.json({ day, number: numberOf(day), scored, depth, prompts: asked } satisfies DailyDive);
        }),
    },
    // The depth the scored dive of `day` reached; named by its day, since a dive begun before midnight may end after it.
    "/api/daily/:day": {
      PUT: (req) =>
        dailyPlayer(req, async (player) => {
          const { depth } = (await req.json()) as { depth: unknown };
          if (!isDay(req.params.day) || !Number.isInteger(depth) || (depth as number) < 0) return new Response("Bad depth", { status: 400 });
          await record(player, req.params.day, depth as number);
          return new Response(null, { status: 204 });
        }),
    },
    "/api/answer": {
      POST: async (req, server) => {
        // Two judges may be asked one after the other, and Bun closes a request that is silent for ten seconds.
        server.timeout(req, 20);
        const { promptId, answer } = (await req.json()) as { promptId: string; answer: string };
        const index = await indexOf(req, String(promptId));
        const typed = String(answer ?? "");
        let verdict = judge(index, promptId, typed);
        if (!verdict) return new Response("Unknown prompt", { status: 404 });
        if (verdict.answer === null) verdict = await judgeLive(index.get(promptId)!, typed, await accountIdOf(req.cookies.get(SESSION)));
        heard(promptId, typed, verdict);
        return Response.json(verdict);
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
    "/api/admin/packs": {
      GET: (req) => admin(req, async () => Response.json(await listSystemPacks())),
    },
    // An upload answers with every built-in pack as they now stand; with 409, the prompts it would remove unless `replace=1`.
    "/api/admin/packs/:language": {
      POST: (req) =>
        admin(req, async () => {
          const { language } = req.params;
          if (!isLanguage(language)) return new Response("Unknown language", { status: 404 });
          const file = await req.text();
          if (Buffer.byteLength(file) > MAX_PACK_BYTES) return Response.json({ problems: [wordsIn("en").packs.tooBig(MAX_PACK_BYTES / 1_000_000)] }, { status: 400 });
          let pack: unknown;
          try {
            pack = JSON.parse(file);
          } catch (error) {
            return Response.json({ problems: [wordsIn("en").packs.notJson((error as Error).message)] }, { status: 400 });
          }
          const saved = await saveSystemPack(language, pack, new URL(req.url).searchParams.get("replace") === "1");
          if ("problems" in saved) return Response.json(saved, { status: 400 });
          if ("removes" in saved) return Response.json(saved, { status: 409 });
          await useBuiltIn();
          return Response.json(await listSystemPacks());
        }),
    },
    "/api/admin/updates": {
      GET: (req) => admin(req, async () => Response.json(await lastUpdate())),
    },
    // A pack's sources file, named after its pack as in curation/: `<pack id>.sources.json`.
    "/api/admin/sources/:pack": {
      POST: (req) =>
        admin(req, async () => {
          const file = await req.text();
          if (Buffer.byteLength(file) > MAX_PACK_BYTES) return Response.json({ problems: [wordsIn("en").packs.tooBig(MAX_PACK_BYTES / 1_000_000)] }, { status: 400 });
          const problems = await saveSources(req.params.pack, file);
          return Response.json({ problems }, { status: problems.length ? 400 : 200 });
        }),
    },
    // Laid out as the pack files are, so the pack tools can work on a downloaded pack.
    "/api/admin/packs/:language/:id": {
      GET: (req) =>
        admin(req, async () => {
          const found = await loadSystemPack(req.params.id);
          if (found?.language !== req.params.language) return new Response("Unknown pack", { status: 404 });
          return new Response(formatPack(found.pack), {
            headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${found.pack.id}.json"` },
          });
        }),
    },
    // A pack is written in the background: POST begins it, GET says how it stands (null when there is none), DELETE stops it.
    "/api/write": {
      GET: (req) => writing(req, async (accountId) => Response.json(await writingOf(accountId))),
      POST: (req) =>
        writing(req, async (accountId) => {
          const asked = (await req.json()) as Partial<WriteOrder>;
          const order = { ...asked, topic: String(asked.topic ?? ""), instructions: String(asked.instructions ?? "") };
          const problems = await writePack(accountId, order, languageOf(req));
          if (problems.length) return Response.json({ problems });
          void run(accountId);
          return Response.json(await writingOf(accountId));
        }),
      DELETE: (req) =>
        writing(req, async (accountId) => {
          await stopWriting(accountId);
          return new Response(null, { status: 204 });
        }),
    },
    "/api/room": async (req, server) => {
      const accountId = await accountIdOf(req.cookies.get(SESSION));
      const known = req.cookies.get(BROWSER);
      const browser = known ?? crypto.randomUUID();
      const headers = known
        ? undefined
        : { "Set-Cookie": new Bun.Cookie(BROWSER, browser, BROWSER_COOKIE).serialize() };
      if (server.upgrade(req, { headers, data: { accountId, browser, language: languageOf(req), send() {} } })) return;
      return new Response("Expected a WebSocket", { status: 400 });
    },
    "/dev/review": DEV_MODE ? reviewPage : () => new Response("Not found", { status: 404 }),
    "/api/dev/review": {
      GET: async () => (DEV_MODE ? Response.json(await reviewList()) : new Response("Not found", { status: 404 })),
    },
    "/api/dev/review/:language/:id": {
      GET: async (req) => {
        const reviewed = DEV_MODE ? await review(req.params.language, req.params.id) : null;
        return reviewed ? Response.json(reviewed) : new Response("Not found", { status: 404 });
      },
      PUT: async (req) => {
        const problems = DEV_MODE ? await saveReviewed(req.params.language, req.params.id, await req.json()) : null;
        if (!problems) return new Response("Not found", { status: 404 });
        if (!problems.length) await useBuiltIn();
        return Response.json({ problems }, { status: problems.length ? 400 : 200 });
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
  websocket: {
    data: {} as Member,
    // A message about a room is a few lines of JSON.
    maxPayloadLength: 4096,
    // Cloudflare closes a connection that is quiet for about 100 seconds. Bun pings a quiet one at 0.6 of this, which keeps it open.
    idleTimeout: 60,
    open(ws) {
      ws.data.send = (message) => ws.send(JSON.stringify(message));
    },
    // An error left uncaught here (the database out of reach) would stop the server, and every room with it.
    message: (ws, text) => receive(ws.data, String(text)).catch((error) => console.error(error)),
    close: (ws, code) => lost(ws.data, code),
  },
});

console.log(`hadal is running at ${server.url}`);

/**
 * Cloudflare keeps a copy of the page at its edge, so each release clears it there: the page names the code files of its
 * own release, and the last release's files are gone.
 */
async function clearCachedPage() {
  const { CLOUDFLARE_ZONE_ID: zone, CLOUDFLARE_PURGE_TOKEN: token, HADAL_URL: page } = process.env;
  if (!zone || !token || !page) return;
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files: [new URL("/", page).href] }),
  }).catch((error: Error) => error);
  if (res instanceof Response && res.ok) console.log("cleared the page from Cloudflare's cache");
  else console.error(`could not clear the page from Cloudflare's cache: ${res instanceof Response ? res.status : res.name}`);
}
void clearCachedPage();
// Dokploy stops the old server only once this one runs, and in those seconds the old one can put its page back in the
// cache, as the first release that cleared it showed. So the page is cleared again when the old server is surely gone.
setTimeout(() => void clearCachedPage(), 60_000);
