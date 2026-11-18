import { AIR_MAX, AIR_MIN, MAX_PLAYERS, ROOM_CODE_LENGTH, SUITS, type Refusal, type RoomPlayer, type RoomSettings, type RoomView } from "../../shared/room";
import { USERNAME_MAX, type PackSummary } from "../../shared/types";
import { formatMeters } from "../depth";
import type { RoomLog } from "./ending";
import { RoomClient, type Heard } from "../room";
import { RoomDive } from "../roomdive";
import type { Sound } from "../sound";
import { ascentSeconds, createGame, type Game } from "../state";
import type { AccountPanel } from "./account";
import { SUIT_COLORS, type Crew, type Turn } from "./scene";
import type { Part, Step, Ui } from "./ui";

/** Where in the panel a refusal is said: under the field it is about, before the last line, in the room's set-up, under "Copy the link" or under "Start the dive". */
type Where = "code" | "name" | "end" | "settings" | "copy" | "start";
const REFUSALS: Record<Refusal, [Where, string]> = {
  "no-room": ["code", "no room has that code"],
  full: ["code", `that room is full: a room holds ${MAX_PLAYERS} divers`],
  "name-taken": ["name", "someone in that room has that name: choose another"],
  "bad-name": ["name", `a name is 3 to ${USERNAME_MAX} letters or digits`],
  "bad-suit": ["end", "that suit is not one of the six"],
  "not-host": ["settings", "only the host sets up the room"],
  "bad-settings": ["settings", "the room cannot be set up that way"],
  "not-ready": ["start", "everyone has to be ready first"],
  "no-prompts": ["start", "these packs have no prompt with an answer for everyone: choose others"],
};
/** The air is set in steps of this many seconds. */
const AIR_STEP = 5;

/** How long "Copy the link" says the link was copied, in milliseconds. */
const COPIED_FOR = 2000;

/** "ben", "ben and cal", "ana, ben and cal". */
const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** Which packs a room plays: in a few words for the host's set-up, or in full for the others. */
function packsOf({ builtIn, ownPacks: { length } }: RoomSettings, full: boolean): string {
  if (!full) return builtIn ? (length ? `built-in + ${length}` : "built-in") : `${length} of yours`;
  if (!length) return "built-in packs";
  const own = `${length} of the host's ${length === 1 ? "pack" : "packs"}`;
  return builtIn ? `built-in packs + ${own}` : own;
}

/**
 * The multiplayer panel, opened from the title menu: make a room or join one by its code,
 * then wait in it with the others until everyone is ready. The host sets the room up.
 */
export class MultiplayerPanel {
  client = new RoomClient((message) => this.hear(message));
  private suit = 0;
  private busy = false;
  private refused: [Where, string] | null = null;
  /** Why the player is back at the first step. */
  private note = "";
  /** Whether the room is diving, and when the server last said how the dive stands, in seconds. */
  diving = false;
  private sent = 0;
  private dive = new RoomDive();
  /** What the player last sent as typed, on their turn. */
  private typed = "";
  /** The air the host has just set, until the room comes back with it. */
  private air: number | null = null;
  private packs: PackSummary[] = [];
  private copiedAt = -Infinity;
  /** The code of the room whose link opened the game, until it is joined. */
  private linked = "";
  /** Each diver's hearts in the dive, as the server last said. */
  private hearts = new Map<number, number>();
  /** Who was ready, by room code and id, as the server last said. */
  private ready = new Map<string, boolean>();
  /**
   * The room's dive that has just ended: its log, the diver the camera follows up, and when it ended and how long
   * the haul up takes, in seconds. At the surface the end screen opens; closing it goes back to the room.
   */
  ending: { log: RoomLog; follow: number; you: number; at: number; rise: number } | null = null;
  /** The room closed, or the connection was lost, while the end screen was open: closing it goes back to the first step. */
  private gone = false;

  constructor(
    private ui: Ui,
    private account: AccountPanel,
    private sound: Sound,
  ) {}

  show() {
    this.note = "";
    this.ui.go(this.first);
  }

  /** Opened from a room's link: the way into that room, its code filled in. */
  joinByLink(code: string) {
    this.show();
    this.linked = code;
    this.ui.go(this.join, "name");
  }

  /** The address that opens the way into a room. */
  private link(code: string): string {
    return `${location.origin}/?room=${code}`;
  }

