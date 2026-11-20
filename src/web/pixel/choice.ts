import type { PackSummary } from "../../shared/types";
import { t } from "../language";
import type { Chosen } from "../state";
import type { AccountPanel } from "./account";
import type { Part, Step, Ui } from "./ui";

/** The packs to choose from, those chosen, and how a change is made: the same in a room's set-up and in a custom dive. */
export type PackChoice = { builtIn: PackSummary[]; own: PackSummary[]; chosen: Chosen; signedIn: boolean; choose: (changes: Partial<Chosen>) => void };

export function packRows({ builtIn, own, chosen, signedIn, choose }: PackChoice, openBuiltIn: () => void): Part[] {
  const words = t().rooms;
  const built = chosen.builtIn.length;
  const all = builtIn.length;
  // Left and Right turn them all on, or all off.
  const flip = () => choose({ builtIn: built === all ? [] : builtIn.map((pack) => pack.id) });
  return [
    {
      kind: "press",
      id: "builtin",
      label: words.builtIn,
      value: built === all ? words.all : built ? t().count(built, all) : words.none,
      on: built > 0,
      press: openBuiltIn,
      shift: flip,
    },
    ...own.map((pack): Part => {
      const on = chosen.own.includes(pack.id);
      return {
        kind: "press",
        id: `pack:${pack.id}`,
        label: pack.name,
        value: on ? words.on : words.off,
        on,
        press: () => choose({ own: on ? chosen.own.filter((id) => id !== pack.id) : [...chosen.own, pack.id] }),
      };
    }),
    ...(signedIn ? [] : [{ kind: "note", text: words.signInForOwn } as Part]),
  ];
}

export function builtInRows({ builtIn, chosen, choose }: PackChoice): Part[] {
  const words = t().rooms;
  const all = chosen.builtIn.length === builtIn.length;
  return [
    { kind: "press", id: "builtin:all", label: words.allLine, value: all ? words.on : words.off, on: all, press: () => choose({ builtIn: all ? [] : builtIn.map((pack) => pack.id) }) },
    ...builtIn.map((pack): Part => {
      const on = chosen.builtIn.includes(pack.id);
      return {
        kind: "press",
        id: `builtin:${pack.id}`,
        label: pack.name,
        value: on ? words.on : words.off,
        on,
        press: () => choose({ builtIn: on ? chosen.builtIn.filter((id) => id !== pack.id) : [...chosen.builtIn, pack.id] }),
      };
    }),
  ];
}

/** A single player's dive from the packs they choose. The choice lasts until the page is closed. */
export class CustomPanel {
  private builtIn: PackSummary[] = [];
  private own: PackSummary[] = [];
  /** Null until the player chooses: every built-in pack of their language. */
  private builtInIds: string[] | null = null;
  private ownIds: string[] = [];
  private refused = false;

  constructor(
    private ui: Ui,
    private account: AccountPanel,
    private dive: (packs: Chosen, chaos: boolean) => void,
  ) {}

  show() {
    this.refused = false;
    // Asked each time: the language, and with it the built-in packs, may have changed, and packs may have been added.
    void fetch("/api/builtin").then(async (res) => res.ok && (this.builtIn = (await res.json()) as PackSummary[]));
    if (this.account.account) void fetch("/api/packs").then(async (res) => res.ok && (this.own = (await res.json()) as PackSummary[]));
    else this.own = [];
    this.ui.go(this.step);
  }

  /** Only packs still on offer count: another language's, or a pack since removed, are not. */
  private choice(): PackChoice {
    const offered = (packs: PackSummary[], ids: string[]) => ids.filter((id) => packs.some((pack) => pack.id === id));
    return {
      builtIn: this.builtIn,
      own: this.own,
      chosen: { builtIn: offered(this.builtIn, this.builtInIds ?? this.builtIn.map((pack) => pack.id)), own: offered(this.own, this.ownIds) },
      signedIn: !!this.account.account,
      choose: ({ builtIn, own }) => {
        this.refused = false;
        if (builtIn) this.builtInIds = builtIn;
        if (own) this.ownIds = own;
      },
    };
  }

  private start(chaos: boolean) {
    const { chosen } = this.choice();
    if (!chosen.builtIn.length && !chosen.own.length) return void (this.refused = true);
    this.dive(chosen, chaos);
  }

  private step = (): Step => {
    const words = t().single;
    return {
      title: words.custom,
      rows: packRows(this.choice(), () => this.ui.go(this.builtInStep)),
      foot: [
        { kind: "gap" },
        [
          { kind: "press", id: "custom:descend", label: words.descend, press: () => this.start(false) },
          { kind: "press", id: "custom:chaos", label: words.chaos, press: () => this.start(true) },
        ],
        ...(this.refused ? [{ kind: "note", text: words.noPacks, bad: true } as Part] : []),
      ],
    };
  };

  private builtInStep = (): Step => ({ title: t().rooms.builtIn, rows: builtInRows(this.choice()) });
}
