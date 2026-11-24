import { afterAll, expect, test } from "bun:test";
import type { Entry } from "../../tools/sources";
import type { Pack } from "../shared/types";
import { migrate, sql } from "./db";
import { saveSystemPack } from "./system";
import { apply, saveSources } from "./updates";

// These tests need the database (`docker compose up -d db`). Their packs and sources are removed afterwards.
await migrate();
const stem = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const ids = [stem, `zh-${stem}`, `tw-${stem}`];

afterAll(async () => {
  await sql`delete from system_packs where id in ${sql(ids)}`;
  await sql`delete from system_pack_versions where id in ${sql(ids)}`;
  await sql`delete from prompt_sources where pack in ${sql(ids)}`;
});

const pack = (id: string, text = "Name a Best Picture winner (to 2025)"): Pack => ({
  id,
  name: "Film",
  prompts: [{ id: "best-picture", text, answers: [{ text: "Titanic", tier: "common" }, { text: "Anora", aliases: ["Anora (film)"], tier: "gem" }] }],
});
const asking = [
  { language: "en" as const, pack: pack(stem) },
  { language: "zh-CN" as const, pack: pack(`zh-${stem}`, "说出一部奥斯卡最佳影片（至2025年）") },
];
const entry: Entry = { kind: "cutoff", until: 2025, sources: [{ lang: "en", page: "Academy Award for Best Picture", table: 1, column: "Film" }] };
const row = { pack: stem, prompt: "best-picture", entry, seen: {} };
const none = { en: [], zhCN: [], zhTW: [] };
const blank = { en: "", zhCN: "", zhTW: "" };

test("an update adds only new spellings, never a new gem, to every pack that asks the prompt", async () => {
  const done = await apply(
    {
      add: { en: [{ text: "Oppenheimer", aliases: [], tier: "gem" }, { text: "titanic", aliases: [], tier: "rare" }], zhCN: [{ text: "奥本海默", aliases: ["Oppenheimer"], tier: "rare" }], zhTW: [] },
      until: 0,
      texts: blank,
      sources: [],
      skipped: [{ value: "Wicked", why: "not a winner" }],
    },
    row,
    asking,
    2026,
  );
  if (Array.isArray(done)) throw new Error(done.join("; "));
  expect(done.packs[0]!.pack.prompts[0]!.answers.at(-1)).toEqual({ text: "Oppenheimer", tier: "rare" });
  expect(done.packs[0]!.pack.prompts[0]!.answers).toHaveLength(3);
  expect(done.packs[1]!.pack.prompts[0]!.answers.at(-1)).toEqual({ text: "奥本海默", aliases: ["Oppenheimer"], tier: "rare" });
  expect(done.updated).toMatchObject({ added: ["Oppenheimer"], until: null, mended: false, skipped: ["Wicked: not a winner"] });
  expect(done.entry).toEqual(entry);
});

test("an answer a Chinese pack gains under its English name is refused when Wikidata has a Chinese name for it", async () => {
  const names = (async (list: string[]) =>
    new Map(list.map((name) => [name, { article: undefined, redirects: [], en: name, zhCN: name === "Oppenheimer" ? "奥本海默" : null, zhTW: null }]))) as unknown as Parameters<typeof apply>[4];
  const english = (text: string) => ({ add: { ...none, zhCN: [{ text, aliases: [], tier: "rare" as const }] }, until: 0, texts: blank, sources: [], skipped: [] });
  expect(await apply(english("Oppenheimer"), row, asking, 2026, names)).toEqual([
    'zh-CN: "Oppenheimer" has the Chinese name 奥本海默 on Wikidata: give it under that name, with "Oppenheimer" among its aliases',
  ]);
  expect(Array.isArray(await apply(english("Tobo"), row, asking, 2026, names))).toBe(false);
});

test("a cut-off moves only forward, to no later than this year, with the prompt's new text in every pack", async () => {
  const moved = (until: number, texts = { en: "Name a Best Picture winner (to 2026)", zhCN: "说出一部奥斯卡最佳影片（至2026年）", zhTW: "" }) =>
    apply({ add: none, until, texts, sources: [], skipped: [] }, row, asking, 2026);
  const done = await moved(2026);
  if (Array.isArray(done)) throw new Error(done.join("; "));
  expect(done.entry.until).toBe(2026);
  expect(done.packs.map(({ pack: one }) => one.prompts[0]!.text)).toEqual(["Name a Best Picture winner (to 2026)", "说出一部奥斯卡最佳影片（至2026年）"]);
  expect(done.updated.until).toEqual([2025, 2026]);
  expect(await moved(2027)).toEqual(["until: a new cut-off must be after 2025 and no later than 2026"]);
  expect(await moved(2026, { ...blank, en: "Name a Best Picture winner (to 2026)" })).toEqual(["zh-CN: give the prompt's text with the new cut-off year"]);
});

test("a sources file replaces its pack's entries, once every entry is sound and asked by a pack", async () => {
  for (const [language, id] of [["en", ids[0]], ["zh-CN", ids[1]], ["zh-TW", ids[2]]] as const) await saveSystemPack(language, pack(id!), false);
  await sql`insert into prompt_sources (pack, prompt, entry, seen) values (${stem}, 'best-picture', ${entry}, ${{ "en:Academy Award for Best Picture#1/Film": ["Titanic"] }})`;

  expect(await saveSources(stem, "{oops")).toEqual([expect.stringContaining("not valid JSON")]);
  expect(await saveSources(stem, JSON.stringify({ "best-picture": { kind: "cutoff", sources: [] } }))).toEqual([
    '"best-picture": a cutoff entry needs its year in until',
    '"best-picture": sources must list at least one source',
  ]);
  expect(await saveSources(stem, JSON.stringify({ "no-such-prompt": entry }))).toEqual([`no built-in pack asks "no-such-prompt" for ${stem}`]);

  const open: Entry = { ...entry, kind: "open", until: undefined };
  expect(await saveSources(stem, JSON.stringify({ "best-picture": open }))).toEqual([]);
  const [kept] = await sql`select entry, seen from prompt_sources where pack = ${stem}`;
  expect(kept.entry.kind).toBe("open");
  expect(kept.seen).toEqual({ "en:Academy Award for Best Picture#1/Film": ["Titanic"] });
  expect(await saveSources(stem, "{}")).toEqual([]);
  expect(await sql`select 1 from prompt_sources where pack = ${stem}`).toHaveLength(0);
});