  /** Called every frame: leaving the room's step leaves the room, and leaving multiplayer ends the connection. */
  update() {
    if (this.diving || this.ending) return;
    if (!this.ui.holds(this.first)) this.client.close();
    else if (this.client.view && !this.ui.holds(this.room)) this.client.leave();
  }

  /**
   * The divers to hang in the sea: in a dive, in its order, with the camera on the one whose turn it is and only their
   * lantern burning; before it, the room's, with the camera on the player's own; or the player's own alone while they make or join one.
   */
  crew(): Crew[] | null {
    if (this.ending) {
      // Every diver still in is hauled up their line, all of them reaching the surface together.
      const { log, follow, you } = this.ending;
      const left = 1 - this.risen();
      return log.divers.map((diver, slot) => {
        const out = diver.out !== null;
        return { slot, suit: diver.suit, name: diver.name, lit: !out, focus: diver.id === follow, depth: diver.depth * left, lamps: diver.lamps, label: diver.id !== you, out, hauled: true };
      });
    }
    const view = this.client.view;
    const dive = this.diving && view?.dive;
    if (dive) {
      const longest = view.settings.mode === "longest";
      return dive.divers.flatMap((diver, slot) => {
        const player = view.players.find((one) => one.id === diver.id);
        const turn = diver.id === dive.turn;
        const { depth, lamps } = diver;
        // One who has just gone out is still seen through the verdict, and hauled up when the turn passes.
        const out = diver.out && !turn;
        return player ? [{ slot, suit: player.suit, name: player.nickname, lit: turn, focus: turn, depth, lamps, label: diver.id !== view.you, hearts: longest ? diver.hearts : undefined, out }] : [];
      });
    }
    if (!this.ui.holds(this.first)) return null;
    if (!view) return [{ slot: 0, suit: this.suit, name: "", lit: true, focus: true, depth: 0 }];
    // The host has no ready of their own: starting the dive is it.
    return view.players.map((player, slot) => ({ slot, suit: player.suit, name: player.nickname, lit: player.host || player.ready, focus: player.id === view.you, depth: 0 }));
  }

  private open(step: () => Step) {
    this.refused = null;
    this.note = "";
    this.ui.go(step);
  }

  /** How far the haul up at the end of a dive has come, from 0 to 1, gently at both ends. */
  private risen(): number {
    const t = Math.min(1, (performance.now() / 1000 - this.ending!.at) / this.ending!.rise);
    return t * t * (3 - 2 * t);
  }

  /** Whether the divers are back at the surface after a dive, so that the end screen opens. */
  get surfaced(): boolean {
    return !!this.ending && this.risen() === 1;
  }

  /** Close the end screen of a dive, once it is open, and go back to the room, or out of it if it is gone. */
  closeEnding() {
    if (!this.ending || performance.now() / 1000 - this.ending.at < this.ending.rise + 1) return;
    this.ending = null;
    this.ui.go(this.first);
    if (this.gone) this.gone = false;
    else this.ui.go(this.room);
  }

  /** The dive of the room as a game the scene can draw, while there is one; at its end, the depth unwinding as the divers come up. */
  game(now: number): Game | null {
    if (this.ending) {
      const { log, follow } = this.ending;
      const depth = (log.divers.find((diver) => diver.id === follow)?.depth ?? 0) * (1 - this.risen());
      return { ...createGame(), phase: "ascent", depth };
    }
    const dive = this.diving && this.client.view?.dive;
    if (!this.yours) this.typed = "";
    return dive ? this.dive.update(dive, this.sent, now) : null;
  }

  /** What the words of the dive need beyond those of single player. */
  turn(): Turn | null {
    const view = this.client.view;
    const dive = this.diving && view?.dive;
    if (!view || !dive) return null;
    const mine = dive.divers.find((diver) => diver.id === view.you);
    const own = dive.turn === view.you ? undefined : mine;
    const counted = view.settings.mode === "longest" && mine && !mine.out;
    const watching = view.players.filter((player) => !dive.order.includes(player.id)).length;
    return {
      air: view.settings.air,
      yours: this.yours,
      taken: dive.taken,
      refusedTaken: !!dive.refused?.taken,
      depth: own?.depth ?? null,
      watching,
      watcher: !dive.order.includes(view.you),
      hearts: counted ? mine.hearts : null,
      bar: mine?.bar ?? 0,
    };
  }

