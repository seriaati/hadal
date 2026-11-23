// Checks the sources of the prompts whose answers grow over time (`curation/<pack id>.sources.json`)
// against what they listed when last checked (`curation/<pack id>.seen.json`), and reports the rows
// that are new: answers a pack may be missing. `--bump` also reports the rows past each cut-off
// year, for moving cut-offs forward. `--write` records what the sources list now as seen.
//   bun tools/sources.ts [--bump] [--report report.json] [--write]
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pack } from "../src/shared/types";
import { CURATION, option } from "./curation";
import { tables, type Cell } from "./table";
import { members } from "./wiki";

/** A column is named by its header, or numbered from 1 in a table that has no header row. */
type Source = { lang: string; page: string; table?: number; column?: string | number; members?: boolean } | { url: string };
/** A `fixed` cut-off was chosen to keep the prompt deep ("before 2000"), not to stay current, so it is never moved forward. */
type Entry = { kind: "open" | "cutoff"; until?: number; fixed?: boolean; sources: Source[]; note?: string };
/** By prompt id, then by source, the values a source listed. */
type Seen = Record<string, Record<string, string[]>>;
type Row = { value: string; row: string };
type Report = {
  prompts: { sources: string; id: string; packs: string[]; kind: Entry["kind"]; until?: number; note?: string; added: Row[]; pastCutoff: Row[] }[];
  problems: string[];
  unchecked: string[];
};

const PACKS = join(import.meta.dir, "../packs");
const LOCALES: [prefix: string, folder: string][] = [["", "en"], ["zh-", "zh-CN"], ["tw-", "zh-TW"]];
const bump = process.argv.includes("--bump");
const write = process.argv.includes("--write");
const reportFile = option("--report");
const thisYear = new Date().getFullYear();

const keyOf = (source: Source) => ("url" in source ? source.url : `${source.lang}:${source.page}#${source.members ? "members" : `${source.table}/${source.column}`}`);
const years = (text: string) => (text.match(/\b(?:1[5-9]|20)\d\d\b/g) ?? []).map(Number);

const pages = new Map<string, Promise<Cell[][][]>>();
const linked = new Map<string, Promise<string[]>>();
const once = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) => {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key)!;
};

/** The values one source lists, each with its whole row, which tells what the value is and when. */
async function read(source: Exclude<Source, { url: string }>): Promise<Row[]> {
  if (source.members) return (await once(linked, `${source.lang}:${source.page}`, () => members(source.page, source.lang))).map((title) => ({ value: title, row: title }));
  const table = (await once(pages, `${source.lang}:${source.page}`, () => tables(source.page, source.lang)))[source.table! - 1];
  if (!table) throw new Error(`has no table ${source.table}`);
  const wanted = String(source.column).trim().toLowerCase();
  let header = -1;
  let column = Number(source.column) - 1;
  if (typeof source.column === "string") {
    header = table.findIndex((row) => row.some((cell) => cell?.text.toLowerCase() === wanted));
    if (header < 0) throw new Error(`table ${source.table} has no column "${source.column}"`);
    // Two columns can share a header (a laureate's photo and name are both "Name"): the one with the most filled cells is the list.
    const filled = (at: number) => table.slice(header + 1).filter((row) => row[at]?.text).length;
    const named = table[header]!.flatMap((cell, at) => (cell?.text.toLowerCase() === wanted ? [at] : []));
    column = named.reduce((best, at) => (filled(at) > filled(best) ? at : best));
  }
  const found = new Map<string, Row>();
  for (const row of table.slice(header + 1)) {
    const cell = row[column];
    // Long tables repeat their header row part way down.
    if (!cell?.text || cell.text.toLowerCase() === wanted) continue;
    const value = cell.link ?? cell.text;
    if (!found.has(value)) found.set(value, { value, row: row.map((one) => one?.text ?? "").join(" | ") });
  }
  return [...found.values()];
}

/** The packs that ask a prompt: a file's own pack for the Chinese-only prompts, or every language's for a shared one. */
async function packsAsking(name: string, id: string): Promise<string[]> {
  const local = LOCALES.find(([prefix]) => prefix && name.startsWith(prefix));
  const stem = local ? name.slice(local[0].length) : name;
  const files = (local ? [local] : LOCALES).map(([prefix, folder]) => join(PACKS, folder, `${prefix}${stem}.json`));
  const asking = [];
  for (const file of files) {
    if (!(await Bun.file(file).exists())) continue;
    const pack = (await Bun.file(file).json()) as Pack;
    if (pack.prompts.some((prompt) => prompt.id === id)) asking.push(file.slice(join(PACKS, "..").length + 1));
  }
  return asking;
}

const report: Report = { prompts: [], problems: [], unchecked: [] };
const names = (await readdir(CURATION)).filter((file) => file.endsWith(".sources.json")).map((file) => file.slice(0, -".sources.json".length)).sort();

for (const name of names) {
  const entries = (await Bun.file(join(CURATION, `${name}.sources.json`)).json()) as Record<string, Entry>;
  const seenFile = Bun.file(join(CURATION, `${name}.seen.json`));
  const seen: Seen = (await seenFile.exists()) ? await seenFile.json() : {};
  const now: Seen = {};
  for (const [id, entry] of Object.entries(entries)) {
    now[id] = {};
    const added: Row[] = [];
    const pastCutoff: Row[] = [];
    for (const source of entry.sources) {
      const key = keyOf(source);
      if ("url" in source) {
        report.unchecked.push(`${name} ${id}: ${source.url}`);
        continue;
      }
      let rows: Row[];
      try {
        rows = await read(source);
      } catch (error) {
        report.problems.push(`${name} ${id}: ${source.lang}:${source.page} ${(error as Error).message}`);
        // Keep what was seen, so the rows are not all reported as new once the source is fixed.
        if (seen[id]?.[key]) now[id][key] = seen[id][key];
        continue;
      }
      now[id][key] = rows.map((row) => row.value).sort();
      const before = seen[id]?.[key];
      if (before) {
        const known = new Set(before);
        for (const row of rows) {
          if (known.has(row.value)) continue;
          // A row dated only past the cut-off is not an answer yet: the yearly bump takes it.
          const dated = years(row.row);
          if (entry.kind === "cutoff" && dated.length && dated.every((year) => year > entry.until!)) continue;
          added.push(row);
        }
      }
      if (bump && entry.kind === "cutoff" && !entry.fixed) pastCutoff.push(...rows.filter((row) => years(row.row).some((year) => year > entry.until! && year <= thisYear)));
    }
    if (added.length || pastCutoff.length) {
      report.prompts.push({ sources: `curation/${name}.sources.json`, id, packs: await packsAsking(name, id), kind: entry.kind, until: entry.until, note: entry.note, added, pastCutoff });
    }
  }
  if (write) await Bun.write(seenFile, JSON.stringify(now, null, 1) + "\n");
}

for (const prompt of report.prompts) {
  const parts = [prompt.added.length && `${prompt.added.length} new`, prompt.pastCutoff.length && `${prompt.pastCutoff.length} past ${prompt.until}`].filter(Boolean);
  console.log(`${prompt.sources} ${prompt.id}: ${parts.join(", ")}`);
}
for (const problem of report.problems) console.log(`problem: ${problem}`);
console.log(`${report.prompts.length} prompts to update, ${report.problems.length} problems, ${report.unchecked.length} sources not on Wikipedia left unchecked${write ? "; recorded what the sources list now" : ""}`);
if (reportFile) await Bun.write(reportFile, JSON.stringify(report, null, 1) + "\n");
