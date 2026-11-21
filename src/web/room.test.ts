import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { DEFAULT_SETTINGS, type ClientMessage, type RoomView, type ServerMessage } from "../shared/room";
import { RoomClient, type Heard } from "./room";

/** A WebSocket that opens at once and keeps what the page sends; the test speaks for the server. */
class FakeSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static made: FakeSocket[] = [];
  readyState = FakeSocket.OPEN;
  sent: ClientMessage[] = [];
  closedWith: number | undefined;
  constructor(readonly url: string) {
    super();
    FakeSocket.made.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  /** Like a connection whose way has broken, it says nothing when closed. */
  close(code?: number) {
    this.closedWith = code;
  }
  hear(message: ServerMessage) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

const view: RoomView = {
  code: "ACDEF",
  you: 1,
  players: [{ id: 0, nickname: "ana", suit: 0, ready: false, host: true, muted: false }, { id: 1, nickname: "ben", suit: 1, ready: false, host: false, muted: false }],
  settings: { ...DEFAULT_SETTINGS, builtIn: [] },
  dive: null,
  last: null,
};
const pings = (socket: FakeSocket) => socket.sent.filter((message) => message.type === "ping").length;

const real = { WebSocket: globalThis.WebSocket, location: globalThis.location };
beforeEach(() => {
  FakeSocket.made = [];
  jest.useFakeTimers();
  Object.assign(globalThis, { WebSocket: FakeSocket, location: { protocol: "http:", host: "hadal.test" } });
});
afterEach(() => {
  jest.useRealTimers();
  Object.assign(globalThis, real);
});

test("a connection that answers its pings is kept", () => {
  const client = new RoomClient(() => {});
  client.send({ type: "join", code: "ACDEF", nickname: "ben", suit: 1 });
  const socket = FakeSocket.made[0]!;
  socket.hear({ type: "room", room: view });
  for (let i = 0; i < 6; i++) {
    jest.advanceTimersByTime(5000);
    socket.hear({ type: "pong" });
  }
  expect(pings(socket)).toBe(6);
  expect(client.offline).toBe(false);
  expect(FakeSocket.made).toHaveLength(1);
});

test("a connection gone silent shows the player cut off, and is given up for another that takes their place back", () => {
  const heard: Heard[] = [];
  const client = new RoomClient((message) => heard.push(message));
  client.send({ type: "join", code: "ACDEF", nickname: "ben", suit: 1 });
  const socket = FakeSocket.made[0]!;
  socket.hear({ type: "room", room: view });
  jest.advanceTimersByTime(5000);
  expect(client.offline).toBe(false);
  jest.advanceTimersByTime(5000);
  expect(client.offline).toBe(true);
  // What the player does meanwhile still goes out: the connection may only be slow.
  client.send({ type: "ready", ready: true });
  expect(socket.sent.at(-1)).toEqual({ type: "ready", ready: true });
  jest.advanceTimersByTime(5000);
  expect(socket.closedWith).toBe(4000);
  jest.advanceTimersByTime(0);
  const again = FakeSocket.made[1]!;
  expect(again.sent).toEqual([{ type: "back", code: "ACDEF", id: 1, nickname: "ben", suit: 1, settings: view.settings }]);
  // A room the old connection still held comes too late to count.
  socket.hear({ type: "room", room: { ...view, code: "ZZZZZ" } });
  expect(client.view?.code).toBe("ACDEF");
  expect(client.offline).toBe(true);
  again.hear({ type: "room", room: view });
  expect(client.offline).toBe(false);
  expect(heard.filter((message) => message.type === "lost")).toEqual([]);
});
