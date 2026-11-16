import { MAX_PACK_BYTES, type PackSummary } from "../../shared/types";
import { FONTS, drawText, measure, plain, wrap } from "./font";
import type { Frame } from "./frame";
import { centre, drawButton, drawPanel } from "./settings";

const WIDTH = 140;
const PAD = 7;
const INNER = WIDTH - 2 * PAD;
const ROW = 11;
const LINE = 8;
/** As many lines about a refused file as fit on the shortest screen. */
const MAX_LINES = 15;

/** What is wrong with a file, as lines to draw: as many problems as fit, then a count of the rest. */
function report(heading: string, problems: string[]): string[] {
  const lines = wrap(FONTS.tiny, plain(heading), INNER);
  for (const [i, problem] of problems.entries()) {
    const more = wrap(FONTS.tiny, plain(`- ${problem}`), INNER);
    const last = i === problems.length - 1;
    if (lines.length + more.length > MAX_LINES - (last ? 0 : 1)) {
      lines.push(`and ${problems.length - i} more`);
      break;
    }
    lines.push(...more);
  }
  return lines;
}

/**
 * The panel for a player's own packs, opened from the title menu: dive in one, add one from a
 * file, remove one. Like the account panel it is a real but invisible form, drawn on the pixel
 * grid with each control laid over its drawing. Signed out, it only says to sign in.
 */
export class PacksPanel {
  private signedIn = false;
  private rows: { pack: PackSummary; dive: HTMLButtonElement; remove: HTMLButtonElement }[] = [];
  /** Why the last request was refused. While this has lines, they are shown in place of the list. */
  private refused: string[] = [];
  /** The id of the pack that one more press of its "Remove" removes. */
  private doomed = "";
  private file: HTMLInputElement;
  /** "Sign in" when signed out, "Back" under a refusal. */
  private button: HTMLButtonElement;

