import {
  AIR_MAX, AIR_MIN, DEFAULT_AIR, DEFAULT_SETTINGS, DIVE_PROMPTS, MAX_PLAYERS, ROOM_CODE_LENGTH, SUITS,
  type ClientMessage, type Refusal, type RoomPlayer, type RoomSettings, type RoomView, type ServerMessage,
} from "../shared/room";
import { USERNAME } from "../shared/types";
import { listPacks, loadPack } from "./custom";
import { Dive, enoughFor, realClock, type Clock } from "./dive";
import { OWN, buildIndex, pickPrompts, shuffle, type PromptIndex } from "./game";
import { loadKey } from "./keys";
import { judgeLive } from "./live";

/** One connection. `accountId` is who was signed in when it was opened. */
export type Member = { accountId: string | null; send(message: ServerMessage): void };

type Player = RoomPlayer & { member: Member };
/** The host is the first of the players for as long as the room lasts. `last` is how the dive before ended. */
type Room = { code: string; players: Player[]; settings: RoomSettings; nextId: number; dive: Dive | null; last: RoomView["last"] };

/** Letters the game's small capitals cannot mix up: no I or O (1 and 0), Q (O), B (R), V (U) or X (K). */
const LETTERS = "ACDEFGHJKLMNPRSTUWYZ";
const rooms = new Map<string, Room>();
/** The room each connection is in. */
const places = new Map<Member, Room>();
let builtIn: PromptIndex = new Map();
let clock: Clock = realClock;

/** The built-in prompts, and in the tests a clock moved by hand. */
export function usePrompts(index: PromptIndex, time: Clock = realClock) {
  builtIn = index;
  clock = time;
}

function newCode(): string {
  for (;;) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH)), (n) => LETTERS[n % LETTERS.length]).join("");
    if (!rooms.has(code)) return code;
  }
}

function tell(room: Room) {
  const players = room.players.map(({ member, ...player }) => player);
  const dive = room.dive?.view() ?? null;
  for (const { member, id } of room.players) member.send({ type: "room", room: { code: room.code, you: id, players, settings: room.settings, dive, last: room.last } });
}

/** Put a connection into a room, or say why not. Without a `code` the room is a new one and the player its host. */
function enter(member: Member, message: { nickname: string; suit: number }, code?: string): Refusal | void {
  const nickname = String(message.nickname ?? "").trim().toLowerCase();
  if (!USERNAME.test(nickname)) return "bad-name";
  if (!Number.isInteger(message.suit) || message.suit < 0 || message.suit >= SUITS) return "bad-suit";
  const room: Room | undefined =
    code === undefined ? { code: newCode(), players: [], settings: DEFAULT_SETTINGS, nextId: 0, dive: null, last: null } : rooms.get(code.trim().toUpperCase());
  if (!room) return "no-room";
  if (room.players.length >= MAX_PLAYERS) return "full";
  if (room.players.some((player) => player.nickname === nickname)) return "name-taken";
  room.players.push({ id: room.nextId++, nickname, suit: message.suit, ready: false, host: !room.players.length, member });
  rooms.set(room.code, room);
  places.set(member, room);
  tell(room);
}

/** Whether the host may make these changes: only packs of their own, and judging only with a key of theirs to pay for it. */
async function allowed(accountId: string | null, changes: Partial<RoomSettings>): Promise<boolean> {
  if (Array.isArray(changes.ownPacks) && changes.ownPacks.length) {
    const own = new Set(accountId ? (await listPacks(accountId)).map((pack) => pack.id) : []);
    if (!changes.ownPacks.every((id) => own.has(id))) return false;
  }
  if (changes.judging) return !!accountId && (await keyed(accountId));
  return true;
}

async function keyed(accountId: string): Promise<boolean> {
  return ((await loadKey(accountId, "jev")) ?? (await loadKey(accountId, "anthropic"))) !== null;
}