  /** Whether it is the player's turn to answer, and an answer is wanted. */
  get yours(): boolean {
    const view = this.client.view;
    return !!view?.dive && this.diving && view.dive.turn === view.you && !view.dive.verdict;
  }

  type(text: string) {
    if (!this.yours || text === this.typed) return;
    this.typed = text;
    this.client.send({ type: "typing", text });
  }

  /** Send an answer to be judged. Says whether it was sent. */
  answer(text: string): boolean {
    if (!this.yours || this.client.view!.dive!.judging || !text.trim()) return false;
    this.client.send({ type: "answer", text });
    this.typed = "";
    return true;
  }

  /** Leave the dive, and with it the room. */
  leaveDive() {
    this.diving = false;
    this.client.close();
    this.ui.close();
  }

  private hear(message: Heard) {
    this.busy = false;
    const entering = this.ui.top === this.create || this.ui.top === this.join;
    if (message.type === "room") {
      this.air = null;
      this.sent = performance.now() / 1000;
      // A dive takes the screen as it begins, and gives it back to the room when it ends.
      const diving = message.room.dive !== null;
      this.hearLanterns(message.room, diving !== this.diving);
      this.hearHearts(message.room);
      if (diving !== this.diving) {
        this.diving = diving;
        this.refused = null;
        if (diving) {
          this.dive.reset();
          this.ui.close();
        } else if (message.room.last) {
          this.ending = this.endingOf(message.room);
        } else {
          this.ui.go(this.first);
          this.ui.go(this.room);
        }
        return;
      }
      if (!entering) return;
      // The room is made or joined: it takes the place of the step that asked for it.
      this.refused = null;
      this.linked = "";
      this.ui.back();
      this.ui.go(this.room);
    } else if (message.type === "refused") {
      this.air = null;
      this.refused = REFUSALS[message.reason];
      const [where] = this.refused;
      if (where === "code" || where === "name") this.ui.focus(where);
    } else if (entering) {
      this.refused = ["end", "no answer came from the server: try again"];
    } else if (this.ending) {
      // The end screen stays open; closing it leads out of the room that is gone.
      this.note = message.type === "closed" ? "the room closed: its host left" : "the connection to the server was lost";
      this.gone = true;
    } else if (this.diving || this.ui.holds(this.room)) {
      this.note = message.type === "closed" ? "the room closed: its host left" : "the connection to the server was lost";
      if (this.diving) {
        this.diving = false;
        this.ui.close();
        this.ui.go(this.first);
      }
      while (this.ui.top !== this.first) this.ui.back();
    }
  }

  /** The end of the room's dive, as its end screen tells it. The camera follows the player's own diver up, or the winner for one who only watched. */
  private endingOf({ last, players, you }: RoomView): NonNullable<MultiplayerPanel["ending"]> {
    const divers = last!.divers.map((diver) => {
      const player = players.find((one) => one.id === diver.id);
      return { ...diver, name: player?.nickname ?? "", suit: player?.suit ?? 0 };
    });
    const follow = divers.some((diver) => diver.id === you) ? you : divers.find((diver) => diver.won)!.id;
    const rise = ascentSeconds(Math.max(...divers.map((diver) => diver.depth)));
    return { log: { mode: last!.mode, divers }, follow, you, at: performance.now() / 1000, rise };
  }

  /** A heart won in "longest" (a full bar) rings high, after the lamp that filled it. */
  private hearHearts({ dive }: RoomView) {
    const gained = dive?.divers.some((diver) => diver.hearts > (this.hearts.get(diver.id) ?? diver.hearts));
    if (gained) this.sound.heart();
    this.hearts = new Map(dive?.divers.map((diver) => [diver.id, diver.hearts]));
  }

  /** A lantern lit or put out in the room is heard, once for all that changed together; not as a dive begins or ends, which clears them all. */
  private hearLanterns({ code, players }: RoomView, quiet: boolean) {
    const key = (player: RoomPlayer) => `${code}:${player.id}`;
    const changed = players.filter((player) => this.ready.has(key(player)) && this.ready.get(key(player)) !== player.ready);
    if (changed.length && !quiet) this.sound.lantern(changed.some((player) => player.ready));
    this.ready = new Map(players.map((player) => [key(player), player.ready]));
  }

