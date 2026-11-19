import type { ClientMessage, RoomView, ServerMessage } from "../shared/room";

export type Heard = ServerMessage | { type: "lost" };

/**
 * Opens when a message is first sent; closing it takes the player out of their room. The server
 * reads who is signed in once, as it opens, so it is opened afresh each time the player comes to multiplayer.
 */
export class RoomClient {
  view: RoomView | null = null;
  private socket: WebSocket | null = null;

  constructor(private hear: (message: Heard) => void) {}

  send(message: ClientMessage) {
    const socket = this.socket ?? this.open();
    const text = JSON.stringify(message);
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
    else socket.addEventListener("open", () => socket.send(text), { once: true });
  }

  leave() {
    this.view = null;
    if (this.socket) this.send({ type: "leave" });
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.view = null;
    socket?.close();
  }

  private open(): WebSocket {
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room`);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "room") this.view = message.room;
      else if (message.type === "removed") this.view = null;
      this.hear(message);
    });
    socket.addEventListener("close", () => {
      // A connection closed on purpose says nothing.
      if (this.socket !== socket) return;
      this.socket = null;
      this.view = null;
      this.hear({ type: "lost" });
    });
    return (this.socket = socket);
  }
}
