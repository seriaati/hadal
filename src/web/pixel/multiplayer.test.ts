import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, type ClientMessage, type DiveView, type RoomView } from "../../shared/room";
import type { Sound } from "../sound";
import type { AccountPanel } from "./account";
import { MultiplayerPanel } from "./multiplayer";
import type { Ui } from "./ui";

const ui = { close() {}, go() {}, back() {}, top: null, holds: () => false, value: () => "" } as unknown as Ui;
const sound = { heart() {}, lantern() {} } as unknown as Sound;

const dive = (air: number): DiveView => ({
  prompt: { id: "p/a", text: "Name an ocean", pack: "Seas" },
  round: 0,
  of: 3,
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
  drop: 0,
});
const room = (dive: DiveView | null): RoomView => ({
  code: "ACDEF",
  you: 0,
  players: [{ id: 0, nickname: "ana", suit: 0, ready: true, host: true }, { id: 1, nickname: "ben", suit: 1, ready: true, host: false }],
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
