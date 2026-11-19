import type { ClientMessage, RoomView, ServerMessage } from "../shared/room";

export type Heard = ServerMessage | { type: "lost" };

/** How often, and how many times, a page whose connection closed tries to take its place in the room back, in milliseconds. */
const RETRY_EVERY = 2000;
const RETRIES = 15;

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

  constructor(private hear: (message: Heard) => void) {}

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
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (this.retries && message.type === "refused") return this.lose();
      if (message.type === "room") this.retries = 0;
      if (message.type === "room") this.view = message.room;
      else if (message.type === "removed") this.view = null;
      this.hear(message);
    });
    socket.addEventListener("close", () => {
      // A connection closed on purpose says nothing.
      if (this.socket !== socket) return;
      this.socket = null;
      const view = this.view;
      if (!view) return this.lose();
      if (!this.retries) this.retries = RETRIES;
      else if (this.retries === 1) return this.lose();
      this.retry = setTimeout(() => this.comeBack(view), this.retries === RETRIES ? 0 : RETRY_EVERY);
    });
    return (this.socket = socket);
  }

  private lose() {
    const socket = this.socket;
    this.socket = null;
    this.view = null;
    this.retries = 0;
    socket?.close();
    this.hear({ type: "lost" });
  }
}
