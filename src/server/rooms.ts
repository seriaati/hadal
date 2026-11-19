import {
  AIR_MAX, AIR_MIN, DEFAULT_AIR, DEFAULT_SETTINGS, DIVE_PROMPTS, MAX_PLAYERS, MODES, ROOM_CODE_LENGTH, SUITS,
  type ClientMessage, type Gone, type Refusal, type RoomPlayer, type RoomSettings, type RoomView, type ServerMessage,
} from "../shared/room";
import type { Language } from "../shared/language";
import { USERNAME, type Pack } from "../shared/types";
import { listPacks, loadPack } from "./custom";
import { Dive, enoughFor, realClock, type Clock } from "./dive";
import { OWN, buildIndex, pickPrompts, shuffle, type PromptIndex } from "./game";
import { loadKey } from "./keys";
import { judgeLive } from "./live";

/**
 * One connection. `accountId` is who was signed in when it was opened, not now; `browser` is the id the browser keeps in a
 * cookie; `language` is the language the player plays in.
 */
export type Member = { accountId: string | null; browser: string; language: Language; send(message: ServerMessage): void };

type Player = RoomPlayer & { member: Member };
/** `last` is how the dive before ended. `banned` holds the browsers and accounts the host banned, for as long as the room lasts. */
type Room = { code: string; players: Player[]; settings: RoomSettings; nextId: number; dive: Dive | null; last: RoomView["last"]; banned: Set<string> };

/** Letters the game's small capitals cannot mix up: no I or O (1 and 0), Q (O), B (R), V (U) or X (K). */
const LETTERS = "ACDEFGHJKLMNPRSTUWYZ";
const rooms = new Map<string, Room>();
const places = new Map<Member, Room>();
let builtIn: PromptIndex = new Map();
let builtInPacks: string[] = [];
/** The ids of each language's built-in packs: a new room plays those of its host's language. */
let packsIn: Partial<Record<Language, string[]>> = {};
let clock: Clock = realClock;

const packOf = (promptId: string) => promptId.slice(0, promptId.indexOf("/"));
const isHost = (member: Member, room: Room) => room.players.some((player) => player.host && player.member === member);
/** What a ban holds on to: the browser, and the account if one is signed in. */
const marks = ({ browser, accountId }: Member) => [`browser:${browser}`, ...(accountId ? [`account:${accountId}`] : [])];