  private refusal(where: Where): Part[] {
    return this.refused?.[0] === where ? [{ kind: "note", text: this.refused[1], bad: true }] : [];
  }

  private enter(how: "create" | "join") {
    this.refused = null;
    this.busy = true;
    const you = { nickname: this.ui.value("name").trim(), suit: this.suit };
    this.client.send(how === "create" ? { type: "create", ...you } : { type: "join", code: this.ui.value("code"), ...you });
  }

  /** Put the room's link on the clipboard. Without a secure page (plain http to another machine) browsers keep the newer way closed. */
  private copy(code: string) {
    this.refused = null;
    const link = this.link(code);
    const done = () => (this.copiedAt = performance.now());
    const failed = () => (this.refused = ["copy", `the browser would not copy it: the code is ${code}`]);
    if (navigator.clipboard) return void navigator.clipboard.writeText(link).then(done, failed);
    const focused = document.activeElement as HTMLElement | null;
    const text = Object.assign(document.createElement("textarea"), { value: link });
    document.body.append(text);
    text.select();
    const copied = document.execCommand("copy");
    text.remove();
    focused?.focus();
    if (copied) done();
    else failed();
  }

  private start() {
    this.refused = null;
    this.client.send({ type: "start" });
  }

  private change(settings: Partial<RoomSettings>) {
    this.refused = null;
    this.client.send({ type: "settings", settings });
  }

  private first = (): Step => ({
    title: "Multiplayer",
    rows: [
      { kind: "press", id: "create", label: "Create a room", press: () => this.open(this.create) },
      { kind: "press", id: "join", label: "Join a room", press: () => this.open(this.join) },
      ...(this.note ? [{ kind: "note", text: this.note } as Part] : []),
    ],
  });

  /** The name and the suit, asked both to make a room and to join one. */
  private you(): Part[] {
    return [
      { kind: "field", id: "name", label: "Name", max: USERNAME_MAX, autocomplete: "nickname", start: this.account.account?.username },
      ...this.refusal("name"),
      { kind: "slider", id: "suit", label: "Suit", value: this.suit / (SUITS - 1), steps: SUITS - 1, colors: SUIT_COLORS, set: (value) => (this.suit = Math.round(value * (SUITS - 1))) },
      ...this.refusal("end"),
    ];
  }

  private create = (): Step => ({
    title: "Create a room",
    busy: this.busy,
    rows: [...this.you(), { kind: "press", id: "enter", label: "Create the room", press: () => this.enter("create") }],
  });

  private join = (): Step => ({
    title: "Join a room",
    busy: this.busy,
    rows: [
      { kind: "field", id: "code", label: "Room code", max: ROOM_CODE_LENGTH, autocomplete: "off", start: this.linked },
      ...this.refusal("code"),
      ...this.you(),
      { kind: "press", id: "enter", label: "Join the room", press: () => this.enter("join") },
    ],
  });

  private room = (): Step => {
    const view = this.client.view;
    if (!view) return { title: "Room", rows: [] };
    const you = view.players.find((player) => player.id === view.you)!;
    const waiting = view.players.filter((player) => !player.host && !player.ready).map((player) => player.nickname);
    // After a dive, how deep each diver went, and who won it.
    const depthOf = (id: number) => view.last?.divers.find((diver) => diver.id === id)?.depth;
    const rows: Part[] = view.players.map((player) => {
      const depth = depthOf(player.id);
      return {
        kind: "player",
        name: player.nickname,
        color: SUIT_COLORS[player.suit]!,
        note: [player.host ? "host" : player.ready ? "ready" : "", depth === undefined ? "" : formatMeters(depth)].filter(Boolean).join(" ~ "),
      };
    });
    const winners = view.players.filter((player) => view.last?.divers.some((diver) => diver.id === player.id && diver.won)).map((player) => player.nickname);
    if (view.last && winners.length) rows.push({ kind: "note", text: `${names(winners)} ${view.last.mode === "deepest" ? "went deepest" : "lasted longest"}` });
    rows.push({ kind: "gap" });
    if (you.host) {
      rows.push({ kind: "press", id: "start", label: "Start the dive", press: () => this.start() });
      const refused = this.refused?.[0] === "start" ? this.refused[1] : "";
      // Not ready is said for as long as somebody is not.
      const early = refused === REFUSALS["not-ready"][1];
      if (refused && (!early || waiting.length)) rows.push({ kind: "note", text: early ? `${refused}: waiting for ${names(waiting)}` : refused, bad: true });
      rows.push({ kind: "press", id: "setup", label: "Set up the room", press: () => this.open(this.setup) });
    } else {
      const { mode, air, judging } = view.settings;
      rows.push(
        {
          kind: "press",
          id: "ready",
          label: you.ready ? "Put it out" : "Light the lantern",
          says: you.ready ? "Put the lantern out: not ready" : "Light the lantern: ready",
          press: () => this.client.send({ type: "ready", ready: !you.ready }),
        },
        { kind: "note", text: `${mode} ~ ${air} s of air ~ ${packsOf(view.settings, true)}${judging ? " ~ live judging" : ""}` },
      );
    }
    const copy = () => this.copy(view.code);
    const copied = performance.now() - this.copiedAt < COPIED_FOR;
    rows.push(
      { kind: "press", id: "copy", label: copied ? "Link copied" : "Copy the link", says: `Copy the link to room ${view.code}`, press: copy },
      ...this.refusal("copy"),
      { kind: "press", id: "leave", label: "Leave the room", press: () => this.ui.back() },
    );
    return { title: "Room", code: { text: view.code, copy }, rows };
  };