async function change(member: Member, room: Room, changes: Partial<RoomSettings>): Promise<Refusal | void> {
  if (room.players[0]!.member !== member) return "not-host";
  if (room.dive) return;
  if (!(await allowed(member.accountId, changes))) return "bad-settings";
  // The host may have left while the database was asked. The settings are read only now, so that two changes sent close together both count.
  if (places.get(member) !== room || room.dive) return;
  const old = room.settings;
  const settings: RoomSettings = {
    mode: changes.mode ?? old.mode,
    air: changes.air ?? (changes.mode ? DEFAULT_AIR[changes.mode] : old.air),
    builtIn: changes.builtIn ?? old.builtIn,
    ownPacks: changes.ownPacks ?? old.ownPacks,
    judging: changes.judging ?? old.judging,
  };
  const sound =
    (settings.mode === "deepest" || settings.mode === "longest") && Number.isInteger(settings.air) && settings.air >= AIR_MIN && settings.air <= AIR_MAX &&
    typeof settings.builtIn === "boolean" && typeof settings.judging === "boolean" &&
    Array.isArray(settings.ownPacks) && new Set(settings.ownPacks).size === settings.ownPacks.length &&
    (settings.builtIn || settings.ownPacks.length > 0);
  if (!sound) return "bad-settings";
  room.settings = settings;
  // Whoever was ready had agreed to the settings as they were.
  for (const player of room.players) player.ready = false;
  tell(room);
}

/**
 * Begin a dive, once every guest is ready. A pack of the host's that is gone by now is left
 * out, and without a key any more the answers are judged only by the pack and kept rulings.
 */
async function start(member: Member, room: Room): Promise<Refusal | void> {
  if (room.players[0]!.member !== member) return "not-host";
  if (room.dive) return;
  if (room.players.some((player) => !player.host && !player.ready)) return "not-ready";
  const { accountId } = member;
  const own = accountId ? (await Promise.all(room.settings.ownPacks.map((id) => loadPack(accountId, id)))).filter((pack) => pack !== null) : [];
  const judgeAs = accountId && room.settings.judging && (await keyed(accountId)) ? accountId : null;
  if (places.get(member) !== room || room.dive) return;
  room.settings = { ...room.settings, ownPacks: own.map((pack) => pack.id), judging: judgeAs !== null };
  const index = enoughFor(new Map([...(room.settings.builtIn ? builtIn : []), ...buildIndex(own, OWN)]), room.players.length);
  if (!index.size) return "no-prompts";
  room.last = null;
  const { mode } = room.settings;
  room.dive = new Dive({
    mode,
    index,
    // "Longest" goes on until the prompts run out.
    prompts: pickPrompts(index, mode === "deepest" ? DIVE_PROMPTS : index.size),
    order: shuffle(room.players.map((player) => player.id)),
    air: room.settings.air,
    live: (entry, typed) => judgeLive(entry, typed, judgeAs),
    clock,
    changed: () => tell(room),
    ended: (divers) => {
      room.dive = null;
      room.last = { mode, divers };
      for (const player of room.players) player.ready = false;
      tell(room);
    },
  });
  room.dive.start();
}

/** Take a connection out of its room, if it is in one. When the host goes, so does the room. */
export function leave(member: Member) {
  const room = places.get(member);
  if (!room) return;
  places.delete(member);
  if (room.players[0]!.member === member) {
    rooms.delete(room.code);
    room.dive?.close();
    for (const { member: other } of room.players.slice(1)) {
      places.delete(other);
      other.send({ type: "closed" });
    }
  } else {
    const id = room.players.find((player) => player.member === member)!.id;
    room.players = room.players.filter((player) => player.member !== member);
    room.dive?.drop(id);
    tell(room);
  }
}

/** Act on what a browser sent. A message that makes no sense where it arrives is ignored. */
export async function receive(member: Member, text: string) {
  let message: ClientMessage;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  const room = places.get(member);
  const refuse = (reason: Refusal | void) => reason && member.send({ type: "refused", reason });
  if (message?.type === "create" && !room) refuse(enter(member, message));
  else if (message?.type === "join" && !room) refuse(enter(member, message, String(message.code ?? "")));
  else if (message?.type === "settings" && room) refuse(await change(member, room, message.settings ?? {}));
  else if (message?.type === "start" && room) refuse(await start(member, room));
  else if ((message?.type === "typing" || message?.type === "answer") && room?.dive) {
    const id = room.players.find((player) => player.member === member)!.id;
    if (message.type === "typing") room.dive.type(id, message.text);
    else await room.dive.answer(id, message.text);
  } else if (message?.type === "ready" && room) {
    const player = room.players.find((player) => player.member === member)!;
    // The host has no ready of their own: starting the game is it.
    if (player.host || room.dive) return;
    player.ready = message.ready === true;
    tell(room);
  } else if (message?.type === "leave") leave(member);
}
