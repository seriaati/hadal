import { MAX_KEY_LENGTH, PASSWORD_MAX, PROVIDERS, USERNAME_MAX, type Account, type Provider } from "../../shared/types";
import { t } from "../language";
import type { Part, Step, Ui } from "./ui";

export class AccountPanel {
  account: Account | null = null;
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

  /** Called after a dive too, which may have used the keys and changed how they last went. */
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
    if (failed) return t().account.trouble(failed);
  }

  show(key?: Provider) {
    this.creating = false;
    this.error = "";
    this.ui.go(key && this.account ? this.keys[key] : this.step);
  }

  private keyStep(provider: Provider): Step {
    const kept = this.account?.keys[provider];
    const failed = this.account?.failed[provider];
    const field = `${provider}-key`;
    const words = t().account;
    const trouble = failed && words.failed(words.failures[failed].what, words.failures[failed].fix);
    const about = kept ? words.kept : words.keys[provider].use;
    return {
      title: words.keys[provider].name,
      busy: this.busy,
      rows: [
        // Not a password field, or the browser would offer the account's password for it. It is drawn as dots anyway.
        { kind: "field", id: field, label: words.apiKey, max: MAX_KEY_LENGTH, dots: true, autocomplete: "off" },
        { kind: "note", text: this.error || trouble || about, bad: this.error !== "" || !!trouble },
        [
          { kind: "press", id: "keep", label: words.keep, press: () => void this.setKey(provider, { method: "PUT", body: JSON.stringify({ key: this.ui.value(field) }) }) },
          ...(kept ? [{ kind: "press", id: "forget", label: words.forget, press: () => void this.setKey(provider, { method: "DELETE" }) } as Part] : []),
        ],
      ],
    };
  }

  private keys: Record<Provider, () => Step> = { anthropic: () => this.keyStep("anthropic"), jev: () => this.keyStep("jev") };

  private step = (): Step => {
    const account = this.account;
    const words = t().account;
    const refusal: Part[] = this.error ? [{ kind: "note", text: this.error, bad: true }] : [];
    if (account) {
      return {
        title: account.username,
        busy: this.busy,
        rows: [
          ...PROVIDERS.map((provider): Part => ({
            kind: "press",
            id: provider,
            label: `${words.keys[provider].name}${account.failed[provider] ? ` ~ ${words.failures[account.failed[provider]].short}` : account.keys[provider] ? ` ~ ${words.keptShort}` : ""}`,
            press: () => {
              this.error = "";
              this.ui.go(this.keys[provider]);
            },
          })),
          ...refusal,
          { kind: "gap" },
          { kind: "press", id: "leave", label: words.signOut, press: () => void this.send() },
        ],
      };
    }
    return {
      title: this.creating ? words.newAccount : words.signIn,
      busy: this.busy,
      rows: [
        { kind: "field", id: "username", label: words.name, max: USERNAME_MAX, autocomplete: "username" },
        { kind: "field", id: "password", label: words.password, max: PASSWORD_MAX, dots: true, password: true, autocomplete: this.creating ? "new-password" : "current-password" },
        ...refusal,
        { kind: "gap" },
        { kind: "press", id: "send", label: this.creating ? words.create : words.signIn, submit: true, press: () => void this.send() },
        {
          kind: "press",
          id: "other",
          label: this.creating ? words.haveOne : words.newHere,
          press: () => {
            this.creating = !this.creating;
            this.error = "";
          },
        },
      ],
    };
  };

  private async ask(path: string, request: RequestInit): Promise<Response | null> {
    if (this.busy) return null;
    this.busy = true;
    const res = await fetch(`/api/account/${path}`, request);
    this.busy = false;
    this.error = res.ok ? "" : ((await res.json()) as { error: string }).error;
    return res.ok ? res : null;
  }

  private async setKey(provider: Provider, request: RequestInit) {
    const res = await this.ask(`key/${provider}`, request);
    if (!res) return;
    this.account = (await res.json()) as Account;
    this.ui.clear(`${provider}-key`);
    this.ui.focus(`${provider}-key`);
    this.changed();
  }

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
