import { MAX_PACK_BYTES, MAX_TOPIC_LENGTH, WRITTEN_PROMPTS, type PackSummary } from "../../shared/types";
import type { Sound } from "../sound";
import type { AccountPanel } from "./account";
import { FONTS, plain, wrap } from "./font";
import type { Part, Step, Ui } from "./ui";

/** As many lines about a refused file as fit on the shortest screen, wrapped as in the narrowest column. */
const MAX_LINES = 10;
const COLUMN = 128;

/** The problems of a file, as many as fit, then a count of the rest. */
function report(problems: string[]): string[] {
  const shown: string[] = [];
  let lines = 0;
  for (const [i, problem] of problems.entries()) {
    const more = wrap(FONTS.tiny, plain(`- ${problem}`), COLUMN).length;
    if (lines + more > MAX_LINES - (i === problems.length - 1 ? 0 : 1)) {
      shown.push(`and ${problems.length - i} more`);
      break;
    }
    shown.push(`- ${problem}`);
    lines += more;
  }
  return shown;
}

/**
 * The panel for a player's own packs, opened from the title menu. Its first step is the list:
 * dive in a pack, remove one, add one from a file. From there a second step has Claude write
 * a pack, and shows the wait while it does. Signed out, the panel only says to sign in.
 */
export class PacksPanel {
  private packs: PackSummary[] = [];
  private busy = false;
  /** The id of the pack that one more press of its "Remove" removes. */
  private doomed = "";
  /** Why a request was refused: what was tried, then each problem. */
  private refused: string[] = [];
  /** Whether what was refused was a file, so that another can be chosen. */
  private refusedFile = false;
  /** The pack being written: what about, how many of its prompts are done, and the way to stop. */
  private writing: { topic: string; done: number; stop: AbortController } | null = null;
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

  /** Fetch the packs of whoever is signed in. */
  async load() {
    if (!this.account.account) {
      this.packs = [];
      return;
    }
    const body = (await (await fetch("/api/packs")).json()) as PackSummary[] | { problems: string[] };
    if (Array.isArray(body)) this.packs = body;
  }

  private list = (): Step => {
    if (!this.account.account) {
      return {
        title: "Packs",
        rows: [
          { kind: "note", text: "Sign in to keep packs of your own" },
          { kind: "gap" },
          { kind: "press", id: "signin", label: "Sign in", press: () => this.account.show() },
        ],
      };
    }
    const rows = this.packs.map((pack): Part[] => [
      {
        kind: "press",
        id: `dive:${pack.id}`,
        label: pack.name,
        says: `Dive in ${pack.name}`,
        press: () => {
          this.ui.close();
          this.dive(pack.id);
        },
      },
      {
        kind: "press",
        id: `remove:${pack.id}`,
        label: this.doomed === pack.id ? "Sure?" : "Remove",
        says: `Remove ${pack.name}`,
        right: true,
        quiet: true,
        danger: this.doomed === pack.id,
        press: () => void this.remove(pack),
        left: () => (this.doomed = ""),
      },
    ]);
    return {
      title: "Packs",
      busy: this.busy,
      rows: [
        ...(rows.length ? rows : [{ kind: "note", text: "No packs yet" } as Part]),
        { kind: "gap" },
        [
          { kind: "press", id: "add", label: "Add a pack", file: (file) => void this.add(file) },
          { kind: "press", id: "write", label: "Write a pack", press: () => this.ui.go(this.write) },
        ],
      ],
    };
  };

  private refusal = (): Step => ({
    title: "Packs",
    rows: [
      { kind: "note", text: this.refused[0] ?? "", bad: true },
      ...this.refused.slice(1).map((text): Part => ({ kind: "note", text })),
      { kind: "gap" },
      this.refusedFile
        ? { kind: "press", id: "again", label: "Choose another file", file: (file) => void this.add(file) }
        : { kind: "press", id: "again", label: "Back to packs", press: () => this.ui.back() },
    ],
  });

  private write = (): Step => {
    const title = "Write a pack";
    const writing = this.writing;
    if (writing) {
      return {
        title,
        rows: [
          { kind: "wait", text: `Claude is writing a pack about ${writing.topic}`, done: writing.done, of: WRITTEN_PROMPTS },
          { kind: "gap" },
          { kind: "press", id: "stop", label: "Stop writing", press: () => writing.stop.abort() },
        ],
      };
    }
    if (!this.account.account?.keys.anthropic) {
      return {
        title,
        rows: [
          { kind: "note", text: "Writing a pack takes an Anthropic API key of your own" },
          { kind: "gap" },
          { kind: "press", id: "key", label: "Add a key", press: () => this.account.show("anthropic") },
        ],
      };
    }
    return {
      title,
      rows: [
        { kind: "field", id: "topic", label: "A pack about", max: MAX_TOPIC_LENGTH, autocomplete: "off" },
        this.unwritten
          ? { kind: "note", text: `No pack was written: ${this.unwritten}`, bad: true }
          : { kind: "note", text: "Claude writes it with your key. It takes a minute or so" },
        { kind: "gap" },
        { kind: "press", id: "send", label: "Write it", press: () => void this.begin() },
      ],
    };
  };

  /** Take the server's answer to a change of the packs: the list as it now stands, or why not. Returns the pack that is new. */
  private async change(request: Promise<Response>, tried: string, file = false): Promise<PackSummary | undefined> {
    const had = new Set(this.packs.map((pack) => pack.id));
    this.busy = true;
    let body: PackSummary[] | { problems: string[] };
    try {
      body = (await (await request).json()) as typeof body;
    } catch {
      body = { problems: ["no answer came from the server: try again"] };
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
    const tried = `${file.name} was not added`;
    if (file.size > MAX_PACK_BYTES) return this.refuse(tried, [`a pack file is at most ${MAX_PACK_BYTES / 1000} KB`], true);
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
    await this.change(fetch(`/api/packs/${pack.id}`, { method: "DELETE" }), `${pack.name} was not removed`);
    // The focus goes to what took the pack's place.
    const next = this.packs[Math.min(at, this.packs.length - 1)];
    this.ui.focus(next ? `remove:${next.id}` : "add");
  }

  /** Have Claude write a pack about the topic that was typed. The panel may be left meanwhile: the writing goes on. */
  private async begin() {
    const topic = this.ui.value("topic").trim();
    if (!topic) return;
    const had = new Set(this.packs.map((pack) => pack.id));
    const stop = new AbortController();
    const writing = (this.writing = { topic, done: 0, stop });
    let problems = ["no answer came from the server: try again"];
    try {
      const res = await fetch("/api/write", { method: "POST", body: JSON.stringify({ topic }), signal: stop.signal });
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
      // Stopped by the player, or the connection was lost: `problems` says which.
    }
    this.writing = null;
    this.unwritten = stop.signal.aborted ? "" : (problems[0] ?? "");
    if (stop.signal.aborted) return;
    this.sound.written(!this.unwritten);
    if (this.unwritten) return;
    this.ui.clear("topic");
    // Back to the list, with the focus on the new pack.
    if (this.ui.top !== this.write) return;
    this.ui.back();
    const fresh = this.packs.find((pack) => !had.has(pack.id));
    if (fresh) this.ui.focus(`dive:${fresh.id}`);
  }
}
