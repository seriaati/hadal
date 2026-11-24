// The built-in packs, for an admin. Its words are English in every language of the game (owner, 2026-11-24).
import { LANGUAGES, type Language } from "../../shared/language";
import type { SystemPackSummary, UpdateSummary } from "../../shared/types";
import type { Part, Step, Ui } from "./ui";

/** Of a refused file's problems, as many as fit on the shortest screen. */
const SHOWN_PROBLEMS = 4;
const SHOWN_PROMPTS = 4;
const SOURCES = ".sources.json";
/** Short enough to sit beside "Language" on one line. */
const NAMES: Record<Language, string> = { en: "English", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese" };

type Held = { file: File; removes: string[] };

export class AdminPanel {
  private packs: SystemPackSummary[] = [];
  /** The last monthly update of the prompts that grow. */
  private update: UpdateSummary | null = null;
  private language: Language = "en";
  private busy = false;
  /** Of the last upload: the files refused, each with its problems, and those that would remove prompts. */
  private refused: { name: string; problems: string[] }[] = [];
  private held: Held[] = [];
  /** The name of the held file that one more press of its "Replace anyway" uploads. */
  private doomed = "";

  constructor(private ui: Ui) {}

  get showing() {
    return this.ui.top === this.list;
  }

  show() {
    void this.load();
    this.ui.go(this.list);
  }

  private async load() {
    const res = await fetch("/api/admin/packs");
    if (res.ok) this.packs = (await res.json()) as SystemPackSummary[];
    const updated = await fetch("/api/admin/updates");
    if (updated.ok) this.update = (await updated.json()) as UpdateSummary | null;
  }

  private list = (): Step => {
    const shift = (way: -1 | 1) => (this.language = LANGUAGES[(LANGUAGES.indexOf(this.language) + way + LANGUAGES.length) % LANGUAGES.length]!);
    const packs = this.packs.filter((pack) => pack.language === this.language);
    return {
      title: "Admin",
      busy: this.busy,
      rows: [
        { kind: "press", id: "language", label: "Language", value: NAMES[this.language], press: () => shift(1), shift },
        { kind: "press", id: "update", label: "Last update", value: this.update?.month ?? "none yet", press: () => this.update && this.ui.go(this.updated) },
        { kind: "gap" },
        // No note stands in for an empty list: a step keeps the room its words took, so the packs would come in under a gap.
        ...packs.map((pack): Part => ({
          kind: "press",
          id: `download:${pack.id}`,
          label: pack.name,
          value: `${pack.prompts} prompts`,
          says: `Download ${pack.name}`,
          press: () => Object.assign(document.createElement("a"), { href: `/api/admin/packs/${pack.language}/${pack.id}`, download: `${pack.id}.json` }).click(),
        })),
      ],
      foot: [
        { kind: "gap" },
        { kind: "press", id: "upload", label: "Upload packs", multiple: true, file: (files) => void this.upload(files) },
      ],
    };
  };

  /** What the last monthly update did, prompt by prompt. */
  private updated = (): Step => {
    const update = this.update!;
    const { input, cacheWrite, cacheRead, output, searches } = update.used;
    const changed = update.prompts.filter((prompt) => prompt.added.length || prompt.until || prompt.mended).length;
    return {
      title: "Last update",
      rows: [
        { kind: "note", text: `${update.month}: ${changed} ${changed === 1 ? "prompt" : "prompts"} changed` },
        { kind: "note", text: `Tokens: ${input} input, ${cacheWrite} cache written, ${cacheRead} cache read, ${output} output; ${searches} searches` },
        ...update.problems.slice(0, SHOWN_PROBLEMS).map((text): Part => ({ kind: "note", text, bad: true })),
        ...update.prompts.flatMap((prompt): Part[] => [
          { kind: "gap" },
          { kind: "note", text: `${prompt.pack}/${prompt.prompt}: ${prompt.text}`, warm: true },
          ...(prompt.failed ? [{ kind: "note", text: `failed: ${prompt.failed}`, bad: true } satisfies Part] : []),
          ...(prompt.added.length ? [{ kind: "note", text: `added ${prompt.added.length}: ${prompt.added.join(", ")}` } satisfies Part] : []),
          ...(prompt.until ? [{ kind: "note", text: `cut-off moved from ${prompt.until[0]} to ${prompt.until[1]}` } satisfies Part] : []),
          ...(prompt.mended ? [{ kind: "note", text: "sources mended" } satisfies Part] : []),
          ...prompt.skipped.slice(0, SHOWN_PROMPTS).map((text): Part => ({ kind: "note", text: `skipped ${text}` })),
        ]),
      ],
    };
  };

  private result = (): Step => ({
    title: "Upload",
    busy: this.busy,
    rows: [
      ...this.held.flatMap((held): Part[] => [
        { kind: "note", text: `${held.file.name} would remove ${held.removes.length} prompts the pack has now`, warm: true },
        ...held.removes.slice(0, SHOWN_PROMPTS).map((text): Part => ({ kind: "note", text: `- ${text}` })),
        ...(held.removes.length > SHOWN_PROMPTS ? [{ kind: "note", text: `and ${held.removes.length - SHOWN_PROMPTS} more` } satisfies Part] : []),
        {
          kind: "press",
          id: `replace:${held.file.name}`,
          label: this.doomed === held.file.name ? "Sure?" : "Replace anyway",
          danger: this.doomed === held.file.name,
          press: () => void this.replace(held),
          left: () => (this.doomed = ""),
        },
        { kind: "gap" },
      ]),
      ...this.refused.flatMap(({ name, problems }): Part[] => [
        { kind: "note", text: `${name} was not uploaded`, bad: true },
        ...problems.slice(0, SHOWN_PROBLEMS).map((text): Part => ({ kind: "note", text: `- ${text}` })),
        ...(problems.length > SHOWN_PROBLEMS ? [{ kind: "note", text: `and ${problems.length - SHOWN_PROBLEMS} more` } satisfies Part] : []),
        { kind: "gap" },
      ]),
    ],
  });

  /** One file at a time: what each did is told together at the end. */
  private async upload(files: File[]) {
    this.busy = true;
    this.refused = [];
    this.held = [];
    for (const file of files) await this.send(file, false);
    this.busy = false;
    if (this.refused.length || this.held.length) this.ui.go(this.result);
  }

  /** A file named `<pack id>.sources.json` is that pack's sources, whatever the language chosen; any other is a pack. */
  private async send(file: File, replace: boolean) {
    const url = file.name.endsWith(SOURCES)
      ? `/api/admin/sources/${encodeURIComponent(file.name.slice(0, -SOURCES.length))}`
      : `/api/admin/packs/${this.language}${replace ? "?replace=1" : ""}`;
    let body: SystemPackSummary[] | { problems: string[] } | { removes: string[] };
    try {
      body = (await (await fetch(url, { method: "POST", body: file })).json()) as typeof body;
    } catch {
      body = { problems: ["the server did not answer"] };
    }
    if (Array.isArray(body)) this.packs = body;
    else if ("problems" in body && !body.problems.length) return;
    else if ("removes" in body) this.held.push({ file, removes: body.removes });
    else this.refused.push({ name: file.name, problems: body.problems });
  }

  /** Replacing asks first: the second press in a row is the one that uploads. */
  private async replace(held: Held) {
    if (this.doomed !== held.file.name) {
      this.doomed = held.file.name;
      return;
    }
    this.busy = true;
    this.held = this.held.filter((one) => one !== held);
    await this.send(held.file, true);
    this.busy = false;
    if (!this.held.length && !this.refused.length) this.ui.back();
  }
}
