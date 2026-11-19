import { AIR_MAX, AIR_MIN, BAR_FULL, HEARTS, MODES, ROOM_CODE_LENGTH, SUITS, type Gone, type Refusal, type RoomPlayer, type RoomSettings, type RoomView } from "../../shared/room";
import { USERNAME_MAX, type PackSummary } from "../../shared/types";
import { formatMeters } from "../depth";
import { t } from "../language";
import type { RoomLog } from "./ending";
import { RoomClient, type Heard } from "../room";
import { RoomDive } from "../roomdive";
import type { Sound } from "../sound";
import { LOST_SECONDS, ascentSeconds, createGame, type Game } from "../state";
import type { AccountPanel } from "./account";
import { builtInRows, packRows, type PackChoice } from "./choice";
import { CROWN_SECONDS, GLINT_SECONDS, GOING_SECONDS, SUIT_COLORS, type Crew, type Turn } from "./scene";
import type { Part, Step, Ui } from "./ui";

/** Where in the panel a refusal is said: under the field it is about, before the last line, in the room's set-up, under "Copy the link" or under "Start the dive". */
type Where = "code" | "name" | "end" | "settings" | "copy" | "start";
const REFUSALS: Record<Refusal, Where> = {
  "no-room": "code",
  full: "code",
  "name-taken": "name",
  "bad-name": "name",
  "bad-suit": "end",
  "not-host": "settings",
  "bad-settings": "settings",
  "not-ready": "start",
  "no-packs": "start",
  "no-prompts": "start",
  banned: "code",
};

/** The air is set in steps of this many seconds. */
const AIR_STEP = 5;

/** How long "Copy the link" says the link was copied, in milliseconds. */
const COPIED_FOR = 2000;

/** Which packs a room plays, out of `all` built-in ones: in a few words for the host's set-up, or in full for the others. */
function packsOf({ builtIn: { length: built }, ownPacks: { length: own } }: RoomSettings, all: number, full: boolean): string {
  const some = built && built === all ? "all" : built;
  return full ? t().rooms.packsFull(some, own) : t().rooms.packsShort(some, own);
}

export class MultiplayerPanel {
  client = new RoomClient((message) => this.hear(message));
  private suit = 0;
  private busy = false;
  private refused: [Where, string] | null = null;
  /** Why the player is back at the first step. */
  private note = "";
  /** `sent` is when the server last said how the dive stands, in seconds. */
  diving = false;
  private sent = 0;
  private dive = new RoomDive();
  /** What the player last sent as typed, on their turn. */
  private typed = "";
  /** The turn ("round:diver") whose air ran out on the player's own clock. */
  private spent = "";
  /** The air the host has just set, until the room comes back with it. */
  private air: number | null = null;
  private packs: PackSummary[] = [];
  private builtIn: PackSummary[] = [];
  private copiedAt = -Infinity;
  /** The code of the room whose link opened the game, until it is joined. */
  private linked = "";
  /** Each diver's hearts in the dive, as the server last said. */
  private hearts = new Map<number, number>();
  /** The player whose step the host has open, and which of "Remove" and "Ban" one more press does. */
  private picked: number | null = null;
  private doomed: "" | "remove" | "ban" = "";
  /** Divers who have just gone out of the room, as they were last seen, how they went and when, in seconds. */
  private ghosts: { crew: Crew; how: Gone; at: number }[] = [];
  /** The divers as last shown, so that one who goes is seen off from where they were. */
  private shown: Crew[] = [];
  /** The room's host as the server last said, and the last time the crown passed: to whom, from whom, and when. */
  private host: { code: string; id: number; name: string } | null = null;
  private crowned: { id: number; from: string; at: number } | null = null;
  /** Who was ready, by room code and id, as the server last said. */
  private ready = new Map<string, boolean>();
  /**
   * The room's dive that has just ended: its log, the diver the camera follows up, and when it ended and how long
   * the haul up takes, in seconds. At the surface the end screen opens; closing it goes back to the room.
   */
  ending: { log: RoomLog; follow: number; you: number; at: number; rise: number } | null = null;
  /** The player was taken out of the room, or the connection was lost, while the end screen was open: closing it goes back to the first step. */
  private gone = false;
  /**
   * The player's own chaos dive was lost: when, in seconds, and the dive and divers as they were then. Until its last
   * words are said the player sees that moment, then they watch the rest of the dive.
   */
  private lost: { at: number; game: Game; crew: Crew[] } | null = null;