/** The built-in packs of every language, and in the tests a clock moved by hand. A room may play packs of any language. */
export function usePrompts(packs: Record<Language, Pack[]>, time: Clock = realClock) {
  builtIn = buildIndex(Object.values(packs).flat());
  builtInPacks = [...new Set([...builtIn.keys()].map(packOf))];
  packsIn = Object.fromEntries(Object.entries(packs).map(([language, list]) => [language, list.map((pack) => pack.id)]));
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

/** Without a `code` the room is a new one and the player its host. */
function enter(member: Member, message: { nickname: string; suit: number }, code?: string): Refusal | void {
  const nickname = String(message.nickname ?? "").trim().toLowerCase();
  if (!USERNAME.test(nickname)) return "bad-name";
  if (!Number.isInteger(message.suit) || message.suit < 0 || message.suit >= SUITS) return "bad-suit";
  const room: Room | undefined =
    code === undefined ? { code: newCode(), players: [], settings: { ...DEFAULT_SETTINGS, builtIn: packsIn[member.language] ?? [] }, nextId: 0, dive: null, last: null, banned: new Set() } : rooms.get(code.trim().toUpperCase());
  if (!room) return "no-room";
  if (marks(member).some((mark) => room.banned.has(mark))) return "banned";
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
  if (!isHost(member, room)) return "not-host";
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
    MODES.includes(settings.mode) && Number.isInteger(settings.air) && settings.air >= AIR_MIN && settings.air <= AIR_MAX &&
    typeof settings.judging === "boolean" &&
    Array.isArray(settings.builtIn) && new Set(settings.builtIn).size === settings.builtIn.length && settings.builtIn.every((id) => builtInPacks.includes(id)) &&
    Array.isArray(settings.ownPacks) && new Set(settings.ownPacks).size === settings.ownPacks.length;
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
  if (!isHost(member, room)) return "not-host";
  if (room.dive) return;
  if (room.players.some((player) => !player.host && !player.ready)) return "not-ready";
  // A room may be set up with no pack while the host chooses, but not dive without one.
  if (!room.settings.builtIn.length && !room.settings.ownPacks.length) return "no-packs";
  const { accountId } = member;
  const own = accountId ? (await Promise.all(room.settings.ownPacks.map((id) => loadPack(accountId, id)))).filter((pack) => pack !== null) : [];
  const judgeAs = accountId && room.settings.judging && (await keyed(accountId)) ? accountId : null;
  if (places.get(member) !== room || room.dive) return;
  room.settings = { ...room.settings, ownPacks: own.map((pack) => pack.id), judging: judgeAs !== null };
  const chosen = [...builtIn].filter(([id]) => room.settings.builtIn.includes(packOf(id)));
  const index = enoughFor(new Map([...chosen, ...buildIndex(own, OWN)]), room.players.length);
  if (!index.size) return "no-prompts";
  room.last = null;
  const { mode } = room.settings;
  room.dive = new Dive({
    mode,
    index,
    // "Longest" and "chaos" go on until the prompts run out.
    prompts: pickPrompts(index, mode === "deepest" ? DIVE_PROMPTS : index.size),
    order: shuffle(room.players.map((player) => player.id)),
    air: room.settings.air,
    // A host who leaves takes their key with them.
    live: (entry, typed) => judgeLive(entry, typed, isHost(member, room) ? judgeAs : null),
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

/**
 * The crown passes to `player`. The packs of the host's own and their judge go with the old host, and without them
 * whoever was ready had agreed to other settings.
 */
function pass(room: Room, player: Player) {
  for (const one of room.players) one.host = one === player;
  player.ready = false;
  const { ownPacks, judging } = room.settings;
  if (ownPacks.length || judging) {
    room.settings = { ...room.settings, ownPacks: [], judging: false };
    for (const one of room.players) one.ready = false;
  }
}

function crown(member: Member, room: Room, id: number) {
  const player = room.players.find((one) => one.id === id);
  if (!isHost(member, room) || room.dive || !player || player.member === member) return;
  pass(room, player);
  tell(room);
}

function farewell(room: Room, id: number, how: Gone) {
  for (const { member } of room.players) member.send({ type: "gone", id, how });
}

/** The host takes a player out of the room. One banned cannot come back while the room lasts. */
function remove(member: Member, room: Room, id: number, ban: boolean) {
  const player = room.players.find((one) => one.id === id);
  if (!isHost(member, room) || room.dive || !player || player.member === member) return;
  if (ban) for (const mark of marks(player.member)) room.banned.add(mark);
  room.players = room.players.filter((one) => one !== player);
  places.delete(player.member);
  player.member.send({ type: "removed", banned: ban });
  farewell(room, player.id, ban ? "banned" : "removed");
  tell(room);
}

/** When the host goes, the crown passes to the player after them. When the last player goes, so does the room. */
export function leave(member: Member) {
  const room = places.get(member);
  if (!room) return;
  places.delete(member);
  const at = room.players.findIndex((player) => player.member === member);
  const [gone] = room.players.splice(at, 1);
  if (!room.players.length) {
    rooms.delete(room.code);
    return room.dive?.close();
  }
  farewell(room, gone!.id, "left");
  if (gone!.host) pass(room, room.players[at % room.players.length]!);
  room.dive?.drop(gone!.id);
  tell(room);
}

/** A message that makes no sense where it arrives is ignored. */
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
  else if (message?.type === "host" && room) crown(member, room, message.id);
  else if (message?.type === "remove" && room) remove(member, room, message.id, message.ban === true);
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