  /** `back` is what takes the typing while the panel is closed. */
  constructor(
    private form: HTMLFormElement,
    private back: HTMLElement,
    private actions: { dive: (pack: string) => void; signIn: () => void },
  ) {
    this.file = form.querySelector("[name=file]")!;
    this.button = form.querySelector("[name=button]")!;

    this.file.addEventListener("change", () => {
      const file = this.file.files?.[0];
      this.file.value = ""; // so that the same file can be chosen again once it is mended
      if (!file) return;
      const heading = `${file.name} was not added`;
      if (file.size > MAX_PACK_BYTES) this.refuse(heading, [`a pack file is at most ${MAX_PACK_BYTES / 1000} KB`]);
      else void this.change(fetch("/api/packs", { method: "POST", body: file }), heading);
    });
    this.button.addEventListener("click", () => {
      if (this.signedIn) return this.refuse("", []);
      this.close();
      actions.signIn();
    });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
      // Tab goes round everything in the panel and never out of it. Up and Down skip the "Remove"s.
      const tab = event.key === "Tab";
      const step = event.key === "ArrowDown" || (tab && !event.shiftKey) ? 1 : event.key === "ArrowUp" || tab ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const stops = [...form.querySelectorAll<HTMLElement>(`:scope > :not([hidden]${tab ? "" : ", [name=remove]"})`)];
      const next = stops.indexOf(document.activeElement as HTMLElement) + step;
      stops[(next + stops.length) % stops.length]!.focus();
    });
  }

  get open(): boolean {
    return !this.form.hidden;
  }

  show(signedIn: boolean) {
    this.signedIn = signedIn;
    this.form.hidden = false;
    this.list([]);
    this.refuse("", []);
    if (signedIn) void this.change(fetch("/api/packs"));
  }

  close() {
    this.form.hidden = true;
    this.back.focus();
  }

  private get listing(): boolean {
    return this.signedIn && this.refused.length === 0;
  }

  private get lines(): string[] {
    return this.signedIn ? this.refused : wrap(FONTS.tiny, "Sign in to keep packs of your own", INNER);
  }

  private get height(): number {
    const body = this.listing ? this.rows.length * ROW + (this.rows.length ? 3 : 0) : this.lines.length * LINE + 4;
    return PAD + 14 + body + 9 + PAD;
  }

  /** Show why a request was refused, or with no problems go back to the list; then put each control where it belongs. */
  private refuse(heading: string, problems: string[]) {
    this.refused = problems.length ? report(heading, problems) : [];
    for (const row of this.rows) row.dive.hidden = row.remove.hidden = !this.listing;
    this.file.hidden = !this.listing;
    this.button.hidden = this.listing;
    this.button.textContent = this.signedIn ? "Back" : "Sign in";
    (this.listing ? (this.rows[0]?.dive ?? this.file) : this.button).focus();
  }

  /** Take the server's answer to a request about the packs: the list as it now stands, or why not. */
  private async change(request: Promise<Response>, heading = "That did not work") {
    const body = (await (await request).json()) as PackSummary[] | { problems: string[] };
    if (Array.isArray(body)) this.list(body);
    this.refuse(heading, Array.isArray(body) ? [] : body.problems);
  }

  /** Make the two buttons of every pack: its name, which dives in it, and its "Remove". */
  private list(packs: PackSummary[]) {
    for (const row of this.rows) {
      row.dive.remove();
      row.remove.remove();
    }
    this.doomed = "";
    this.rows = packs.map((pack) => {
      const [dive, remove] = [`Dive in ${pack.name}`, `Remove ${pack.name}`].map((label) =>
        Object.assign(document.createElement("button"), { type: "button", ariaLabel: label }),
      ) as [HTMLButtonElement, HTMLButtonElement];
      remove.name = "remove";
      dive.addEventListener("click", () => {
        this.close();
        this.actions.dive(pack.id);
      });
      // Removing asks first: the second press in a row is the one that removes.
      remove.addEventListener("click", () => {
        if (this.doomed === pack.id) void this.change(fetch(`/api/packs/${pack.id}`, { method: "DELETE" }));
        else this.doomed = pack.id;
      });
      remove.addEventListener("blur", () => (this.doomed = ""));
      this.file.before(dive, remove);
      return { pack, dive, remove };
    });
  }

  /** A press at a point of the frame: outside the panel, it closes it. */
  press(frame: Frame, x: number, y: number) {
    const { left, top } = centre(frame, WIDTH, this.height);
    if (x < left || x >= left + WIDTH || y < top || y >= top + this.height) this.close();
  }

  /** `scale` is how many screen pixels one pixel of the frame takes. */
  draw(frame: Frame, scale: number) {
    if (!this.open) return;
    const { tiny } = FONTS;
    const { left, top } = centre(frame, WIDTH, this.height);
    const x = left + PAD;
    const focus = document.activeElement;
    const cover = (control: HTMLElement, from: number, y: number, width: number) =>
      Object.assign(control.style, { left: `${from * scale}px`, top: `${(y - 3) * scale}px`, width: `${width * scale}px`, height: `${ROW * scale}px` });

    drawPanel(frame, WIDTH, this.height);
    drawText(frame, tiny, "Packs", x, top + PAD, 7);
    let y = top + PAD + 14;
    if (!this.listing) {
      for (const line of this.lines) {
        drawText(frame, tiny, line, x, y, this.signedIn ? 18 : 6);
        y += LINE;
      }
      const wide = drawButton(frame, x, y + 4, this.button.textContent, focus === this.button);
      cover(this.button, x, y + 6, wide + 1);
      return;
    }
    const room = INNER - measure(tiny, "Remove") - 8;
    for (const { pack, dive, remove } of this.rows) {
      let name = plain(pack.name);
      while (measure(tiny, name) > room) name = name.slice(0, -1);
      const end = drawText(frame, tiny, name, x, y, focus === dive ? 7 : 6);
      if (focus === dive) for (let i = x; i < end - 1; i++) frame.put(i, y + 6, 6);
      const doomed = this.doomed === pack.id;
      drawText(frame, tiny, doomed ? "Sure?" : "Remove", x + INNER, y, doomed ? 18 : focus === remove ? 7 : 5, true);
      cover(dive, x, y, room + 4);
      cover(remove, x + room + 4, y, INNER - room - 4);
      y += ROW;
    }
    if (this.rows.length) y += 3;
    const wide = drawButton(frame, x, y, "Add a pack", focus === this.file);
    cover(this.file, x, y + 2, wide + 1);
  }
}
