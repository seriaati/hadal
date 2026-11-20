import { afterAll, expect, test } from "bun:test";
import { DEFAULT_SETTINGS as SHARED_DEFAULTS, type ClientMessage, type RoomView, type ServerMessage } from "../shared/room";
import type { Pack } from "../shared/types";
import { accountIdOf, signUp } from "./accounts";
import { savePack } from "./custom";
import { migrate, sql } from "./db";
import { saveKey } from "./keys";
import { leave, lost, receive, usePrompts, type Member } from "./rooms";

type Fake = Member & { sent: ServerMessage[] };
const member = (accountId: string | null = null, browser: string = crypto.randomUUID()): Fake => {
  const sent: ServerMessage[] = [];
  return { accountId, browser, language: "en", sent, send: (message) => sent.push(message) };
};
const say = (from: Fake, message: ClientMessage) => receive(from, JSON.stringify(message));
/** The room as the member was last sent it. */
const seen = (who: Fake): RoomView => {
  const last = who.sent.at(-1)!;
  if (last.type !== "room") throw new Error(`last sent ${JSON.stringify(last)}`);
  return last.room;
};
const names = (who: Fake) => seen(who).players.map((player) => player.nickname);
/** A room with its host, and the guests named, already in it. */
const room = async (hostAccount: string | null = null, ...guests: string[]) => {
  const host = member(hostAccount);
  await say(host, { type: "create", nickname: "host", suit: 0 });
  const others = guests.map(() => member());
  for (const [i, guest] of others.entries()) await say(guest, { type: "join", code: seen(host).code, nickname: guests[i]!, suit: 1 });
  return { host, others, code: seen(host).code };
};

const inEnglish = (packs: Pack[]) => ({ en: packs, "zh-CN": [], "zh-TW": [] });
const ocean = { id: "two", text: "Name an ocean", answers: [{ text: "Pacific", rarity: 10 }, { text: "Indian", rarity: 60 }] };
const lake = { id: "one", text: "Name a lake", answers: [{ text: "Baikal", rarity: 10 }, { text: "Titicaca", rarity: 60 }] };
usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [ocean] }, { id: "lakes", name: "Lakes", prompts: [lake] }]));
const DEFAULT_SETTINGS = { ...SHARED_DEFAULTS, builtIn: ["seas", "lakes"] };

