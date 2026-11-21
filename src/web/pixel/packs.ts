import { MAX_INSTRUCTIONS_LENGTH, MAX_PACK_BYTES, MAX_TOPIC_LENGTH, WRITTEN_PROMPTS, type PackSummary, type WriteOrder } from "../../shared/types";
import { t } from "../language";
import type { Sound } from "../sound";
import type { AccountPanel } from "./account";
import { FONTS, plain, wrap } from "./font";
import type { Part, Step, Ui } from "./ui";

/** As many lines about a refused file as fit on the shortest screen, wrapped as in the narrowest column. */
const MAX_LINES = 10;
const COLUMN = 128;
const SKILL = "https://github.com/seriaati/hadal/blob/main/skills/write-hadal-pack/SKILL.md";

/** The problems of a file, as many as fit, then a count of the rest. */
function report(problems: string[]): string[] {
  const shown: string[] = [];
  let lines = 0;
  for (const [i, problem] of problems.entries()) {
    const more = wrap(FONTS.tiny, plain(`- ${problem}`), COLUMN).length;
    if (lines + more > MAX_LINES - (i === problems.length - 1 ? 0 : 1)) {
      shown.push(t().packs.more(problems.length - i));
      break;
    }
    shown.push(`- ${problem}`);
    lines += more;
  }
  return shown;
}

export class PacksPanel {
  private packs: PackSummary[] = [];
  private busy = false;
  /** The id of the pack that one more press of its "Remove" removes. */
  private doomed = "";
  /** Why a request was refused: what was tried, then each problem. */
  private refused: string[] = [];
  /** Whether what was refused was a file, so that another can be chosen. */
  private refusedFile = false;
  private writing: { topic: string; done: number; of: number; stop: AbortController } | null = null;
  /** What the next pack is asked to be, besides its topic and the notes. */
  private prompts = WRITTEN_PROMPTS[0]!;
  private search = false;
  /** Why the last pack was not written. */
  private unwritten = "";

  constructor(
    private ui: Ui,
    private account: AccountPanel,
    private sound: Sound,
    private dive: (pack: string) => void,
  ) {}

  show() {
    void this.load();
    this.ui.go(this.list);
  }

  async load() {
    if (!this.account.account) {
      this.packs = [];
      return;
    }
    const body = (await (await fetch("/api/packs")).json()) as PackSummary[] | { problems: string[] };
    if (Array.isArray(body)) this.packs = body;
  }

  private list = (): Step => {
    const words = t().packs;
    if (!this.account.account) {
      return {
        title: words.title,
        rows: [
          { kind: "note", text: words.signInToKeep },
          { kind: "gap" },
          { kind: "press", id: "signin", label: t().account.signIn, press: () => this.account.show() },
        ],
      };
    }
    const rows = this.packs.map((pack): Part[] => [
      {
        kind: "press",
        id: `dive:${pack.id}`,
        label: pack.name,
        says: words.diveIn(pack.name),
        press: () => {
          this.ui.close();
          this.dive(pack.id);
        },
      },
      {
        kind: "press",
        id: `download:${pack.id}`,
        label: words.download,
        says: words.downloadPack(pack.name),
        right: true,
        quiet: true,
        press: () => Object.assign(document.createElement("a"), { href: `/api/packs/${pack.id}`, download: `${pack.id}.json` }).click(),
      },
      {
        kind: "press",
        id: `remove:${pack.id}`,
        label: this.doomed === pack.id ? words.sure : words.remove,
        says: words.removePack(pack.name),
        right: true,
        quiet: true,
        danger: this.doomed === pack.id,
        press: () => void this.remove(pack),
        left: () => (this.doomed = ""),
      },
    ]);
    return {
      title: words.title,
      busy: this.busy,
      rows: rows.length ? rows : [{ kind: "note", text: words.none }],
      foot: [
        { kind: "gap" },
        [
          { kind: "press", id: "add", label: words.add, file: (file) => void this.add(file) },
          { kind: "press", id: "write", label: words.write, press: () => this.ui.go(this.write) },
        ],
      ],
    };
  };

  private refusal = (): Step => ({
    title: t().packs.title,
    rows: [
      { kind: "note", text: this.refused[0] ?? "", bad: true },
      ...this.refused.slice(1).map((text): Part => ({ kind: "note", text })),
    ],
    foot: [
      { kind: "gap" },
      this.refusedFile
        ? { kind: "press", id: "again", label: t().packs.anotherFile, file: (file) => void this.add(file) }
        : { kind: "press", id: "again", label: t().packs.backToPacks, press: () => this.ui.back() },
    ],
  });

