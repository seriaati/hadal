import { DROP_SECONDS, MAX_HEARTS, PAUSE_SECONDS, START_HEARTS, type DiveView, type DiverView, type Finish, type Mode, type Said } from "../shared/room";
import { MAX_ANSWER_LENGTH, METERS_PER_POINT, type GamePrompt, type Verdict } from "../shared/types";
import { judge, type PromptEntry, type PromptIndex } from "./game";

/** What a dive keeps time with: the real clock in the game, one moved by hand in the tests. */
export type Clock = { now(): number; after(ms: number, then: () => void): () => void };
export const realClock: Clock = {
  now: () => performance.now(),
  after: (ms, then) => {
    const timer = setTimeout(then, ms);
    return () => clearTimeout(timer);
  },
};

/** Rules on an answer the pack does not list. */
export type Live = (entry: PromptEntry, typed: string) => Promise<Verdict>;
export type DiveSetup = {
  mode: Mode;
  index: PromptIndex;
  prompts: GamePrompt[];
  order: number[];
  air: number;
  /** In "longest", the points of rarity that fill the bar and give one more heart. */
  barFull: number;
  live: Live;
  clock: Clock;
  changed: () => void;
  ended: (finish: Finish[]) => void;
};

const WRONG: Verdict = { answer: null, rarity: 0 };

/** Every diver needs an answer of their own to give, so only prompts with at least as many answers as divers will do. */
export function enoughFor(index: PromptIndex, divers: number): PromptIndex {
  return new Map([...index].filter(([, entry]) => new Set(entry.answers.values()).size >= divers));
}

/**
 * A dive of a room: one prompt for everyone, answered in turns, each turn with its own air.
 * Who answers first moves on by one with each prompt. It keeps the clock and the score. In
 * "longest" a turn lost costs a heart, and a diver with none left is out of the dive. In "chaos"
 * a diver has one heart, and the dive opens with the divers being dropped off.
 */
export class Dive {
  private round = 0;
  /** The divers still in the dive, in the order drawn. */
  private present: number[];
  /** The prompt on which each diver who is out went out. */
  private outAt = new Map<number, number>();
  private said = new Map<number, Said[]>();
  /** Who is still to answer this prompt; the diver whose turn it is comes first. */
  private queue: number[] = [];
  /** Who answered this prompt first, and who answered last of all. */
  private first = 0;
  private last: number | null = null;
  private divers: DiverView[];
  private taken: string[] = [];
  private typing = "";
  private judging: string | null = null;
  private refused: DiveView["refused"] = null;
  private refusals = 0;
  private verdict: Verdict | null = null;
  /** The seconds of air left while it stands still; while it runs, the moment it runs out. */
  private left = 0;
  private deadline: number | null = null;
  private cancel = () => {};
  /** Counts the turns, so that a ruling or a timer from a turn that is over does nothing. */
  private turns = 0;
  private over = false;
  private dropEnd: number | null = null;

  constructor(private setup: DiveSetup) {
    this.present = [...setup.order];
    const hearts = setup.mode === "chaos" ? 1 : START_HEARTS;
    this.divers = setup.order.map((id) => ({ id, depth: 0, lamps: [], hearts, bar: 0, out: false }));
  }

  start() {
    this.queue = [...this.present];
    this.first = this.queue[0]!;
    if (this.setup.mode !== "chaos") return this.begin();
    // No air is used while the submarines let the divers go.
    this.left = this.setup.air;
    this.dropEnd = this.setup.clock.now() + DROP_SECONDS * 1000;
    this.cancel = this.setup.clock.after(DROP_SECONDS * 1000, () => this.dropEnd !== null && !this.over && this.begin());
    this.setup.changed();
  }

  /** Stop for good, without an ending: the room is gone. */
  close() {
    this.over = true;
    this.cancel();
  }

  get turn(): number {
    return this.queue[0]!;
  }

