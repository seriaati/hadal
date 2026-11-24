// The built-in packs, for an admin. Its words are English in every language of the game (owner, 2026-11-24).
import { LANGUAGES, LANGUAGE_NAMES, type Language } from "../../shared/language";
import type { SystemPackSummary } from "../../shared/types";
import type { Part, Step, Ui } from "./ui";

/** Of a refused file's problems, as many as fit on the shortest screen. */
const SHOWN_PROBLEMS = 4;
const SHOWN_PROMPTS = 4;

type Held = { file: File; removes: string[] };

export class AdminPanel {
  private packs: SystemPackSummary[] = [];
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
  }

  private list = (): Step => {
    const shift = (way: -1 | 1) => (this.language = LANGUAGES[(LANGUAGES.indexOf(this.language) + way + LANGUAGES.length) % LANGUAGES.length]!);
    const packs = this.packs.filter((pack) => pack.language === this.language);
    return {
      title: "Admin",
      busy: this.busy,
      rows: [
        { kind: "press", id: "language", label: "Language", value: LANGUAGE_NAMES[this.language], press: () => shift(1), shift },
        { kind: "gap" },
        ...(packs.length
          ? packs.map((pack): Part => ({
              kind: "press",
              id: `download:${pack.id}`,
              label: pack.name,
              value: `${pack.prompts} prompts`,
              says: `Download ${pack.name}`,
              press: () => Object.assign(document.createElement("a"), { href: `/api/admin/packs/${pack.language}/${pack.id}`, download: `${pack.id}.json` }).click(),
            }))
          : [{ kind: "note", text: "No packs in this language yet" } satisfies Part]),
      ],
      foot: [{ kind: "gap" }, { kind: "press", id: "upload", label: "Upload packs", multiple: true, file: (files) => void this.upload(files) }],
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

  private async send(file: File, replace: boolean) {
    let body: SystemPackSummary[] | { problems: string[] } | { removes: string[] };
    try {
      body = (await (await fetch(`/api/admin/packs/${this.language}${replace ? "?replace=1" : ""}`, { method: "POST", body: file })).json()) as typeof body;
    } catch {
      body = { problems: ["the server did not answer"] };
    }
    if (Array.isArray(body)) this.packs = body;
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
