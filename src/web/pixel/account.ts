import { MAX_KEY_LENGTH, PASSWORD_MAX, USERNAME_MAX, type Account } from "../../shared/types";
import type { Part, Step, Ui } from "./ui";

/**
 * The panel for signing in, creating an account and signing out, opened from the title menu.
 * Signed in, it also takes the player's API key.
 */
export class AccountPanel {
  /** Who is signed in, once the server has said. */
  account: Account | null = null;
  private creating = false;
  private error = "";
  private busy = false;

  /** `changed` is called whenever the account is another one, or its key comes or goes. */
  constructor(
    private ui: Ui,
    private changed: () => void,
  ) {
    void fetch("/api/account")
      .then((res) => res.json() as Promise<Account | null>)
      .then((account) => {
        this.account = account;
        changed();
      });
  }

  /** Open the panel: on the account if signed in, otherwise to sign in or to create an account. */
  show(focus = "") {
    this.creating = false;
    this.error = "";
    this.ui.go(this.step, focus);
  }

  private step = (): Step => {
    const account = this.account;
    const refusal: Part[] = this.error ? [{ kind: "note", text: this.error, bad: true }] : [];
    if (account) {
      const about = account.key ? "A key is kept. Type a new one to replace it" : "An Anthropic key lets Claude write packs for you";
      return {
        title: account.username,
        busy: this.busy,
        rows: [
          // Not a password field, or the browser would offer the account's password for it. It is drawn as dots anyway.
          { kind: "field", id: "key", label: "API key", max: MAX_KEY_LENGTH, dots: true, autocomplete: "off" },
          ...(refusal.length ? refusal : [{ kind: "note", text: about } as Part]),
          [
            { kind: "press", id: "keep", label: "Keep key", press: () => void this.setKey({ method: "PUT", body: JSON.stringify({ key: this.ui.value("key") }) }) },
            ...(account.key ? [{ kind: "press", id: "forget", label: "Forget key", press: () => void this.setKey({ method: "DELETE" }) } as Part] : []),
          ],
          { kind: "gap" },
          { kind: "press", id: "leave", label: "Sign out", press: () => void this.send() },
        ],
      };
    }
    return {
      title: this.creating ? "New account" : "Sign in",
      busy: this.busy,
      rows: [
        { kind: "field", id: "username", label: "Name", max: USERNAME_MAX, autocomplete: "username" },
        { kind: "field", id: "password", label: "Password", max: PASSWORD_MAX, dots: true, password: true, autocomplete: this.creating ? "new-password" : "current-password" },
        ...refusal,
        { kind: "gap" },
        { kind: "press", id: "send", label: this.creating ? "Create account" : "Sign in", submit: true, press: () => void this.send() },
        {
          kind: "press",
          id: "other",
          label: this.creating ? "Have an account? Sign in" : "New here? Create an account",
          press: () => {
            this.creating = !this.creating;
            this.error = "";
          },
        },
      ],
    };
  };

  /** Ask the server for a change to the account. Its refusal, if any, is shown in the panel. */
  private async ask(path: string, request: RequestInit): Promise<Response | null> {
    if (this.busy) return null;
    this.busy = true;
    const res = await fetch(`/api/account/${path}`, request);
    this.busy = false;
    this.error = res.ok ? "" : ((await res.json()) as { error: string }).error;
    return res.ok ? res : null;
  }

  /** Keep the key that was typed, or forget the one that is kept. */
  private async setKey(request: RequestInit) {
    const res = await this.ask("key", request);
    if (!res) return;
    this.account = (await res.json()) as Account;
    this.ui.clear("key");
    this.ui.focus("key");
    this.changed();
  }

  /** Sign in, create the account, or sign out: whichever the panel is showing. */
  private async send() {
    const leaving = this.account !== null;
    const res = await this.ask(leaving ? "signout" : this.creating ? "signup" : "signin", {
      method: "POST",
      body: leaving ? null : JSON.stringify({ username: this.ui.value("username"), password: this.ui.value("password") }),
    });
    if (!res) return;
    this.account = leaving ? null : ((await res.json()) as Account);
    this.ui.clear("password");
    this.changed();
    // Signed in, the player goes back to where they came from; signed out, to the title.
    if (leaving) this.ui.close();
    else if (this.ui.top === this.step) this.ui.back();
  }
}
