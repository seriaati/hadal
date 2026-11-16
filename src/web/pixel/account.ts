import type { Account } from "../../shared/types";
import { FONTS, drawText, measure, wrap } from "./font";
import type { Frame } from "./frame";
import { centre, drawPanel } from "./settings";

const WIDTH = 140;
const PAD = 7;
/** Where the typed text of a field begins, from the left of the panel's writing. */
const FIELD = 40;
const INNER = WIDTH - 2 * PAD;

/**
 * The panel for signing in, creating an account and signing out, opened from the title menu.
 * The form itself is real but invisible, so the browser can fill in and save the password and
 * Tab, Enter and taps work as in any form; this draws it on the pixel grid and lays each
 * invisible control over its drawing.
 */
export class AccountPanel {
  /** Who is signed in, once the server has said. */
  account: Account | null = null;
  private creating = false;
  private error = "";
  private busy = false;
  private name: HTMLInputElement;
  private password: HTMLInputElement;
  private submit: HTMLButtonElement;
  private other: HTMLButtonElement;

  /** `back` is what takes the typing while the panel is closed. */
  constructor(
    private form: HTMLFormElement,
    private back: HTMLElement,
  ) {
    const find = <T extends HTMLElement>(name: string) => form.querySelector<T>(`[name=${name}]`)!;
    this.name = find("username");
    this.password = find("password");
    this.submit = find("send");
    this.other = find("other");
    void fetch("/api/account")
      .then((res) => res.json() as Promise<Account | null>)
      .then((account) => (this.account = account));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send();
    });
    this.other.addEventListener("click", () => this.show(!this.creating));
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
      if (event.key !== "Tab") return;
      // Tab goes round the panel and never out of it.
      event.preventDefault();
      const stops = this.account ? [this.submit] : [this.name, this.password, this.other];
      const next = stops.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1);
      stops[(next + stops.length) % stops.length]!.focus();
    });
  }

  get open(): boolean {
    return !this.form.hidden;
  }

  /** Open the panel: to sign out if signed in, otherwise to sign in or to create an account. */
  show(creating = false) {
    const signedIn = this.account !== null;
    this.creating = creating;
    this.error = "";
    this.form.hidden = false;
    this.name.hidden = this.password.hidden = this.other.hidden = signedIn;
    this.password.autocomplete = creating ? "new-password" : "current-password";
    this.submit.textContent = signedIn ? "Sign out" : creating ? "Create account" : "Sign in";
    this.other.textContent = creating ? "Have an account? Sign in" : "New here? Create an account";
    (signedIn ? this.submit : this.name).focus();
  }

  close() {
    this.form.hidden = true;
    this.password.value = "";
    this.back.focus();
  }

  private async send() {
    if (this.busy) return;
    this.busy = true;
    const leaving = this.account !== null;
    const res = await fetch(`/api/account/${leaving ? "signout" : this.creating ? "signup" : "signin"}`, {
      method: "POST",
      body: leaving ? null : JSON.stringify({ username: this.name.value, password: this.password.value }),
    });
    this.busy = false;
    if (!res.ok) {
      this.error = ((await res.json()) as { error: string }).error;
      return;
    }
    this.account = leaving ? null : ((await res.json()) as Account);
    this.close();
  }

  private get height(): number {
    return this.account ? 37 : 93;
  }

  /** A press at a point of the frame: outside the panel, it closes it. */
  press(frame: Frame, x: number, y: number) {
    const { left, top } = centre(frame, WIDTH, this.height);
    if (x < left || x >= left + WIDTH || y < top || y >= top + this.height) this.close();
  }

  /** `scale` is how many screen pixels one pixel of the frame takes. */
  draw(frame: Frame, scale: number, time: number) {
    if (!this.open) return;
    const { tiny } = FONTS;
    const { left, top } = centre(frame, WIDTH, this.height);
    const x = left + PAD;
    const focus = document.activeElement;
    const cover = (control: HTMLElement, y: number, width = INNER) =>
      Object.assign(control.style, { left: `${x * scale}px`, top: `${(y - 4) * scale}px`, width: `${width * scale}px`, height: `${13 * scale}px` });

    drawPanel(frame, WIDTH, this.height);
    drawText(frame, tiny, this.account?.username ?? (this.creating ? "New account" : "Sign in"), x, top + PAD, 7);
    let y = top + PAD + 14;
    if (!this.account) {
      for (const field of [this.name, this.password]) {
        const on = focus === field;
        const from = x + FIELD;
        const caret = field.selectionStart ?? 0;
        let caretX = from;
        drawText(frame, tiny, field.ariaLabel!, x, y, on ? 7 : 6);
        if (field === this.password) {
          // A password is a row of dots, as many as fit.
          const dots = Math.min(field.value.length, Math.floor((INNER - FIELD) / 4));
          for (let i = 0; i < dots; i++) for (let j = 0; j < 4; j++) frame.put(from + i * 4 + (j & 1), y + 2 + (j >> 1), 7);
          caretX += Math.min(caret, dots) * 4;
        } else {
          drawText(frame, tiny, field.value, from, y, 7);
          if (caret) caretX += measure(tiny, field.value.slice(0, caret)) + 1;
        }
        for (let i = from; i < x + INNER; i++) frame.put(i, y + 7, on ? 6 : 4);
        if (on && Math.floor(time * 2.5) % 2 === 0) for (let j = -1; j < 6; j++) frame.put(caretX, y + j, 16);
        cover(field, y);
        y += 14;
      }
      wrap(tiny, this.error, INNER).forEach((line, i) => drawText(frame, tiny, line, x, y - 1 + i * 8, 18));
      y += 17;
    }
    // The button is its label in a box. No Enter key is drawn: there is nothing here to choose between.
    const label = this.submit.textContent;
    const wide = measure(tiny, label) + 7;
    for (let i = 1; i < wide; i++) {
      frame.put(x + i, y, 6);
      frame.put(x + i, y + 8, 5);
    }
    for (let j = 1; j < 8; j++) {
      frame.put(x, y + j, 6);
      frame.put(x + wide, y + j, 5);
    }
    drawText(frame, tiny, label, x + 4, y + 2, 7);
    cover(this.submit, y + 2, wide + 1);
    if (this.account) return;
    y += 15;
    const end = drawText(frame, tiny, this.other.textContent, x, y, focus === this.other ? 7 : 6);
    if (focus === this.other) for (let i = x; i < end - 1; i++) frame.put(i, y + 7, 6);
    cover(this.other, y);
  }
}
