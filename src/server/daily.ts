import type { Language } from "../shared/language";
import type { DailyStanding, GamePrompt, Pack } from "../shared/types";
import { sql } from "./db";
import { shuffle, type PromptIndex } from "./game";

/** A day of the daily dive runs from midnight to midnight in UTC+8 (owner, 2026-11-24). */
const DAY_OFFSET_MS = 8 * 60 * 60 * 1000;
/** The day of daily dive #1. */
const FIRST_DAY = "2026-11-24";
export const DAILY_PROMPTS = 10;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const dayOf = (time = Date.now()) => new Date(time + DAY_OFFSET_MS).toISOString().slice(0, 10);
export const numberOf = (day: string) => Math.round((Date.parse(day) - Date.parse(FIRST_DAY)) / 86_400_000) + 1;
export const isDay = (text: string) => DAY.test(text) && !Number.isNaN(Date.parse(text));

/** The same numbers in [0, 1) for the same seed: Mulberry32, by Tommy Ettinger (public domain). */
function seeded(seed: string): () => number {
  let state = Number.parseInt(new Bun.CryptoHasher("sha256").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One prompt from each of ten packs, in an order: the same for the same packs, day and language. */
export function pickDaily(packs: Pack[], day: string, language: Language): string[] {
  const random = seeded(`${day}/${language}`);
  return shuffle(packs, random)
    .slice(0, DAILY_PROMPTS)
    .map((pack) => `${pack.id}/${pack.prompts[Math.floor(random() * pack.prompts.length)]!.id}`);
}

/** The day's prompts, picked the first time they are asked for and then kept. One removed from its pack since is left out. */
export async function dailyPrompts(language: Language, packs: Pack[], index: PromptIndex, day = dayOf()): Promise<GamePrompt[]> {
  await sql`
    insert into daily_sets (day, language, prompts) values (${day}, ${language}, ${pickDaily(packs, day, language)}::jsonb)
    on conflict do nothing`;
  const [row] = await sql`select prompts from daily_sets where day = ${day} and language = ${language}`;
  return (row.prompts as string[]).flatMap((id) => index.get(id)?.prompt ?? []);
}

export async function standing(player: string, day = dayOf()): Promise<DailyStanding> {
  const [row] = await sql`select depth from daily_runs where day = ${day} and player = ${player}`;
  return { number: numberOf(day), dived: !!row, depth: row?.depth ?? null };
}

/** The player's first dive of the day claims the scored one. Says whether this dive is it. */
export async function claim(player: string, day = dayOf()): Promise<boolean> {
  const rows = await sql`insert into daily_runs (day, player) values (${day}, ${player}) on conflict do nothing returning player`;
  return rows.length > 0;
}

/** Keeps the depth of the scored dive, once. */
export async function record(player: string, day: string, depth: number) {
  await sql`update daily_runs set depth = ${depth} where day = ${day} and player = ${player} and depth is null`;
}
