import { MAX_INSTRUCTIONS_LENGTH, MAX_PACK_BYTES, MAX_TOPIC_LENGTH, WRITTEN_PROMPTS, type PackSummary, type Writing, type WriteOrder } from "../../shared/types";
import { t } from "../language";
import type { Sound } from "../sound";
import type { AccountPanel } from "./account";
import { FONTS, plain, wrap } from "./font";
import type { Part, Step, Ui } from "./ui";

/** As many lines about a refused file as fit on the shortest screen, wrapped as in the narrowest column. */
const MAX_LINES = 10;
const COLUMN = 128;
/** How often the server is asked how a pack being written stands. */
const FOLLOW_MS = 3000;

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
  /** The pack Claude is writing for the player, as the server last told it. */
  private writing: Writing | null = null;
  private nextLook: ReturnType<typeof setTimeout> | undefined;
  /** Counts the looks at the writing, so that one answered after the player stopped it counts for nothing. */
  private looks = 0;
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
      this.forget();
      return;
    }
    await this.loadPacks();
    await this.look();
  }

  private async loadPacks() {
    const body = (await (await fetch("/api/packs")).json()) as PackSummary[] | { problems: string[] };
    if (Array.isArray(body)) this.packs = body;
  }

  /** Asks the server how the writing stands, and asks again a little later while it goes on. */
  private async look() {
    clearTimeout(this.nextLook);
    const look = ++this.looks;
    let now: Writing | null;
    try {
      const res = await fetch("/api/write");
      if (!res.ok) return this.forget();
      now = (await res.json()) as Writing | null;
    } catch {
      // The server cannot be reached, perhaps while it restarts: the writing goes on there.
      now = this.writing;
    }
    if (look !== this.looks) return;
    const was = this.writing;
    if (now?.failed) {
      this.writing = null;
      this.unwritten = now.failed;
      this.sound.written(false);
      return;
    }
    this.writing = now;
    if (now) this.nextLook = setTimeout(() => void this.look(), FOLLOW_MS);
    else if (was) await this.written();
  }

  private forget() {
    this.looks++;
    clearTimeout(this.nextLook);
    this.writing = null;
  }

  private async written() {
    const had = new Set(this.packs.map((pack) => pack.id));
    await this.loadPacks();
    this.sound.written(true);
    if (this.ui.top !== this.write) return;
    this.ui.back();
    const fresh = this.packs.find((pack) => !had.has(pack.id));
    if (fresh) this.ui.focus(`dive:${fresh.id}`);
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
          { kind: "press", id: "stop", label: words.stop, press: () => void this.stop() },
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
          { kind: "press", id: "skill", label: words.getSkill, says: words.downloadSkill, press: () => Object.assign(document.createElement("a"), { href: "/api/skill", download: "SKILL.md" }).click() },
          { kind: "press", id: "skillHelp", label: words.howToUse, press: () => this.ui.go(this.skillHelp) },
        ],
      };
    }
    const shift = (way: -1 | 1) => {
      const at = WRITTEN_PROMPTS.indexOf(this.prompts) + way;
      this.prompts = WRITTEN_PROMPTS[(at + WRITTEN_PROMPTS.length) % WRITTEN_PROMPTS.length]!;
    };
    return {
      title,
      busy: this.busy,
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

  private skillHelp = (): Step => {
    const words = t().packs;
    return {
      title: words.howToUse,
      rows: [
        { kind: "note", text: words.giveSkill },
        { kind: "note", text: words.skillPlace },
        { kind: "gap" },
        { kind: "note", text: words.thenAsk },
        { kind: "note", text: words.askExample(t().name), warm: true },
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
    if (file.size > MAX_PACK_BYTES) return this.refuse(tried, [t().packs.tooBig(MAX_PACK_BYTES / 1_000_000)], true);
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

  /** The writing goes on at the server, even if the game is closed. */
  private async begin() {
    const topic = this.ui.value("topic").trim();
    if (!topic) return;
    const order: WriteOrder = { topic, instructions: this.ui.value("instructions").trim(), prompts: this.prompts, search: this.search };
    this.busy = true;
    let body: Writing | { problems: string[] };
    try {
      body = (await (await fetch("/api/write", { method: "POST", body: JSON.stringify(order) })).json()) as typeof body;
    } catch {
      body = { problems: [t().noAnswer] };
    }
    this.busy = false;
    if ("problems" in body) {
      this.unwritten = body.problems[0] ?? "";
      this.sound.written(false);
      return;
    }
    this.unwritten = "";
    this.ui.clear("topic");
    this.ui.clear("instructions");
    this.writing = body;
    this.nextLook = setTimeout(() => void this.look(), FOLLOW_MS);
  }

  private async stop() {
    this.forget();
    await fetch("/api/write", { method: "DELETE" }).catch(() => {});
  }
}
