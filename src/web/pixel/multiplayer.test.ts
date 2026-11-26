import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type ClientMessage, type DiveView, type RoomView } from "../../shared/room";
import type { Sound } from "../sound";
import type { AccountPanel } from "./account";
import { MultiplayerPanel, codeProblem } from "./multiplayer";
import type { Ui } from "./ui";

const ui = { close() {}, go() {}, back() {}, top: null, holds: () => false, value: () => "" } as unknown as Ui;
const sound = { heart() {}, lantern() {} } as unknown as Sound;

const dive = (air: number): DiveView => ({
  prompt: { id: "p/a", text: "Name an ocean", pack: "Seas" },
  round: 0,
  rounds: 3,
  order: [0, 1],
  turn: 0,
  air,
  running: true,
  typing: "",
  judging: null,
  taken: [],
  refused: null,
  verdict: null,
  divers: [0, 1].map((id) => ({ id, depth: 0, lamps: [], hearts: 3, bar: 0, out: false })),
  dropLeft: 0,
});
const room = (dive: DiveView | null): RoomView => ({
  code: "ACDEF",
  you: 0,
  players: [{ id: 0, nickname: "ana", suit: 0, ready: true, host: true, muted: false }, { id: 1, nickname: "ben", suit: 1, ready: true, host: false, muted: false }],
  settings: { ...DEFAULT_SETTINGS, builtIn: [] },
  dive,
  last: null,
});

test("a turn whose air ran out in one dive does not take away the same turn of the next", () => {
  const panel = new MultiplayerPanel(ui, {} as AccountPanel, sound);
  const sent: ClientMessage[] = [];
  panel.client.send = (message) => sent.push(message);
  const hear = (view: RoomView) => {
    panel.client.view = view;
    panel["hear"]({ type: "room", room: view });
  };

  hear(room(dive(0)));
  panel.game(performance.now() / 1000);
  expect(sent).toEqual([{ type: "out", text: "" }]);
  expect(panel.yours).toBe(false);

  hear(room(null));
  hear(room(dive(30)));
  expect(panel.yours).toBe(true);
});

test("a room code that cannot be one is refused before the server is asked", () => {
  expect(codeProblem("")).toBe("type the room's code");
  expect(codeProblem("AB1DE")).toBe("a room code has only the letters A to Z");
  expect(codeProblem("房间代码啊")).toBe("a room code has only the letters A to Z");
  expect(codeProblem("AB DE")).toBe("a room code has only the letters A to Z");
  expect(codeProblem("ABCD")).toBe("a room code has 5 letters");
  expect(codeProblem("ABCDEF")).toBe("a room code has 5 letters");
  expect(codeProblem("ABCDE")).toBeUndefined();
  expect(codeProblem("abcde")).toBeUndefined();
});

test("in a dive the host opens another diver's step by their name, and it closes when the crown passes", () => {
  const steps: unknown[] = [];
  const stack = { ...ui, go: (step: unknown) => steps.push(step), back: () => steps.pop(), get top() { return steps.at(-1); } } as unknown as Ui;
  const panel = new MultiplayerPanel(stack, {} as AccountPanel, sound);
  const hear = (view: RoomView) => {
    panel.client.view = view;
    panel["hear"]({ type: "room", room: view });
  };

  hear(room(null));
  expect(panel.pickable("ben")).toBeUndefined();
  hear(room(dive(30)));
  expect(panel.pickable("ana")).toBeUndefined();
  expect(panel.pickable(null)).toBeUndefined();
  const ben = panel.pickable("ben")!;
  expect(ben.id).toBe(1);

  panel.pick(ben);
  expect(steps).toHaveLength(1);
  const crowned = room(dive(30));
  crowned.players = crowned.players.map((player) => ({ ...player, host: player.id === 1 }));
  hear(crowned);
  panel.update();
  expect(steps).toHaveLength(0);
  expect(panel.pickable("ben")).toBeUndefined();
});

test("the host passes the crown only on a second press, and moving away takes the question back", () => {
  const steps: unknown[] = [];
  const stack = { ...ui, go: (step: unknown) => steps.push(step), back: () => steps.pop(), get top() { return steps.at(-1); } } as unknown as Ui;
  const panel = new MultiplayerPanel(stack, {} as AccountPanel, sound);
  const sent: ClientMessage[] = [];
  panel.client.send = (message) => sent.push(message);
  panel.client.view = room(dive(30));
  panel["hear"]({ type: "room", room: panel.client.view });
  panel.pick(panel.pickable("ben")!);
  const crown = () => panel["playerStep"]().rows.find((row) => "id" in row && row.id === "crown") as { label: string; press(): void; left(): void };

  crown().press();
  expect(sent).toEqual([]);
  expect(crown().label).toBe("Sure?");
  crown().left();
  expect(crown().label).toBe("Transfer host");
  crown().press();
  crown().press();
  expect(sent).toEqual([{ type: "host", id: 1 }]);
});

test("a diver whose turn put them out of the dive is seen dying through the verdict, then is out", () => {
  const panel = new MultiplayerPanel(ui, {} as AccountPanel, sound);
  panel.client.send = () => {};
  const hear = (view: RoomView) => {
    panel.client.view = view;
    panel["hear"]({ type: "room", room: view });
  };
  const ending = { ...dive(0), running: false, verdict: { answer: null, rarity: 0 } };
  ending.divers = ending.divers.map((diver) => (diver.id === 0 ? { ...diver, hearts: 0, out: true } : diver));
  ending.order = [1];

  hear(room(ending));
  const ana = () => panel.crew()!.find((diver) => diver.name === "ana")!;
  expect(ana()).toMatchObject({ dying: 0, out: false, focus: true });
  const now = performance.now() / 1000;
  panel.game(now);
  panel.game(now + 2);
  expect(ana().dying).toBeCloseTo(2);

  hear(room({ ...ending, turn: 1, verdict: null }));
  expect(ana()).toMatchObject({ dying: undefined, out: true, focus: false });
});