  constructor(
    private ui: Ui,
    private account: AccountPanel,
    private sound: Sound,
  ) {}

  show() {
    this.note = "";
    // Asked each time: the language, and with it the built-in packs, may have changed.
    void fetch("/api/builtin").then(async (res) => res.ok && (this.builtIn = (await res.json()) as PackSummary[]));
    this.ui.go(this.first);
  }

  joinByLink(code: string) {
    this.show();
    this.linked = code;
    this.ui.go(this.join, "name");
  }

  private link(code: string): string {
    return `${location.origin}/?room=${code}`;
  }

  /** Called every frame: leaving the room's step leaves the room, and leaving multiplayer ends the connection. */
  update() {
    if (this.diving || this.ending) return;
    if (!this.ui.holds(this.first)) this.client.close();
    else if (this.client.view && !this.ui.holds(this.room)) this.client.leave();
    // The player has left, or the crown has passed: their step has nothing more to do.
    const view = this.client.view;
    const host = view?.players.find((player) => player.id === view.you)?.host;
    if (this.ui.top === this.playerStep && (!host || !view!.players.some((player) => player.id === this.picked))) this.ui.back();
  }

  /**
   * The divers to hang in the sea: in a dive, in its order, with the camera on the one whose turn it is and only their
   * lantern burning; before it, the room's, with the camera on the player's own; or the player's own alone while they make or join one.
   */
  crew(): Crew[] | null {
    if (this.dying) return this.lost!.crew;
    const view = this.client.view;
    if (this.ending) {
      // Every diver still in is hauled up their line, all of them reaching the surface together.
      const { log, follow, you } = this.ending;
      const left = 1 - this.risen();
      return log.divers.map((diver, slot) => {
        const out = diver.out !== null;
        const host = view?.players.find((player) => player.id === diver.id)?.host;
        return { slot, suit: diver.suit, name: diver.name, lit: !out, focus: diver.id === follow, depth: diver.depth * left, lamps: diver.lamps, label: diver.id !== you, out, hauled: true, host };
      });
    }
    const dive = this.diving && view?.dive;
    if (dive) {
      const longest = view.settings.mode === "longest";
      const divers = dive.divers.flatMap((diver, slot): Crew[] => {
        const player = view.players.find((one) => one.id === diver.id);
        const turn = diver.id === dive.turn;
        const { depth, lamps } = diver;
        // One who has just gone out is still seen through the verdict, and hauled up when the turn passes.
        const out = diver.out && !turn;
        const crowned = this.crownedOf(diver.id);
        return player ? [{ slot, suit: player.suit, name: player.nickname, lit: turn, focus: turn, depth, lamps, label: diver.id !== view.you, hearts: longest ? diver.hearts : undefined, out, host: player.host, crowned }] : [];
      });
      return this.place(divers);
    }
    if (!this.ui.holds(this.first)) return null;
    if (!view) return [{ slot: 0, suit: this.suit, name: "", lit: true, focus: true, depth: 0 }];
    // The host has no ready of their own: starting the dive is it.
    return this.place(
      view.players.map((player, slot) => ({ slot, suit: player.suit, name: player.nickname, lit: player.host || player.ready, focus: player.id === view.you, depth: 0, host: player.host, crowned: this.crownedOf(player.id) })),
    );
  }

  /** Each diver's place along the boat: one going keeps theirs until they are gone, and those after them then slide over. */
  private place(crew: Crew[]): Crew[] {
    const now = performance.now() / 1000;
    this.ghosts = this.ghosts.filter((ghost) => now - ghost.at < GOING_SECONDS[ghost.how]);
    const order = [...crew];
    for (const ghost of this.ghosts.toSorted((a, b) => a.crew.slot - b.crew.slot)) {
      order.splice(Math.min(ghost.crew.slot, order.length), 0, { ...ghost.crew, going: { how: ghost.how, t: now - ghost.at } });
    }
    return (this.shown = order.map((diver, slot) => ({ ...diver, slot })));
  }

