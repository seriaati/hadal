import { expect, test } from "bun:test";
import { DROP_SECONDS, PAUSE_SECONDS, type Finish, type Mode } from "../shared/room";
import type { Pack, Verdict } from "../shared/types";
import { Dive, enoughFor, type Clock, type Live } from "./dive";
import { buildIndex } from "./game";

const PACK: Pack = {
  id: "colours",
  name: "Colours",
  prompts: [
    {
      id: "flag",
      text: "Name a colour of a flag",
      answers: [
        { text: "Red", rarity: 10 },
        { text: "Blue", rarity: 30 },
        { text: "Green", aliases: ["verde"], rarity: 60 },
      ],
    },
    { id: "sky", text: "Name the colour of the sky", answers: [{ text: "Blue", rarity: 50 }, { text: "Grey", rarity: 80 }, { text: "Azure", rarity: 100 }] },
    { id: "one", text: "Name the colour of snow", answers: [{ text: "White", rarity: 100 }] },
  ],
};
const index = buildIndex([PACK]);
const AIR = 10;

/** A clock moved by hand: `pass` runs every timer that falls due, in order. */
function handClock() {
  let now = 0;
  const timers: { at: number; then: () => void; live: boolean }[] = [];
  const clock: Clock & { pass(seconds: number): Promise<void> } = {
    now: () => now,
    after: (ms, then) => {
      const timer = { at: now + ms, then, live: true };
      timers.push(timer);
      return () => (timer.live = false);
    },
    async pass(seconds) {
      const until = now + seconds * 1000;
      for (;;) {
        const due = timers.filter((timer) => timer.live && timer.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.live = false;
        now = due.at;
        due.then();
        await Bun.sleep(0);
      }
      now = until;
    },
  };
  return clock;
}

const WRONG = async () => ({ answer: null, rarity: 0 });

/** A dive of the divers named by id, in that order, over the two prompts with three answers (or the prompts given). */
function dive(order: number[], live: Live = WRONG, mode: Mode = "deepest", prompts = [index.get("colours/flag")!.prompt, index.get("colours/sky")!.prompt]) {
  const clock = handClock();
  const ended: Finish[][] = [];
  const running = new Dive({ mode, index, prompts, order, air: AIR, live, clock, changed: () => {}, ended: (finish) => ended.push(finish) });
  running.start();
  return { dive: running, clock, ended, view: () => running.view() };
}

test("only prompts with an answer for every diver are drawn", () => {
  expect([...enoughFor(index, 3).keys()]).toEqual(["colours/flag", "colours/sky"]);
  expect(enoughFor(index, 1).size).toBe(3);
  expect(enoughFor(index, 4).size).toBe(0);
});

test("the divers answer in turn, and who goes first moves on by one with each prompt", async () => {
  const { dive: d, clock, view } = dive([7, 3, 5]);
  const turns: number[] = [];
  for (let i = 0; i < 6; i++) {
    turns.push(view().turn);
    await d.answer(view().turn, ["red", "blue", "green", "blue", "grey", "azure"][i]!);
    await clock.pass(PAUSE_SECONDS);
  }
  expect(turns).toEqual([7, 3, 5, 3, 5, 7]);
});

test("two divers take turns: nobody answers twice in a row", async () => {
  const { dive: d, clock, view } = dive([7, 3]);
  const turns: number[] = [];
  for (let i = 0; i < 4; i++) {
    turns.push(view().turn);
    await d.answer(view().turn, ["red", "blue", "grey", "azure"][i]!);
    await clock.pass(PAUSE_SECONDS);
  }
  expect(turns).toEqual([7, 3, 7, 3]);
});

test("when a diver leaves, the turns still never fall to the same diver twice in a row", async () => {
  const { dive: d, clock, view } = dive([7, 3, 5]);
  for (const answer of ["red", "blue"]) {
    await d.answer(view().turn, answer);
    await clock.pass(PAUSE_SECONDS);
  }
  d.drop(5);
  // 3 answered last; the next prompt would have begun with 3, so it begins with 7.
  expect(view().turn).toBe(7);
});

test("a lit lamp takes the diver deeper, and everyone sees the verdict for a pause", async () => {
  const { dive: d, clock, view } = dive([1, 2]);
  await d.answer(1, "Green");
  expect(view().verdict).toEqual({ answer: "Green", rarity: 60 });
  expect(view().divers[0]).toMatchObject({ id: 1, depth: 660, lamps: [{ depth: 660, lit: true }] });
  expect(view().taken).toEqual(["Green"]);
  expect(view().running).toBe(false);
  await clock.pass(PAUSE_SECONDS - 0.1);
  expect(view().turn).toBe(1);
  await clock.pass(0.1);
  expect(view().turn).toBe(2);
  expect(view().verdict).toBeNull();
  expect(view().air).toBe(AIR);
});

test("an answer already given is taken, even under another name or misspelt", async () => {
  const { dive: d, clock, view } = dive([1, 2]);
  await d.answer(1, "green");
  await clock.pass(PAUSE_SECONDS);
  await d.answer(2, "verde");
  expect(view().refused).toEqual({ text: "verde", taken: true, count: 1 });
  await d.answer(2, "Grene");
  expect(view().refused).toEqual({ text: "Grene", taken: true, count: 2 });
  expect(view().verdict).toBeNull();
  await d.answer(2, "red");
  expect(view().verdict).toEqual({ answer: "Red", rarity: 10 });
});

test("a wrong answer is said, and the diver tries again with the air that is left", async () => {
  const { dive: d, clock, view } = dive([1, 2]);
  await clock.pass(3);
  await d.answer(1, "purple");
  expect(view().refused).toEqual({ text: "purple", taken: false, count: 1 });
  expect(view().running).toBe(true);
  expect(view().air).toBe(AIR - 3);
  await d.answer(1, "blue");
  expect(view().divers[0]!.depth).toBe(330);
});

test("the air stands still while the live judge rules", async () => {
  let rule: (verdict: Verdict) => void = () => {};
  const { dive: d, clock, view } = dive([1, 2], () => new Promise((done) => (rule = done)));
  await clock.pass(4);
  const asked = d.answer(1, "crimson");
  expect(view().judging).toBe("crimson");
  expect(view().running).toBe(false);
  await clock.pass(30);
  expect(view().air).toBe(AIR - 4);
  rule({ answer: "Crimson", rarity: 90 });
  await asked;
  expect(view().verdict).toEqual({ answer: "Crimson", rarity: 90 });
});

test("when the air runs out what is typed gets one last try, and nothing typed is a dead lamp", async () => {
  const { dive: d, clock, view } = dive([1, 2]);
  d.type(1, "blue");
  await clock.pass(AIR);
  expect(view().verdict).toEqual({ answer: "Blue", rarity: 30 });
  await clock.pass(PAUSE_SECONDS);
  d.type(2, "pink");
  await clock.pass(AIR);
  expect(view().refused?.text).toBe("pink");
  expect(view().verdict).toEqual({ answer: null, rarity: 0 });
  expect(view().divers[1]).toMatchObject({ id: 2, depth: 0, lamps: [{ depth: 0, lit: false }], hearts: 2, out: false });
});

test("only the diver whose turn it is types and answers", async () => {
  const { dive: d, view } = dive([1, 2]);
  d.type(2, "red");
  await d.answer(2, "red");
  expect(view().typing).toBe("");
  expect(view().verdict).toBeNull();
  d.type(1, "re");
  expect(view().typing).toBe("re");
});

test("a diver who leaves on their turn passes it on at once, and a ruling that comes after does nothing", async () => {
  let rule: (verdict: Verdict) => void = () => {};
  const { dive: d, view } = dive([1, 2, 3], () => new Promise((done) => (rule = done)));
  const asked = d.answer(1, "crimson");
  d.drop(1);
  expect(view().turn).toBe(2);
  expect(view().order).toEqual([2, 3]);
  rule({ answer: "Crimson", rarity: 90 });
  await asked;
  expect(view().verdict).toBeNull();
  expect(view().divers.map((diver) => diver.id)).toEqual([2, 3]);
});

test("after the last prompt the dive ends with every diver's depth, place, points and answers", async () => {
  const { dive: d, clock, ended, view } = dive([1, 2]);
  for (const answer of ["red", "blue", "grey", "azure"]) {
    await d.answer(view().turn, answer);
    await clock.pass(PAUSE_SECONDS);
  }
  const flag = "Name a colour of a flag";
  const sky = "Name the colour of the sky";
  expect(ended).toEqual([
    [
      {
        id: 1, depth: 110 + 880, won: false, place: 2, points: 90, out: null,
        lamps: [{ depth: 110, lit: true }, { depth: 990, lit: true }],
        said: [{ prompt: flag, answer: "Red", rarity: 10 }, { prompt: sky, answer: "Grey", rarity: 80 }],
      },
      {
        id: 2, depth: 330 + 1100, won: true, place: 1, points: 130, out: null,
        lamps: [{ depth: 330, lit: true }, { depth: 1430, lit: true }],
        said: [{ prompt: flag, answer: "Blue", rarity: 30 }, { prompt: sky, answer: "Azure", rarity: 100 }],
      },
    ],
  ]);
});

// ---- "longest"

/** Every prompt of the pack, flag and sky (three answers each) twice over, so that a dive in "longest" lasts. */
const MANY = [...index.values(), ...index.values()].map((entry) => entry.prompt).filter((prompt) => prompt.id !== "colours/one");

test("in longest, a turn lost costs a heart, and one with none left is out and skipped", async () => {
  const { dive: d, clock, view } = dive([1, 2, 3], WRONG, "longest", MANY);
  await clock.pass(AIR);
  expect(view().divers[0]).toMatchObject({ hearts: 1, out: false });
  await clock.pass(PAUSE_SECONDS);
  await d.answer(2, "red");
  await clock.pass(PAUSE_SECONDS);
  await d.answer(3, "blue");
  await clock.pass(PAUSE_SECONDS);
  // Prompt two: 2 goes first, then 3, then 1, who runs out again.
  await d.answer(2, "grey");
  await clock.pass(PAUSE_SECONDS);
  await d.answer(3, "azure");
  await clock.pass(PAUSE_SECONDS);
  expect(view().turn).toBe(1);
  await clock.pass(AIR);
  expect(view().divers[0]).toMatchObject({ hearts: 0, out: true });
  expect(view().order).toEqual([2, 3]);
  await clock.pass(PAUSE_SECONDS);
  // The line stays, with its dead lamps; the turns go on between the two still in.
  expect(view().divers.map((diver) => diver.id)).toEqual([1, 2, 3]);
  expect(view().turn).not.toBe(1);
});

/** Diver 1 answers first on every prompt (flag, then sky, over and over): green (60) to the flag, azure (100) to the sky. */
async function rare(d: Dive, clock: ReturnType<typeof handClock>, prompts: number) {
  for (let i = 0; i < prompts; i++) {
    await d.answer(1, i % 2 ? "azure" : "green");
    await clock.pass(PAUSE_SECONDS);
    await d.answer(2, i % 2 ? "grey" : "red");
    await clock.pass(PAUSE_SECONDS);
  }
}

test("in longest, rarity fills the bar, and a full bar is one more heart, with what is over carried on", async () => {
  const { dive: d, clock, view } = dive([1, 2], WRONG, "longest", [...MANY, ...MANY]);
  await rare(d, clock, 4);
  expect(view().divers[0]).toMatchObject({ hearts: 2, bar: 320 });
  await rare(d, clock, 2);
  expect(view().divers[0]).toMatchObject({ hearts: 3, bar: 80 });
});

test("in longest, a diver has at most five hearts, and with five the bar stays empty", async () => {
  const { dive: d, clock, view } = dive([1, 2], WRONG, "longest", Array.from({ length: 10 }, () => MANY).flat());
  await rare(d, clock, 16);
  expect(view().divers[0]).toMatchObject({ hearts: 5, bar: 0 });
  await d.answer(1, "green");
  expect(view().divers[0]).toMatchObject({ hearts: 5, bar: 0 });
});

test("in longest, nobody answers twice in a row as divers go out", async () => {
  const { dive: d, clock, view } = dive([1, 2, 3], WRONG, "longest", MANY);
  const turns: number[] = [];
  const answers = ["red", "blue", "green", "blue", "grey", "azure", "red", "blue", "green"];
  for (let i = 0; i < 9 && view().order.length > 1; i++) {
    turns.push(view().turn);
    // 3 never answers, and goes out after two turns.
    if (view().turn === 3) await clock.pass(AIR);
    else await d.answer(view().turn, answers[i]!);
    await clock.pass(PAUSE_SECONDS);
  }
  expect(turns.some((turn, i) => turn === turns[i - 1])).toBe(false);
  expect(view().divers[2]).toMatchObject({ out: true });
});

test("in longest, the dive ends when one is left, and they win", async () => {
  const { dive: d, clock, ended } = dive([1, 2], WRONG, "longest", MANY);
  await d.answer(1, "green");
  await clock.pass(PAUSE_SECONDS);
  for (let i = 0; i < 2; i++) {
    await clock.pass(AIR + PAUSE_SECONDS);
    await d.answer(1, ["azure", "red"][i]!);
    await clock.pass(PAUSE_SECONDS);
  }
  // 2 lost both hearts; 1 is the last one in.
  expect(ended).toHaveLength(1);
  expect(ended[0]!.map((finish) => finish.won)).toEqual([true, false]);
});

test("in longest, when the prompts run out the deepest of those still in wins", async () => {
  const { dive: d, clock, ended, view } = dive([1, 2, 3], WRONG, "longest");
  // Prompt one: 1 dives deepest of all, then goes out on prompt two after losing a heart on each.
  for (const [turn, answer] of [[1, ""], [2, "blue"], [3, "red"]] as const) {
    if (answer) await d.answer(turn, answer);
    else await clock.pass(AIR);
    await clock.pass(PAUSE_SECONDS);
  }
  expect(view().turn).toBe(2);
  for (const [turn, answer] of [[2, "grey"], [3, "blue"], [1, ""]] as const) {
    if (answer) await d.answer(turn, answer);
    else await clock.pass(AIR);
    await clock.pass(PAUSE_SECONDS);
  }
  expect(ended[0]!.map(({ id, depth, won, place, out }) => ({ id, depth, won, place, out }))).toEqual([
    { id: 1, depth: 0, won: false, place: 3, out: 2 },
    { id: 2, depth: 330 + 880, won: true, place: 1, out: null },
    { id: 3, depth: 110 + 550, won: false, place: 2, out: null },
  ]);
  // A turn lost is in the log too, with no answer.
  expect(ended[0]![0]!.said).toEqual([
    { prompt: "Name a colour of a flag", answer: null, rarity: 0 },
    { prompt: "Name the colour of the sky", answer: null, rarity: 0 },
  ]);
});

// ---- "chaos"

test("in chaos, no air runs and nothing is taken while the divers are dropped off", async () => {
  const { dive: d, clock, view } = dive([1, 2], WRONG, "chaos", MANY);
  expect(view()).toMatchObject({ drop: DROP_SECONDS, running: false, air: AIR });
  await d.answer(1, "red");
  d.type(1, "re");
  expect(view()).toMatchObject({ verdict: null, typing: "" });
  await clock.pass(DROP_SECONDS);
  expect(view()).toMatchObject({ drop: 0, running: true });
  await d.answer(1, "red");
  expect(view().verdict?.answer).toBe("Red");
});

test("in chaos, one empty tank puts a diver out, and the last one in wins", async () => {
  const { dive: d, clock, ended, view } = dive([1, 2, 3], WRONG, "chaos", MANY);
  await clock.pass(DROP_SECONDS);
  await d.answer(1, "red");
  await clock.pass(PAUSE_SECONDS);
  await clock.pass(AIR);
  expect(view().divers[1]).toMatchObject({ hearts: 0, out: true });
  expect(view().order).toEqual([1, 3]);
  await clock.pass(PAUSE_SECONDS);
  await d.answer(3, "blue");
  await clock.pass(PAUSE_SECONDS);
  // Prompt two: 1 goes first, since 3 answered last and nobody answers twice in a row.
  expect(view().turn).toBe(1);
  await clock.pass(AIR + PAUSE_SECONDS);
  expect(ended).toHaveLength(1);
  expect(ended[0]!.map(({ id, won, place, out }) => ({ id, won, place, out }))).toEqual([
    { id: 1, won: false, place: 2, out: 2 },
    { id: 2, won: false, place: 3, out: 1 },
    { id: 3, won: true, place: 1, out: null },
  ]);
});

test("in chaos, a rare answer wins no heart", async () => {
  const { dive: d, clock, view } = dive([1, 2], WRONG, "chaos", [...MANY, ...MANY]);
  await clock.pass(DROP_SECONDS);
  await rare(d, clock, 6);
  expect(view().divers[0]).toMatchObject({ hearts: 1, bar: 0 });
});
