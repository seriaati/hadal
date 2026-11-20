import type { ClientMessage, RoomView, ServerMessage } from "../shared/room";

export type Heard = ServerMessage | { type: "lost" };

/** How often, and how many times, a page whose connection closed tries to take its place in the room back, in milliseconds. */
const RETRY_EVERY = 2000;
const RETRIES = 15;

/**
 * How often the page pings the server, how long an unanswered ping waits before the player is shown the connection may be
 * gone, and how long before the page gives the connection up and opens another, in milliseconds.
 */
const PING_EVERY = 5000;
const SHAKY_AFTER = 3000;
const SILENT_FOR = 10000;
/** The close code of a connection given up for silence, so the server's log can tell it from one the network broke. */
const SILENT = 4000;

/**
 * Opens when a message is first sent; closing it takes the player out of their room. The server
 * reads who is signed in once, as it opens, so it is opened afresh each time the player comes to multiplayer.
 * A connection that closes by itself (a phone put away, a new version of the server) is opened again, and
 * the player taken back to their room; only if that fails is it lost.
 */
export class RoomClient {
  view: RoomView | null = null;
  private socket: WebSocket | null = null;
  /** The tries left to come back to the room, while the page is trying. */
  private retries = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  /** When the oldest ping the server has not answered was sent, by `Date.now()`, which keeps counting while the device sleeps. */
  private asked: number | null = null;

  constructor(private hear: (message: Heard) => void) {}

  /** Whether the player may be cut off from their room: the page is getting back in, or the server has gone quiet. */
  get offline(): boolean {
    return this.retries > 0 || (this.asked !== null && Date.now() - this.asked > SHAKY_AFTER);
  }

  send(message: ClientMessage) {
    // Whatever is done while the page is away is lost, as it would be in the room.
    if (this.retries) return;
    this.write(this.socket ?? this.open(), message);
  }

  leave() {
    if (this.retries) return this.close();
    this.view = null;
    if (this.socket) this.send({ type: "leave" });
  }

  close() {
    const socket = this.socket;
    // The server keeps the place of a player whose connection closes, unless they say they are leaving.
    if (socket && this.view) this.write(socket, { type: "leave" });
    this.socket = null;
    this.view = null;
    this.retries = 0;
    this.asked = null;
    clearTimeout(this.retry);
    socket?.close();
  }

  private write(socket: WebSocket, message: ClientMessage) {
    const text = JSON.stringify(message);
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
    else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener("open", () => socket.send(text), { once: true });
  }

  private comeBack(view: RoomView) {
    this.retries--;
    const you = view.players.find((player) => player.id === view.you)!;
    this.write(this.open(), { type: "back", code: view.code, id: view.you, nickname: you.nickname, suit: you.suit, settings: view.settings });
  }

  private open(): WebSocket {
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room`);
    this.asked = null;
    // A connection whose way has broken (a phone changing networks) can stay open for minutes and swallow what is sent,
    // and a page never sees the pings the server sends: it pings for itself.
    const beat = setInterval(() => {
      if (this.socket !== socket) return clearInterval(beat);
      if (this.asked !== null && Date.now() - this.asked >= SILENT_FOR) {
        closed();
        return socket.close(SILENT);
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
      this.asked ??= Date.now();
    }, PING_EVERY);
    const closed = () => {
      clearInterval(beat);
      // A connection closed on purpose says nothing.
      if (this.socket !== socket) return;
      this.socket = null;
      this.asked = null;
      const view = this.view;
      if (!view) return this.lose();
      if (!this.retries) this.retries = RETRIES;
      else if (this.retries === 1) return this.lose();
      this.retry = setTimeout(() => this.comeBack(view), this.retries === RETRIES ? 0 : RETRY_EVERY);
    };
    socket.addEventListener("message", (event) => {
      // A connection given up for silence may still deliver what it held, from a room as it was then.
      if (this.socket !== socket) return;
      this.asked = null;
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "pong") return;
      if (this.retries && message.type === "refused") return this.lose();
      if (message.type === "room") this.retries = 0;
      if (message.type === "room") this.view = message.room;
      else if (message.type === "removed") this.view = null;
      this.hear(message);
    });
    socket.addEventListener("close", closed);
    return (this.socket = socket);
  }

  private lose() {
    const socket = this.socket;
    this.socket = null;
    this.view = null;
    this.retries = 0;
    this.asked = null;
    socket?.close();
    this.hear({ type: "lost" });
  }
}