  private setup = (): Step => {
    const settings = this.client.view?.settings;
    if (!settings) return { title: "Set up the room", rows: [] };
    const air = this.air ?? settings.air;
    const keyed = this.account.account?.keys.anthropic || this.account.account?.keys.jev;
    const mode = () => this.change({ mode: settings.mode === "deepest" ? "longest" : "deepest" });
    const judging = () => this.change({ judging: !settings.judging });
    return {
      title: "Set up the room",
      rows: [
        { kind: "press", id: "mode", label: "Mode", value: settings.mode === "deepest" ? "Deepest" : "Longest", press: mode, shift: mode },
        {
          kind: "slider",
          id: "air",
          label: "Air",
          value: air / AIR_MAX,
          steps: AIR_MAX / AIR_STEP,
          text: `${air} s`,
          set: (value) => {
            const next = Math.max(AIR_MIN, Math.round((value * AIR_MAX) / AIR_STEP) * AIR_STEP);
            if (next === air) return;
            this.air = next;
            this.change({ air: next });
          },
        },
        {
          kind: "press",
          id: "packs",
          label: "Packs",
          value: packsOf(settings, false),
          press: () => {
            if (this.account.account) void fetch("/api/packs").then(async (res) => res.ok && (this.packs = (await res.json()) as PackSummary[]));
            this.open(this.packsStep);
          },
        },
        keyed
          ? { kind: "press", id: "judging", label: "Live judging", value: settings.judging ? "on" : "off", on: settings.judging, press: judging, shift: judging }
          : { kind: "press", id: "judging", label: "Live judging", value: "off", on: false, quiet: true },
        ...(keyed ? [] : [{ kind: "note", text: "keep a key to judge unlisted answers" } as Part]),
        ...this.refusal("settings"),
      ],
    };
  };

  private packsStep = (): Step => {
    const settings = this.client.view?.settings;
    if (!settings) return { title: "Packs", rows: [] };
    // A room plays one pack at least, so the last one on stays on.
    const choose = (builtIn: boolean, ownPacks: string[]) => {
      if (builtIn || ownPacks.length) this.change({ builtIn, ownPacks });
      else this.refused = ["settings", "a room plays one pack at least"];
    };
    const own = settings.ownPacks;
    return {
      title: "Packs",
      rows: [
        { kind: "press", id: "builtin", label: "Built-in packs", value: settings.builtIn ? "on" : "off", on: settings.builtIn, press: () => choose(!settings.builtIn, own) },
        ...this.packs.map((pack): Part => {
          const on = own.includes(pack.id);
          return {
            kind: "press",
            id: `pack:${pack.id}`,
            label: pack.name,
            value: on ? "on" : "off",
            on,
            press: () => choose(settings.builtIn, on ? own.filter((id) => id !== pack.id) : [...own, pack.id]),
          };
        }),
        ...(this.account.account ? [] : [{ kind: "note", text: "sign in to play packs of your own" } as Part]),
        ...this.refusal("settings"),
      ],
    };
  };
}
