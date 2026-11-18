import { MAX_KEY_LENGTH, PASSWORD_MAX, PROVIDERS, USERNAME_MAX, type Account, type KeyFailure, type Provider } from "../../shared/types";
import type { Part, Step, Ui } from "./ui";

/** What each key is called, and what keeping one is good for. */
const KEYS: Record<Provider, { name: string; use: string }> = {
  anthropic: { name: "Anthropic key", use: "An Anthropic key lets Claude write packs, and judge answers the packs miss" },
  jev: { name: "Jev key", use: "A Jev key lets Jev judge answers the packs miss" },
};

/** How a key's last failure is told: after its line, in its step, and at the title. */
const FAILURES: Record<KeyFailure, { short: string; what: string; fix: string }> = {
  refused: { short: "refused", what: "was refused", fix: "check it, or type a new one" },
  limited: { short: "at its limit", what: "hit its limit", fix: "check its credit and rate limit" },
  unanswered: { short: "no answer", what: "got no answer", fix: "the service may have been down" },
};

/**
 * The panel for signing in, creating an account and signing out, opened from the title menu.
 * Signed in, it also takes the player's API keys, each in a step of its own.
 */
export class AccountPanel {
  /** Who is signed in, once the server has said. */
  account: Account | null = null;
  /** Settled once the server has said who is signed in. */
  loaded: Promise<void>;
  private creating = false;
  private error = "";
  private busy = false;

  /** `changed` is called whenever the account is another one, or its key comes or goes. */
  constructor(
    private ui: Ui,
    private changed: () => void,
  ) {
    this.loaded = fetch("/api/account")
      .then((res) => res.json() as Promise<Account | null>)
      .then((account) => {
        this.account = account;
        changed();
      });
  }

  /** Ask the server again who is signed in and how their keys last went, as after a dive, which may have used them. */
  refresh() {
    if (this.busy) return;
    void fetch("/api/account")
      .then((res) => res.json() as Promise<Account | null>)
      .then((account) => {
        const other = account?.username !== this.account?.username;
        this.account = account;
        if (other) this.changed();
      });
  }

  /** What the title menu says when keys failed the last time they were used. Short, to fit under the menu on a low screen. */
  trouble(): string | undefined {
    const failed = PROVIDERS.filter((provider) => this.account?.failed[provider]).length;
    if (failed) return `Your ${failed > 1 ? "keys" : "key"} failed: see Account`;
  }

  /** Open the panel: on the account if signed in (or on one of its keys), otherwise to sign in or to create an account. */
  show(key?: Provider) {
    this.creating = false;
    this.error = "";
    this.ui.go(key && this.account ? this.keys[key] : this.step);
  }

  private keyStep(provider: Provider): Step {
    const kept = this.account?.keys[provider];
    const failed = this.account?.failed[provider];
    const field = `${provider}-key`;
    const trouble = failed && `It ${FAILURES[failed].what} when it last judged an answer: ${FAILURES[failed].fix}`;
    const about = kept ? "A key is kept. Type a new one to replace it" : KEYS[provider].use;
    return {
      title: KEYS[provider].name,
      busy: this.busy,
      rows: [
        // Not a password field, or the browser would offer the account's password for it. It is drawn as dots anyway.
        { kind: "field", id: field, label: "API key", max: MAX_KEY_LENGTH, dots: true, autocomplete: "off" },
        { kind: "note", text: this.error || trouble || about, bad: this.error !== "" || !!trouble },
        [
          { kind: "press", id: "keep", label: "Keep key", press: () => void this.setKey(provider, { method: "PUT", body: JSON.stringify({ key: this.ui.value(field) }) }) },
          ...(kept ? [{ kind: "press", id: "forget", label: "Forget key", press: () => void this.setKey(provider, { method: "DELETE" }) } as Part] : []),
        ],
      ],
    };
  }

  private keys: Record<Provider, () => Step> = { anthropic: () => this.keyStep("anthropic"), jev: () => this.keyStep("jev") };

  private step = (): Step => {
    const account = this.account;
    const refusal: Part[] = this.error ? [{ kind: "note", text: this.error, bad: true }] : [];
    if (account) {
      return {
        title: account.username,
        busy: this.busy,
        rows: [
          ...PROVIDERS.map((provider): Part => ({
            kind: "press",
            id: provider,
            label: `${KEYS[provider].name}${account.failed[provider] ? ` ~ ${FAILURES[account.failed[provider]].short}` : account.keys[provider] ? " ~ kept" : ""}`,
            press: () => {
              this.error = "";
              this.ui.go(this.keys[provider]);
            },
          })),
          ...refusal,
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
  private async setKey(provider: Provider, request: RequestInit) {
    const res = await this.ask(`key/${provider}`, request);
    if (!res) return;
    this.account = (await res.json()) as Account;
    this.ui.clear(`${provider}-key`);
    this.ui.focus(`${provider}-key`);
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