  view(): DiveView {
    return {
      prompt: this.setup.prompts[this.round]!,
      round: this.round,
      of: this.setup.prompts.length,
      order: this.present,
      turn: this.turn,
      air: this.air(),
      running: this.deadline !== null,
      typing: this.typing,
      judging: this.judging,
      taken: this.taken,
      refused: this.refused,
      verdict: this.verdict,
      divers: this.divers,
      drop: this.dropEnd === null ? 0 : Math.max(0, (this.dropEnd - this.setup.clock.now()) / 1000),
    };
  }

  type(id: number, text: string) {
    if (this.over || this.dropEnd !== null || id !== this.turn || this.verdict) return;
    this.typing = String(text ?? "").slice(0, MAX_ANSWER_LENGTH);
    this.setup.changed();
  }

  async answer(id: number, text: string) {
    if (this.over || this.dropEnd !== null || id !== this.turn || this.verdict || this.judging !== null) return;
    const typed = String(text ?? "").trim().slice(0, MAX_ANSWER_LENGTH);
    if (typed) await this.attempt(typed);
  }

  /** A diver left the room. */
  drop(id: number) {
    if (this.over || !this.divers.some((diver) => diver.id === id)) return;
    this.divers = this.divers.filter((diver) => diver.id !== id);
    if (!this.present.includes(id)) return this.setup.changed();
    this.present = this.present.filter((other) => other !== id);
    if (this.done()) return this.finish();
    if (this.turn !== id) {
      this.queue = this.queue.filter((other) => other !== id);
      return this.setup.changed();
    }
    this.cancel();
    this.queue.shift();
    this.proceed();
  }

  private begin() {
    this.dropEnd = null;
    this.turns++;
    this.typing = "";
    this.judging = null;
    this.refused = null;
    this.verdict = null;
    this.run(this.setup.air);
    this.setup.changed();
  }

  private air(): number {
    return this.deadline === null ? this.left : Math.max(0, (this.deadline - this.setup.clock.now()) / 1000);
  }

  private run(seconds: number) {
    const turn = this.turns;
    this.left = seconds;
    this.deadline = this.setup.clock.now() + seconds * 1000;
    this.cancel = this.setup.clock.after(seconds * 1000, () => turn === this.turns && this.expire());
  }

  private stop() {
    this.left = this.air();
    this.deadline = null;
    this.cancel();
  }

  /** The air ran out: whatever is typed gets one last try. */
  private expire() {
    this.deadline = null;
    this.left = 0;
    const typed = this.typing.trim();
    if (typed) void this.attempt(typed);
    else this.end(null);
  }

  private async attempt(typed: string) {
    const turn = this.turns;
    // No air is used while an answer is with the judge: that wait is not the diver's doing.
    this.stop();
    this.typing = "";
    this.judging = typed;
    this.setup.changed();
    const promptId = this.setup.prompts[this.round]!.id;
    let verdict = judge(this.setup.index, promptId, typed)!;
    if (verdict.answer === null) verdict = await this.setup.live(this.setup.index.get(promptId)!, typed).catch(() => WRONG);
    if (turn !== this.turns || this.over) return;
    this.judging = null;
    // Taken goes by the answer an alias or a misspelling stands for, not by the words typed.
    const taken = verdict.answer !== null && this.taken.includes(verdict.answer);
    if (verdict.answer !== null && !taken) return this.end(verdict);
    this.refused = { text: typed, taken, count: ++this.refusals };
    if (this.left <= 0) return this.end(null);
    this.run(this.left);
    this.setup.changed();
  }