  /** Another player went out of the room: their diver is seen going. */
  private ghost(id: number, how: Gone) {
    const name = this.client.view?.players.find((player) => player.id === id)?.nickname;
    const diver = this.shown.find((one) => one.name === name && !one.going);
    if (diver) this.ghosts.push({ crew: { ...diver, focus: false, label: false, host: false, crowned: undefined }, how, at: performance.now() / 1000 });
  }

  private crownedOf(id: number): Crew["crowned"] {
    if (this.crowned?.id !== id) return undefined;
    const t = performance.now() / 1000 - this.crowned.at;
    return t < CROWN_SECONDS + GLINT_SECONDS ? { from: this.crowned.from, t } : undefined;
  }

  private open(step: () => Step) {
    this.refused = null;
    this.note = "";
    this.ui.go(step);
  }

  /** How far the haul up at the end of a dive has come, from 0 to 1, gently at both ends. */
  private risen(): number {
    const t = Math.max(0, Math.min(1, (performance.now() / 1000 - this.ending!.at) / this.ending!.rise));
    return t * t * (3 - 2 * t);
  }

  /** Whether the player's own chaos dive has just been lost, and its last words are still being said. */
  private get dying(): boolean {
    return !!this.lost && performance.now() / 1000 - this.lost.at < LOST_SECONDS;
  }

  get surfaced(): boolean {
    return !!this.ending && this.risen() === 1;
  }

  closeEnding() {
    if (!this.ending || performance.now() / 1000 - this.ending.at < this.ending.rise + 1) return;
    this.ending = null;
    this.ui.go(this.first);
    if (this.gone) this.gone = false;
    else this.ui.go(this.room);
  }