  private write = (): Step => {
    const words = t().packs;
    const title = words.write;
    const writing = this.writing;
    if (writing) {
      return {
        title,
        rows: [
          { kind: "wait", text: words.writing(writing.topic), done: writing.done, of: writing.of },
          { kind: "gap" },
          { kind: "press", id: "stop", label: words.stop, press: () => writing.stop.abort() },
        ],
      };
    }
    if (!this.account.account?.keys.anthropic) {
      return {
        title,
        rows: [
          { kind: "note", text: words.needsKey },
          { kind: "press", id: "key", label: words.addKey, press: () => this.account.show("anthropic") },
          { kind: "gap" },
          { kind: "note", text: words.withSkill },
          { kind: "press", id: "skill", label: words.getSkill, says: words.openSkill, press: () => open(SKILL, "_blank", "noopener") },
        ],
      };
    }
    const shift = (way: -1 | 1) => {
      const at = WRITTEN_PROMPTS.indexOf(this.prompts) + way;
      this.prompts = WRITTEN_PROMPTS[(at + WRITTEN_PROMPTS.length) % WRITTEN_PROMPTS.length]!;
    };
    return {
      title,
      rows: [
        { kind: "field", id: "topic", label: words.topic, max: MAX_TOPIC_LENGTH, autocomplete: "off" },
        { kind: "field", id: "instructions", label: words.instructions, max: MAX_INSTRUCTIONS_LENGTH, autocomplete: "off" },
        { kind: "press", id: "count", label: words.count, value: String(this.prompts), press: () => shift(1), shift },
        { kind: "press", id: "search", label: words.search, value: this.search ? t().rooms.on : t().rooms.off, on: this.search, press: () => (this.search = !this.search) },
        this.unwritten
          ? { kind: "note", text: words.unwritten(this.unwritten), bad: true }
          : { kind: "note", text: words.how },
        { kind: "gap" },
        { kind: "press", id: "send", label: words.send, press: () => void this.begin() },
      ],
    };
  };

  /** The server answers with the packs as they now stand, or the problems. Returns the pack that is new. */
  private async change(request: Promise<Response>, tried: string, file = false): Promise<PackSummary | undefined> {
    const had = new Set(this.packs.map((pack) => pack.id));
    this.busy = true;
    let body: PackSummary[] | { problems: string[] };
    try {
      body = (await (await request).json()) as typeof body;
    } catch {
      body = { problems: [t().noAnswer] };
    }
    this.busy = false;
    if (Array.isArray(body)) {
      this.packs = body;
      if (this.ui.top === this.refusal) this.ui.back();
      return body.find((pack) => !had.has(pack.id));
    }
    this.refuse(tried, body.problems, file);
  }

  private refuse(tried: string, problems: string[], file: boolean) {
    this.refused = [tried, ...report(problems)];
    this.refusedFile = file;
    if (this.ui.open && this.ui.top !== this.refusal) this.ui.go(this.refusal);
  }

  private async add(file: File) {
    const tried = t().packs.notAdded(file.name);
    if (file.size > MAX_PACK_BYTES) return this.refuse(tried, [t().packs.tooBig(MAX_PACK_BYTES / 1000)], true);
    const added = await this.change(fetch("/api/packs", { method: "POST", body: file }), tried, true);
    if (added) this.ui.focus(`dive:${added.id}`);
  }

  /** Removing asks first: the second press in a row is the one that removes. */
  private async remove(pack: PackSummary) {
    if (this.doomed !== pack.id) {
      this.doomed = pack.id;
      return;
    }
    const at = this.packs.indexOf(pack);
    await this.change(fetch(`/api/packs/${pack.id}`, { method: "DELETE" }), t().packs.notRemoved(pack.name));
    // The focus goes to what took the pack's place.
    const next = this.packs[Math.min(at, this.packs.length - 1)];
    this.ui.focus(next ? `remove:${next.id}` : "add");
  }

  /** The panel may be left meanwhile: the writing goes on. */
  private async begin() {
    const topic = this.ui.value("topic").trim();
    if (!topic) return;
    const had = new Set(this.packs.map((pack) => pack.id));
    const stop = new AbortController();
    const order: WriteOrder = { topic, instructions: this.ui.value("instructions").trim(), prompts: this.prompts, search: this.search };
    const writing = (this.writing = { topic, done: 0, of: order.prompts, stop });
    let problems = [t().noAnswer];
    try {
      const res = await fetch("/api/write", { method: "POST", body: JSON.stringify(order), signal: stop.signal });
      // The answer comes a line at a time: how many prompts are written so far, and at the end the packs or what went wrong.
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      for (let rest = ""; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = (rest + value).split("\n");
        rest = lines.pop()!;
        for (const line of lines) {
          const said = JSON.parse(line) as { prompts?: number; packs?: PackSummary[]; problems?: string[] };
          if (said.prompts !== undefined) writing.done = said.prompts;
          if (said.problems) problems = said.problems;
          if (said.packs) {
            this.packs = said.packs;
            problems = [];
          }
        }
      }
    } catch {
      // Stopped by the player, or the connection was lost: the signal says which.
    }
    this.writing = null;
    this.unwritten = stop.signal.aborted ? "" : (problems[0] ?? "");
    if (stop.signal.aborted) return;
    this.sound.written(!this.unwritten);
    if (this.unwritten) return;
    this.ui.clear("topic");
    this.ui.clear("instructions");
    if (this.ui.top !== this.write) return;
    this.ui.back();
    const fresh = this.packs.find((pack) => !had.has(pack.id));
    if (fresh) this.ui.focus(`dive:${fresh.id}`);
  }
}