// The tests of the host's packs and keys need the database (`docker compose up -d db`). Their accounts are removed afterwards.
await migrate();
const made: string[] = [];
const account = async () => {
  const name = `test${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  made.push(name);
  const entry = await signUp(name, "correct horse");
  if ("error" in entry) throw new Error(entry.error);
  return (await accountIdOf(entry.token))!;
};
afterAll(async () => {
  await sql`delete from accounts where username in ${sql(made)}`;
});

test("a new room plays the built-in packs of its host's language", async () => {
  usePrompts({ en: [{ id: "seas", name: "Seas", prompts: [ocean] }], "zh-CN": [{ id: "hu", name: "湖泊", prompts: [lake] }], "zh-TW": [] });
  const host = { ...member(), language: "zh-CN" as const };
  await say(host, { type: "create", nickname: "host", suit: 0 });
  expect(seen(host).settings.builtIn).toEqual(["hu"]);
  // Packs of another language may still be chosen.
  await say(host, { type: "settings", settings: { builtIn: ["hu", "seas"] } });
  expect(seen(host).settings.builtIn).toEqual(["hu", "seas"]);
  leave(host);
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [ocean] }, { id: "lakes", name: "Lakes", prompts: [lake] }]));
});

test("creating a room makes its host, with a code and the settings a room starts with", async () => {
  const host = member();
  await say(host, { type: "create", nickname: " Ana ", suit: 3 });
  const view = seen(host);
  expect(view.code).toMatch(/^[ACDEFGHJKLMNPRSTUWYZ]{5}$/);
  expect(view.players).toEqual([{ id: view.you, nickname: "ana", suit: 3, ready: false, host: true }]);
  expect(view.settings).toEqual(DEFAULT_SETTINGS);
});

test("a player joins with the code in any case, and everyone is sent the room", async () => {
  const { host, code } = await room();
  const guest = member();
  await say(guest, { type: "join", code: ` ${code.toLowerCase()} `, nickname: "ben", suit: 2 });
  expect(names(host)).toEqual(["host", "ben"]);
  expect(names(guest)).toEqual(["host", "ben"]);
  expect(seen(guest).you).not.toBe(seen(host).you);
  expect(seen(guest).players[1]).toMatchObject({ id: seen(guest).you, suit: 2, host: false });
});

test("joining is refused with the reason", async () => {
  const { code } = await room(null, "ben");
  const refused = async (message: ClientMessage) => {
    const guest = member();
    await say(guest, message);
    return guest.sent;
  };
  expect(await refused({ type: "join", code: "ZZZZZZ", nickname: "cal", suit: 0 })).toEqual([{ type: "refused", reason: "no-room" }]);
  expect(await refused({ type: "join", code, nickname: "BEN", suit: 0 })).toEqual([{ type: "refused", reason: "name-taken" }]);
  expect(await refused({ type: "join", code, nickname: "c al", suit: 0 })).toEqual([{ type: "refused", reason: "bad-name" }]);
  expect(await refused({ type: "join", code, nickname: "ben!", suit: 0 })).toEqual([{ type: "refused", reason: "bad-name" }]);
  expect(await refused({ type: "join", code, nickname: "a".repeat(17), suit: 0 })).toEqual([{ type: "refused", reason: "bad-name" }]);
  expect(await refused({ type: "join", code, nickname: "cal", suit: 6 })).toEqual([{ type: "refused", reason: "bad-suit" }]);
  expect(await refused({ type: "create", nickname: "cal", suit: 1.5 })).toEqual([{ type: "refused", reason: "bad-suit" }]);
});

test("a name in a room may be in any script", async () => {
  const { host, code } = await room();
  for (const nickname of ["小明", "Ана", "Bo"]) await say(member(), { type: "join", code, nickname, suit: 0 });
  expect(names(host)).toEqual(["host", "小明", "ана", "bo"]);
});

test("a room holds six", async () => {
  const { host, code } = await room(null, "pal1", "pal2", "pal3", "pal4", "pal5");
  const seventh = member();
  await say(seventh, { type: "join", code, nickname: "pal6", suit: 0 });
  expect(seventh.sent).toEqual([{ type: "refused", reason: "full" }]);
  expect(names(host)).toHaveLength(6);
});

test("a connection is in one room at a time", async () => {
  const { others: [guest], code } = await room(null, "ben");
  const before = guest!.sent.length;
  await say(guest!, { type: "create", nickname: "ben", suit: 0 });
  await say(guest!, { type: "join", code, nickname: "ben2", suit: 0 });
  expect(guest!.sent).toHaveLength(before);
});

test("a guest says they are ready; the host has no ready to give", async () => {
  const { host, others: [guest] } = await room(null, "ben");
  await say(guest!, { type: "ready", ready: true });
  await say(host, { type: "ready", ready: true });
  expect(seen(host).players.map((player) => player.ready)).toEqual([false, true]);
  await say(guest!, { type: "ready", ready: false });
  expect(seen(host).players.map((player) => player.ready)).toEqual([false, false]);
});

test("a player joins in the suit they chose if nobody wears it, otherwise in one nobody wears", async () => {
  const { host, code } = await room(null, "ben", "cal");
  expect(seen(host).players.map((player) => player.suit)).toEqual([0, 1, expect.any(Number)]);
  const free = [0, 1, 2, 3, 4, 5].find((suit) => !seen(host).players.some((player) => player.suit === suit))!;
  const dan = member();
  await say(dan, { type: "join", code, nickname: "dan", suit: free });
  const suits = seen(host).players.map((player) => player.suit);
  expect(suits[3]).toBe(free);
  expect(new Set(suits).size).toBe(4);
  leave(host);
});

test("a player whose connection closes keeps their place, and takes it back from the same browser", async () => {
  const { host, others: [ben], code } = await room(null, "ben");
  const id = seen(ben!).you;
  lost(ben!);
  expect(names(host)).toEqual(["host", "ben"]);
  const stranger = member();
  await say(stranger, { type: "back", code, id, nickname: "ben", suit: 1, settings: {} });
  expect(stranger.sent.at(-1)).toEqual({ type: "refused", reason: "name-taken" });
  const again = member(null, ben!.browser);
  await say(again, { type: "back", code, id, nickname: "ben", suit: 1, settings: {} });
  expect(seen(again).you).toBe(id);
  expect(names(again)).toEqual(["host", "ben"]);
  // The old connection's place is the new one's: closing it again does nothing more.
  lost(ben!);
  await say(again, { type: "ready", ready: true });
  expect(seen(host).players[1]!.ready).toBe(true);
  leave(again);
  expect(names(host)).toEqual(["host"]);
  leave(host);
});

test("a ping is answered at once, in a room or out of one", async () => {
  const stranger = member();
  await say(stranger, { type: "ping" });
  expect(stranger.sent).toEqual([{ type: "pong" }]);
  const { host } = await room();
  await say(host, { type: "ping" });
  expect(host.sent.at(-1)).toEqual({ type: "pong" });
  leave(host);
});

test("a room the server no longer has is opened again under its code by the first player back", async () => {
  const code = "ACDEF";
  const ana = member();
  await say(ana, { type: "back", code, id: 3, nickname: "ana", suit: 2, settings: { mode: "longest" } });
  expect(seen(ana)).toMatchObject({ code, players: [{ nickname: "ana", suit: 2, host: true }], dive: null });
  expect(seen(ana).settings.mode).toBe("longest");
  const ben = member();
  await say(ben, { type: "back", code, id: 0, nickname: "ben", suit: 2, settings: {} });
  expect(names(ana)).toEqual(["ana", "ben"]);
  expect(seen(ana).settings.mode).toBe("longest");
  const odd = member();
  await say(odd, { type: "back", code: "AB0", id: 0, nickname: "cal", suit: 0, settings: {} });
  expect(odd.sent.at(-1)).toEqual({ type: "refused", reason: "no-room" });
  leave(ana);
  leave(ben);
});

test("a player changes their suit in the room, but not during a dive", async () => {
  const { host, others: [ben] } = await room(null, "ben");
  await say(ben!, { type: "suit", suit: 4 });
  expect(seen(host).players.map((player) => player.suit)).toEqual([0, 4]);
  await say(ben!, { type: "suit", suit: 6 });
  expect(ben!.sent.at(-1)).toEqual({ type: "refused", reason: "bad-suit" });
  await say(ben!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  const before = host.sent.length;
  await say(ben!, { type: "suit", suit: 2 });
  expect(host.sent).toHaveLength(before);
  leave(host);
});

test("only the host changes the settings, and a change takes back every ready", async () => {
  const { host, others: [guest] } = await room(null, "ben");
  await say(guest!, { type: "ready", ready: true });
  await say(guest!, { type: "settings", settings: { air: 20 } });
  expect(guest!.sent.at(-1)).toEqual({ type: "refused", reason: "not-host" });
  await say(host, { type: "settings", settings: { air: 20 } });
  expect(seen(guest!).settings).toEqual({ ...DEFAULT_SETTINGS, air: 20 });
  expect(seen(guest!).players[1]!.ready).toBe(false);
});

test("a new mode brings its own air unless the air is given too", async () => {
  const { host } = await room();
  await say(host, { type: "settings", settings: { mode: "longest" } });
  expect(seen(host).settings).toMatchObject({ mode: "longest", air: 15 });
  await say(host, { type: "settings", settings: { mode: "deepest", air: 45 } });
  expect(seen(host).settings).toMatchObject({ mode: "deepest", air: 45 });
});

test("the host sets how easily new hearts are won, medium at first", async () => {
  const { host } = await room();
  expect(seen(host).settings.hearts).toBe("medium");
  await say(host, { type: "settings", settings: { hearts: "hard" } });
  expect(seen(host).settings.hearts).toBe("hard");
});

test("settings that cannot be are refused and change nothing", async () => {
  const { host } = await room();
  const bad = [{ air: 4 }, { air: 61 }, { air: 20.5 }, { air: "20" }, { mode: "widest" }, { builtIn: false }, { builtIn: "yes" }, { builtIn: ["rivers"] }, { builtIn: [1] }, { builtIn: ["seas", "seas"] }, { ownPacks: "rivers" }, { judging: 1 }, { hearts: "extreme" }, { hearts: 2 }];
  for (const settings of bad) {
    await say(host, { type: "settings", settings: settings as never });
    expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
  }
  await say(host, { type: "settings", settings: {} });
  expect(seen(host).settings).toEqual(DEFAULT_SETTINGS);
});

test("a host without an account has no packs of their own and no judge", async () => {
  const { host } = await room();
  await say(host, { type: "settings", settings: { ownPacks: ["rivers"] } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
  await say(host, { type: "settings", settings: { judging: true } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
});

test("the host plays packs of their own, and only those", async () => {
  const id = await account();
  const pack = { id: "rivers", name: "Rivers", prompts: [{ id: "africa", text: "Name a river in Africa", answers: [{ text: "Nile", rarity: 10 }, { text: "Okavango", rarity: 100 }] }] };
  expect(await savePack(id, JSON.stringify(pack))).toEqual([]);
  const { host } = await room(id);
  await say(host, { type: "settings", settings: { builtIn: [], ownPacks: ["rivers"] } });
  expect(seen(host).settings).toMatchObject({ builtIn: [], ownPacks: ["rivers"] });
  await say(host, { type: "settings", settings: { ownPacks: ["rivers", "lakes"] } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
  await say(host, { type: "settings", settings: { ownPacks: ["rivers", "rivers"] } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
});

test("a new room starts with the settings the host's browser remembers, as far as they still hold", async () => {
  const host = member();
  const settings = { mode: "longest", air: 25, hearts: "hard", builtIn: ["lakes", "rivers", "lakes"], ownPacks: ["mine"], judging: true } as const;
  await say(host, { type: "create", nickname: "host", suit: 0, settings: { ...settings, builtIn: [...settings.builtIn], ownPacks: [...settings.ownPacks] } });
  expect(seen(host).settings).toEqual({ mode: "longest", air: 25, hearts: "hard", builtIn: ["lakes"], ownPacks: [], judging: false });
  leave(host);
  const odd = member();
  await say(odd, { type: "create", nickname: "host", suit: 0, settings: { mode: "chaos", air: 99, builtIn: ["gone"] } as never });
  expect(seen(odd).settings).toEqual({ ...DEFAULT_SETTINGS, mode: "chaos", air: 8 });
  leave(odd);
});

test("a host's remembered packs of their own and judge come back while they still have them", async () => {
  const id = await account();
  const pack = { id: "rivers", name: "Rivers", prompts: [{ id: "africa", text: "Name a river in Africa", answers: [{ text: "Nile", rarity: 10 }, { text: "Okavango", rarity: 100 }] }] };
  expect(await savePack(id, JSON.stringify(pack))).toEqual([]);
  expect(await saveKey(id, "jev", "jev-test-0123456789")).toBeNull();
  const host = member(id);
  await say(host, { type: "create", nickname: "host", suit: 0, settings: { ownPacks: ["rivers", "gone"], judging: true } });
  expect(seen(host).settings).toMatchObject({ ownPacks: ["rivers"], judging: true });
  leave(host);
});

test("the host chooses which built-in packs to play, and may choose none until the dive starts", async () => {
  const { host, others } = await room(null, "ben");
  await say(host, { type: "settings", settings: { builtIn: ["lakes"] } });
  expect(seen(host).settings.builtIn).toEqual(["lakes"]);
  await say(host, { type: "settings", settings: { builtIn: [] } });
  expect(seen(host).settings.builtIn).toEqual([]);
  await say(others[0]!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "no-packs" });
  await say(host, { type: "settings", settings: { builtIn: ["lakes"] } });
  await say(others[0]!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  expect(seen(host).dive!.prompt.text).toBe("Name a lake");
  leave(host);
});

test("judging can be turned on only by a host who keeps a key", async () => {
  process.env.HADAL_SECRET = "a secret for the tests, long enough";
  const id = await account();
  const { host } = await room(id);
  await say(host, { type: "settings", settings: { judging: true } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "bad-settings" });
  expect(await saveKey(id, "jev", "jev-test-0123456789")).toBeNull();
  await say(host, { type: "settings", settings: { judging: true } });
  expect(seen(host).settings.judging).toBe(true);
});

test("a guest who leaves or drops is gone from the room", async () => {
  const { host, others: [ben, cal] } = await room(null, "ben", "cal");
  await say(ben!, { type: "leave" });
  expect(names(host)).toEqual(["host", "cal"]);
  leave(cal!);
  expect(names(host)).toEqual(["host"]);
  // Having left, a player can join again, under the same name.
  await say(ben!, { type: "join", code: seen(host).code, nickname: "ben", suit: 0 });
  expect(names(host)).toEqual(["host", "ben"]);
});

test("when the host goes the crown passes to the player after them, and the room closes when the last one goes", async () => {
  const { host, others: [ben, cal], code } = await room(null, "ben", "cal");
  await say(cal!, { type: "ready", ready: true });
  await say(host, { type: "host", id: seen(cal!).you });
  const calId = seen(cal!).you;
  leave(cal!);
  expect(ben!.sent.at(-2)).toEqual({ type: "gone", id: calId, how: "left" });
  // After the last player comes the first.
  expect(seen(ben!).players.map(({ nickname, host }) => [nickname, host])).toEqual([["host", true], ["ben", false]]);
  leave(host);
  expect(seen(ben!).players).toMatchObject([{ nickname: "ben", host: true }]);
  leave(ben!);
  const late = member();
  await say(late, { type: "join", code, nickname: "cal", suit: 0 });
  expect(late.sent).toEqual([{ type: "refused", reason: "no-room" }]);
});

test("the host passes the crown", async () => {
  const { host, others: [ben, cal] } = await room(null, "ben", "cal");
  const benId = seen(ben!).you;
  await say(ben!, { type: "ready", ready: true });
  await say(cal!, { type: "ready", ready: true });
  await say(cal!, { type: "host", id: seen(cal!).you });
  expect(seen(host).players.map((player) => player.host)).toEqual([true, false, false]);
  await say(host, { type: "host", id: benId });
  // The new host has no ready of their own; the others keep theirs, since the settings did not change.
  expect(seen(cal!).players.map(({ host, ready }) => [host, ready])).toEqual([[false, false], [true, false], [false, true]]);
  await say(host, { type: "settings", settings: { air: 20 } });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "not-host" });
  await say(ben!, { type: "settings", settings: { air: 20 } });
  expect(seen(cal!).settings.air).toBe(20);
  leave(host);
  expect(names(cal!)).toEqual(["ben", "cal"]);
  leave(ben!);
  leave(cal!);
});

test("the host's own packs and judge stay theirs when the crown passes", async () => {
  process.env.HADAL_SECRET = "a secret for the tests, long enough";
  const id = await account();
  const pack = { id: "rivers", name: "Rivers", prompts: [{ id: "africa", text: "Name a river in Africa", answers: [{ text: "Nile", rarity: 10 }, { text: "Okavango", rarity: 100 }] }] };
  expect(await savePack(id, JSON.stringify(pack))).toEqual([]);
  expect(await saveKey(id, "jev", "jev-test-0123456789")).toBeNull();
  const { host, others: [ben, cal] } = await room(id, "ben", "cal");
  await say(host, { type: "settings", settings: { ownPacks: ["rivers"], judging: true } });
  await say(cal!, { type: "ready", ready: true });
  await say(host, { type: "host", id: seen(ben!).you });
  expect(seen(cal!).settings).toMatchObject({ ownPacks: [], judging: false });
  expect(seen(cal!).players.map((player) => player.ready)).toEqual([false, false, false]);
});

test("the host removes a player, who may come back with the code", async () => {
  const { host, others: [ben], code } = await room(null, "ben");
  await say(ben!, { type: "remove", id: seen(host).you, ban: false });
  expect(names(host)).toEqual(["host", "ben"]);
  const benId = seen(ben!).you;
  await say(host, { type: "remove", id: benId, ban: false });
  expect(ben!.sent.at(-1)).toEqual({ type: "removed", banned: false });
  // The others are told how ben went, then sent the room without him.
  expect(host.sent.at(-2)).toEqual({ type: "gone", id: benId, how: "removed" });
  expect(names(host)).toEqual(["host"]);
  await say(ben!, { type: "join", code, nickname: "ben", suit: 0 });
  expect(names(host)).toEqual(["host", "ben"]);
});

test("a banned player cannot come back, by another name or another connection, until the room is gone", async () => {
  const id = await account();
  const { host, code } = await room();
  const ben = member(id, "bens-browser");
  await say(ben, { type: "join", code, nickname: "ben", suit: 0 });
  await say(host, { type: "remove", id: seen(ben).you, ban: true });
  expect(ben.sent.at(-1)).toEqual({ type: "removed", banned: true });
  expect(host.sent.at(-2)).toMatchObject({ type: "gone", how: "banned" });
  const again = async (who: Fake, to = code) => {
    await say(who, { type: "join", code: to, nickname: "notben", suit: 0 });
    return who.sent.at(-1);
  };
  expect(await again(member(null, "bens-browser"))).toEqual({ type: "refused", reason: "banned" });
  expect(await again(member(id))).toEqual({ type: "refused", reason: "banned" });
  expect(names(host)).toEqual(["host"]);
  // Another room of the same host's is free to them.
  leave(host);
  await say(host, { type: "create", nickname: "host", suit: 0 });
  expect(await again(member(id, "bens-browser"), seen(host).code)).toMatchObject({ type: "room" });
});

test("nobody is crowned or removed during a dive", async () => {
  const { host, others: [ben] } = await room(null, "ben");
  await say(ben!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  expect(seen(host).dive).not.toBeNull();
  const before = host.sent.length;
  await say(host, { type: "host", id: seen(ben!).you });
  await say(host, { type: "remove", id: seen(ben!).you, ban: true });
  expect(host.sent).toHaveLength(before);
  leave(host);
});

test("nonsense is ignored", async () => {
  const { host } = await room();
  const before = host.sent.length;
  for (const text of ["", "{", "null", "7", '"join"', "[]", '{"type":"dance"}', '{"type":"settings","settings":null}', '{"type":"settings","settings":"x"}']) await receive(host, text);
  const stranger = member();
  for (const text of ['{"type":"ready","ready":true}', '{"type":"leave"}', '{"type":"settings","settings":{"air":20}}', '{"type":"join"}']) await receive(stranger, text);
  expect(stranger.sent).toEqual([{ type: "refused", reason: "bad-name" }]);
  // The two empty changes of settings are the only ones that count as a change.
  expect(host.sent.slice(before).map((message) => message.type)).toEqual(["room", "room"]);
  expect(seen(host).settings).toEqual(DEFAULT_SETTINGS);
});

test("a dive starts once every guest is ready, from prompts with an answer for each of them", async () => {
  usePrompts(
    inEnglish([
      {
        id: "seas",
        name: "Seas",
        prompts: [
          { id: "one", text: "Name a sea", answers: [{ text: "Baltic", rarity: 50 }] },
          { id: "two", text: "Name an ocean", answers: [{ text: "Pacific", rarity: 10 }, { text: "Indian", rarity: 60 }] },
        ],
      },
    ]),
  );
  const { host, others } = await room(null, "ben");
  const guest = others[0]!;
  await say(guest, { type: "start" });
  expect(guest.sent.at(-1)).toEqual({ type: "refused", reason: "not-host" });
  await say(host, { type: "start" });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "not-ready" });
  await say(guest, { type: "ready", ready: true });
  await say(host, { type: "start" });
  const dive = seen(guest).dive!;
  expect(dive.prompt.text).toBe("Name an ocean");
  expect(dive.of).toBe(1);
  expect(dive.order.toSorted()).toEqual(seen(host).players.map((player) => player.id).toSorted());
  // In a dive the room's settings stand still, and only the diver whose turn it is is heard.
  await say(host, { type: "settings", settings: { air: 20 } });
  expect(seen(host).settings.air).toBe(DEFAULT_SETTINGS.air);
  const [first, second] = dive.turn === seen(host).you ? [host, guest] : [guest, host];
  await say(second, { type: "typing", text: "pac" });
  expect(seen(host).dive!.typing).toBe("");
  await say(first!, { type: "typing", text: "pac" });
  expect(seen(second!).dive!.typing).toBe("pac");
  await say(first!, { type: "answer", text: "Pacific" });
  expect(seen(second!).dive!.verdict).toEqual({ answer: "Pacific", rarity: 10 });
  leave(host);
});

test("a dive in deepest asks 10 prompts, and one in longest every prompt there is", async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, text: `Name sea ${i}`, answers: [{ text: "Baltic", rarity: 50 }, { text: "North", rarity: 60 }] }));
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: many }]));
  const { host, others } = await room(null, "ben");
  const play = async () => {
    await say(others[0]!, { type: "ready", ready: true });
    await say(host, { type: "start" });
    return seen(host).dive!.of;
  };
  expect(await play()).toBe(10);
  leave(others[0]!);
  leave(host);
  const again = await room(null, "ben");
  await say(again.host, { type: "settings", settings: { mode: "longest" } });
  await say(again.others[0]!, { type: "ready", ready: true });
  await say(again.host, { type: "start" });
  expect(seen(again.host).dive!.of).toBe(14);
  leave(again.host);
});

test("a room is asked no prompt twice until it has been asked every one", async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, text: `Name sea ${i}`, answers: [{ text: "Baltic", rarity: 50 }, { text: "North", rarity: 60 }] }));
  // Time moves only when the test says: the last timer set is the pause after the turn just ended.
  const timers: (() => void)[] = [];
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: many }]), { now: () => 0, after: (_, then) => (timers.push(then), () => {}) });
  const { host } = await room();
  const asked: string[] = [];
  for (const _ of [1, 2]) {
    await say(host, { type: "start" });
    while (seen(host).dive) {
      asked.push(seen(host).dive!.prompt.id);
      await say(host, { type: "out", text: "" });
      timers.pop()!();
    }
  }
  expect(asked).toHaveLength(20);
  expect(new Set(asked.slice(0, 14)).size).toBe(14);
  leave(host);
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [ocean] }, { id: "lakes", name: "Lakes", prompts: [lake] }]));
});

test("a dive is refused when no prompt has an answer for every diver", async () => {
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [{ id: "one", text: "Name a sea", answers: [{ text: "Baltic", rarity: 50 }] }] }]));
  const { host, others } = await room(null, "ben");
  await say(others[0]!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  expect(host.sent.at(-1)).toEqual({ type: "refused", reason: "no-prompts" });
  leave(host);
});

test("a guest who leaves during a dive is taken out of it, and one who joins watches", async () => {
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [{ id: "two", text: "Name an ocean", answers: [{ text: "Pacific", rarity: 10 }, { text: "Indian", rarity: 60 }, { text: "Arctic", rarity: 80 }] }] }]));
  const { host, others, code } = await room(null, "ben", "cal");
  for (const guest of others) await say(guest, { type: "ready", ready: true });
  await say(host, { type: "start" });
  const late = member();
  await say(late, { type: "join", code, nickname: "dee", suit: 0 });
  expect(seen(late).dive!.order).not.toContain(seen(late).you);
  leave(others[0]!);
  expect(seen(host).dive!.order).toHaveLength(2);
  expect(seen(host).dive!.divers).toHaveLength(2);
  leave(host);
});

test("a host who leaves during a dive is taken out of it, and the others dive on under the next host", async () => {
  usePrompts(inEnglish([{ id: "seas", name: "Seas", prompts: [{ id: "two", text: "Name an ocean", answers: [{ text: "Pacific", rarity: 10 }, { text: "Indian", rarity: 60 }, { text: "Arctic", rarity: 80 }] }] }]));
  const { host, others: [ben, cal] } = await room(null, "ben", "cal");
  await say(ben!, { type: "ready", ready: true });
  await say(cal!, { type: "ready", ready: true });
  await say(host, { type: "start" });
  leave(host);
  expect(seen(cal!).dive!.order).toHaveLength(2);
  expect(seen(cal!).players).toMatchObject([{ nickname: "ben", host: true }, { nickname: "cal", host: false }]);
  leave(ben!);
  leave(cal!);
});