  private end(verdict: Verdict | null) {
    this.stop();
    const diver = this.divers.find((one) => one.id === this.turn)!;
    const longest = this.setup.mode === "longest";
    if (verdict) {
      diver.depth += verdict.rarity * METERS_PER_POINT;
      this.taken.push(verdict.answer!);
      if (longest) diver.bar += verdict.rarity;
      // A full bar is one more heart; what is over goes into the next bar. With the most hearts there is no bar to fill.
      while (longest && diver.bar >= this.setup.barFull && diver.hearts < MAX_HEARTS) {
        diver.bar -= this.setup.barFull;
        diver.hearts++;
      }
      if (diver.hearts === MAX_HEARTS) diver.bar = 0;
    } else if (this.setup.mode !== "deepest" && !--diver.hearts) {
      diver.out = true;
      this.outAt.set(diver.id, this.round);
      this.present = this.present.filter((id) => id !== diver.id);
    }
    diver.lamps.push({ depth: diver.depth, lit: verdict !== null });
    const said = this.said.get(diver.id) ?? [];
    said.push({ prompt: this.setup.prompts[this.round]!.text, answer: verdict?.answer ?? null, rarity: verdict?.rarity ?? 0 });
    this.said.set(diver.id, said);
    this.last = diver.id;
    this.verdict = verdict ?? WRONG;
    const turn = this.turns;
    this.cancel = this.setup.clock.after(PAUSE_SECONDS * 1000, () => {
      if (turn !== this.turns) return;
      this.queue.shift();
      this.proceed();
    });
    this.setup.changed();
  }

  private proceed() {
    if (this.done()) return this.finish();
    if (!this.queue.length) {
      this.round++;
      this.taken = [];
      if (this.round >= this.setup.prompts.length) return this.finish();
      // The first answer moves on by one with each prompt, but nobody answers twice in a row: two divers simply take turns.
      let first = this.after(this.first);
      if (first === this.last) first = this.after(first);
      this.first = first;
      const at = this.present.indexOf(first);
      this.queue = [...this.present.slice(at), ...this.present.slice(0, at)];
    }
    this.begin();
  }

  private after(id: number): number {
    const { order } = this.setup;
    const at = order.indexOf(id);
    for (let step = 1; step <= order.length; step++) {
      const next = order[(at + step) % order.length]!;
      if (this.present.includes(next)) return next;
    }
    return id;
  }

  /** Nobody is left to dive, or in "longest" and "chaos" one alone is (unless they were alone from the start). */
  private done(): boolean {
    const left = this.present.length;
    return !left || (this.setup.mode !== "deepest" && left === 1 && this.setup.order.length > 1);
  }

  /**
   * The dive is over. In "deepest" the deepest diver wins. In "longest" and "chaos" the deepest of those still in, or,
   * if nobody is, of those who went out on the last prompt anybody did.
   */
  private finish() {
    this.over = true;
    this.cancel();
    const lastOut = Math.max(...this.outAt.values());
    const contenders =
      this.setup.mode === "deepest" ? this.divers
      : this.present.length ? this.divers.filter((diver) => this.present.includes(diver.id))
      : this.divers.filter((diver) => this.outAt.get(diver.id) === lastOut);
    const deepest = Math.max(...contenders.map((diver) => diver.depth));
    const finish = this.divers.map(({ id, depth, lamps }): Finish => {
      const said = this.said.get(id) ?? [];
      const out = this.setup.mode !== "deepest" && this.outAt.has(id) ? this.outAt.get(id)! + 1 : null;
      const won = depth === deepest && contenders.some((diver) => diver.id === id);
      return { id, depth, won, place: 0, points: said.reduce((sum, one) => sum + one.rarity, 0), lamps, said, out };
    });
    // Deepest first; in "longest" and "chaos" the winners, then those still in, then the others by how long they lasted.
    const lasted = (one: Finish) => (one.won ? 2 : one.out === null ? 1 : one.out / (this.setup.prompts.length + 1));
    finish
      .toSorted((a, b) => (this.setup.mode !== "deepest" ? lasted(b) - lasted(a) : 0) || b.depth - a.depth)
      .forEach((one, i) => (one.place = i + 1));
    this.setup.ended(finish);
  }
}