  /** The dive of the room as a game the scene can draw, while there is one; at its end, the depth unwinding as the divers come up. */
  game(now: number): Game | null {
    if (this.lost && this.dying) return Object.assign(this.lost.game, { phaseTime: now - this.lost.at });
    if (this.ending) {
      const { log, follow } = this.ending;
      const depth = (log.divers.find((diver) => diver.id === follow)?.depth ?? 0) * (1 - this.risen());
      return { ...createGame(), phase: this.surfaced ? "done" : "ascent", chaos: log.mode === "chaos", depth };
    }
    const view = this.client.view;
    const dive = this.diving && view?.dive;
    if (!this.yours) this.typed = "";
    if (!dive) return null;
    const chaos = view.settings.mode === "chaos";
    const game = this.dive.update(dive, this.sent, now, chaos);
    // The player's air runs out by their own clock, which the server waits a moment for, so the last letters typed count.
    if (this.yours && dive.running && game.air <= 0) {
      this.client.send({ type: "out", text: this.typed });
      this.spent = `${dive.round}:${dive.turn}`;
    }
    // The player's own diver has just gone out of a chaos dive: their screen dies as a single player's does.
    if (chaos && !this.lost && dive.verdict && dive.divers.find((diver) => diver.id === view.you)?.out) {
      // It is their turn, so theirs is the diver in focus; their lantern goes out.
      const crew = this.crew()!.map((diver) => (diver.focus ? { ...diver, lit: false } : diver));
      this.lost = { at: now, game: { ...game, phase: "lost", phaseTime: 0, lamps: [...game.lamps], results: [...game.results] }, crew };
      return this.lost.game;
    }
    return game;
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
      barFull: BAR_FULL[view.settings.hearts],
    };
  }

  /** Whether it is the player's turn to answer, and an answer is wanted. */
  get yours(): boolean {
    const view = this.client.view;
    const dive = view?.dive;
    return !!dive && this.diving && dive.turn === view.you && !dive.verdict && !dive.drop && !this.dying && this.spent !== `${dive.round}:${dive.turn}`;
  }

  type(text: string) {
    if (!this.yours || text === this.typed) return;
    this.typed = text;
    this.client.send({ type: "typing", text });
  }

  /** Says whether it was sent. */
  answer(text: string): boolean {
    if (!this.yours || this.client.view!.dive!.judging || !text.trim()) return false;
    this.client.send({ type: "answer", text });
    this.typed = "";
    return true;
  }

  leaveDive() {
    this.diving = false;
    this.lost = null;
    this.client.close();
    this.ui.close();
  }

  private hear(message: Heard) {
    if (message.type === "gone") return this.ghost(message.id, message.how);
    this.busy = false;
    const entering = this.ui.top === this.create || this.ui.top === this.join;
    if (message.type === "room") {
      this.air = null;
      this.sent = performance.now() / 1000;
      const { code, players } = message.room;
      const host = players.find((player) => player.host);
      if (host && this.host?.code === code && this.host.id !== host.id) this.crowned = { id: host.id, from: this.host.name, at: this.sent };
      this.host = host ? { code, id: host.id, name: host.nickname } : null;
      // A dive takes the screen as it begins, and gives it back to the room when it ends.
      const diving = message.room.dive !== null;
      this.hearLanterns(message.room, diving !== this.diving);
      this.hearHearts(message.room);
      if (diving !== this.diving) {
        this.diving = diving;
        this.refused = null;
        if (diving) {
          this.lost = null;
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
      const where = REFUSALS[message.reason];
      this.refused = [where, t().rooms.refusals[message.reason]];
      if (where === "code" || where === "name") this.ui.focus(where);
    } else if (entering) {
      this.refused = ["end", t().noAnswer];
    } else if (this.ending) {
      // The end screen stays open; closing it leads out of the room.
      this.note = this.goneNote(message);
      this.gone = true;
    } else if (this.diving || this.ui.holds(this.room)) {
      this.note = this.goneNote(message);
      if (this.diving) {
        this.diving = false;
        this.ui.close();
        this.ui.go(this.first);
      }
      while (this.ui.top !== this.first) this.ui.back();
    }
  }

  private goneNote(message: Heard): string {
    const words = t().rooms;
    if (message.type === "removed") return message.banned ? words.bannedYou : words.removedYou;
    return words.lost;
  }

  /** The camera follows the player's own diver up, or the winner for one who only watched. */
  private endingOf({ last, players, you }: RoomView): NonNullable<MultiplayerPanel["ending"]> {
    const divers = last!.divers.map((diver) => {
      const player = players.find((one) => one.id === diver.id);
      return { ...diver, name: player?.nickname ?? "", suit: player?.suit ?? 0 };
    });
    const follow = divers.some((diver) => diver.id === you) ? you : divers.find((diver) => diver.won)!.id;
    const rise = ascentSeconds(Math.max(...divers.map((diver) => diver.depth)));
    // One whose chaos dive has just been lost hears their last words out before the haul up begins.
    const at = Math.max(performance.now() / 1000, this.lost ? this.lost.at + LOST_SECONDS : 0);
    return { log: { mode: last!.mode, divers }, follow, you, at, rise };
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

  /** Without a secure page (plain http to another machine) browsers keep `navigator.clipboard` closed. */
  private copy(code: string) {
    this.refused = null;
    const link = this.link(code);
    const done = () => (this.copiedAt = performance.now());
    const failed = () => (this.refused = ["copy", t().rooms.copyFailed(code)]);
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
    title: t().rooms.title,
    rows: [
      { kind: "press", id: "create", label: t().rooms.create, press: () => this.open(this.create) },
      { kind: "press", id: "join", label: t().rooms.join, press: () => this.open(this.join) },
      ...(this.note ? [{ kind: "note", text: this.note } as Part] : []),
    ],
  });

  private you(): Part[] {
    return [
      { kind: "field", id: "name", label: t().rooms.name, max: USERNAME_MAX, autocomplete: "nickname", start: this.account.account?.username },
      ...this.refusal("name"),
      { kind: "slider", id: "suit", label: t().rooms.suit, value: this.suit / (SUITS - 1), steps: SUITS - 1, colors: SUIT_COLORS, set: (value) => (this.suit = Math.round(value * (SUITS - 1))) },
      ...this.refusal("end"),
    ];
  }

  private create = (): Step => ({
    title: t().rooms.create,
    busy: this.busy,
    rows: [...this.you(), { kind: "press", id: "enter", label: t().rooms.createIt, press: () => this.enter("create") }],
  });

  private join = (): Step => ({
    title: t().rooms.join,
    busy: this.busy,
    rows: [
      { kind: "field", id: "code", label: t().rooms.code, max: ROOM_CODE_LENGTH, autocomplete: "off", start: this.linked },
      ...this.refusal("code"),
      ...this.you(),
      { kind: "press", id: "enter", label: t().rooms.joinIt, press: () => this.enter("join") },
    ],
  });

  private room = (): Step => {
    const view = this.client.view;
    const words = t().rooms;
    if (!view) return { title: words.room, rows: [] };
    const you = view.players.find((player) => player.id === view.you)!;
    const waiting = view.players.filter((player) => !player.host && !player.ready).map((player) => player.nickname);
    const depthOf = (id: number) => view.last?.divers.find((diver) => diver.id === id)?.depth;
    const rows: Part[] = view.players.map((player) => {
      const depth = depthOf(player.id);
      const pick = () => {
        this.picked = player.id;
        this.doomed = "";
        this.open(this.playerStep);
      };
      return {
        kind: "player",
        name: player.nickname,
        color: SUIT_COLORS[player.suit]!,
        host: player.host,
        note: [player.ready ? words.ready : "", depth === undefined ? "" : formatMeters(depth)].filter(Boolean).join(" ~ "),
        ...(you.host && player.id !== you.id ? { id: `player:${player.id}`, press: pick, says: words.playerSays(player.nickname) } : {}),
      };
    });
    const winners = view.players.filter((player) => view.last?.divers.some((diver) => diver.id === player.id && diver.won)).map((player) => player.nickname);
    if (view.last && winners.length) rows.push({ kind: "note", text: t().ending.won(t().list(winners), view.last.mode === "deepest") });
    rows.push({ kind: "gap" });
    if (you.host) {
      rows.push({ kind: "press", id: "start", label: words.start, press: () => this.start() });
      const refused = this.refused?.[0] === "start" ? this.refused[1] : "";
      // Not ready is said for as long as somebody is not.
      const early = refused === words.refusals["not-ready"];
      if (refused && (!early || waiting.length)) rows.push({ kind: "note", text: early ? words.waitingFor(refused, t().list(waiting)) : refused, bad: true });
      rows.push({ kind: "press", id: "setup", label: words.setUp, press: () => this.open(this.setup) });
    } else {
      const { mode, air, hearts, judging } = view.settings;
      rows.push(
        {
          kind: "press",
          id: "ready",
          label: you.ready ? words.putOut : words.light,
          says: you.ready ? words.putOutSays : words.lightSays,
          press: () => this.client.send({ type: "ready", ready: !you.ready }),
        },
        { kind: "note", text: [words.modes[mode][0], words.air(air), mode === "longest" ? words.newHearts(words.hearts[hearts]) : "", packsOf(view.settings, this.builtIn.length, true), judging ? words.liveJudging : ""].filter(Boolean).join(" ~ ") },
      );
    }
    const copy = () => this.copy(view.code);
    const copied = performance.now() - this.copiedAt < COPIED_FOR;
    rows.push(
      { kind: "press", id: "copy", label: copied ? words.copied : words.copy, says: t().page.copyLink(view.code), press: copy },
      ...this.refusal("copy"),
      { kind: "press", id: "leave", label: words.leave, press: () => this.ui.back() },
    );
    return { title: words.room, code: { text: view.code, copy }, rows };
  };

  private setup = (): Step => {
    const settings = this.client.view?.settings;
    const words = t().rooms;
    if (!settings) return { title: words.setUp, rows: [] };
    const air = this.air ?? settings.air;
    const keyed = this.account.account?.keys.anthropic || this.account.account?.keys.jev;
    const shift = (way: -1 | 1) => this.change({ mode: MODES[(MODES.indexOf(settings.mode) + way + MODES.length) % MODES.length] });
    const judging = () => this.change({ judging: !settings.judging });
    // Pressed, the hearts go round from easy to hard; Left and Right stop at either end.
    const level = HEARTS.indexOf(settings.hearts);
    const hearts = (to: number) => to !== level && this.change({ hearts: HEARTS[to]! });
    return {
      title: words.setUp,
      rows: [
        { kind: "press", id: "mode", label: words.mode, value: words.modes[settings.mode][0], press: () => this.open(this.modeStep), shift },
        {
          kind: "slider",
          id: "air",
          label: words.airLabel,
          value: air / AIR_MAX,
          steps: AIR_MAX / AIR_STEP,
          text: words.seconds(air),
          set: (value) => {
            const next = Math.max(AIR_MIN, Math.round((value * AIR_MAX) / AIR_STEP) * AIR_STEP);
            if (next === air) return;
            this.air = next;
            this.change({ air: next });
          },
        },
        ...(settings.mode === "longest"
          ? [{ kind: "press", id: "hearts", label: words.heartsLabel, value: words.hearts[settings.hearts], press: () => hearts((level + 1) % HEARTS.length), shift: (way: -1 | 1) => hearts(Math.max(0, Math.min(HEARTS.length - 1, level + way))) } as Part]
          : []),
        {
          kind: "press",
          id: "packs",
          label: words.packs,
          value: packsOf(settings, this.builtIn.length, false),
          press: () => {
            if (this.account.account) void fetch("/api/packs").then(async (res) => res.ok && (this.packs = (await res.json()) as PackSummary[]));
            this.open(this.packsStep);
          },
        },
        keyed
          ? { kind: "press", id: "judging", label: words.liveJudging, value: settings.judging ? words.on : words.off, on: settings.judging, press: judging, shift: judging }
          : { kind: "press", id: "judging", label: words.liveJudging, value: words.off, on: false, quiet: true },
        ...(keyed ? [] : [{ kind: "note", text: words.keepAKey } as Part]),
        ...this.refusal("settings"),
      ],
    };
  };

  private modeStep = (): Step => {
    const settings = this.client.view?.settings;
    const words = t().rooms;
    if (!settings) return { title: words.mode, rows: [] };
    return {
      title: words.mode,
      rows: MODES.flatMap((mode): Part[] => {
        const [name, how] = words.modes[mode];
        const chosen = settings.mode === mode;
        const choose = () => {
          if (!chosen) this.change({ mode });
          this.ui.back();
        };
        return [
          { kind: "press", id: `mode:${mode}`, label: name, value: chosen ? words.chosen : undefined, on: chosen ? true : undefined, press: choose },
          { kind: "note", text: how },
          ...(mode === "chaos" ? [{ kind: "note", text: t().horror, bad: true } as Part] : []),
        ];
      }),
    };
  };

  private choice(settings: RoomSettings): PackChoice {
    return {
      builtIn: this.builtIn,
      own: this.packs,
      chosen: { builtIn: settings.builtIn, own: settings.ownPacks },
      signedIn: !!this.account.account,
      choose: ({ builtIn, own }) => this.change({ builtIn, ownPacks: own }),
    };
  }

  private packsStep = (): Step => {
    const settings = this.client.view?.settings;
    const words = t().rooms;
    if (!settings) return { title: words.packs, rows: [] };
    return { title: words.packs, rows: [...packRows(this.choice(settings), () => this.open(this.builtInStep)), ...this.refusal("settings")] };
  };

  private builtInStep = (): Step => {
    const settings = this.client.view?.settings;
    const words = t().rooms;
    if (!settings) return { title: words.builtIn, rows: [] };
    return { title: words.builtIn, rows: [...builtInRows(this.choice(settings)), ...this.refusal("settings")] };
  };

  /** Removing and banning ask first: the second press in a row is the one that does it. The focus goes to what took the player's place. */
  private remove(player: RoomPlayer, ban: boolean) {
    const what = ban ? "ban" : "remove";
    if (this.doomed !== what) return void (this.doomed = what);
    this.doomed = "";
    this.client.send({ type: "remove", id: player.id, ban });
    const view = this.client.view!;
    const others = view.players.filter((one) => one.id !== view.you);
    const at = others.indexOf(player);
    const next = others[at + 1] ?? others[at - 1];
    this.ui.back();
    this.ui.focus(next ? `player:${next.id}` : "start");
  }

  /** What the host may do to another player of the room. */
  private playerStep = (): Step => {
    const words = t().rooms;
    const player = this.client.view?.players.find((one) => one.id === this.picked);
    if (!player) return { title: words.room, rows: [] };
    const sure = t().packs.sure;
    const crown = () => {
      this.client.send({ type: "host", id: player.id });
      this.ui.back();
    };
    return {
      title: player.nickname,
      rows: [
        { kind: "press", id: "crown", label: words.makeHost, press: crown },
        { kind: "gap" },
        { kind: "press", id: "remove", label: this.doomed === "remove" ? sure : words.remove, danger: this.doomed === "remove", press: () => this.remove(player, false), left: () => (this.doomed = "") },
        { kind: "note", text: words.removeHow },
        { kind: "press", id: "ban", label: this.doomed === "ban" ? sure : words.ban, danger: this.doomed === "ban", press: () => this.remove(player, true), left: () => (this.doomed = "") },
        { kind: "note", text: words.banHow },
      ],
    };
  };
}
