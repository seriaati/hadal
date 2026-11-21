import { expect, test } from "bun:test";
import { factLines, lay, move, view, type Part, type Placed, type Step } from "./ui";

const press = (id: string, right = false): Part => ({ kind: "press", id, label: id, right });
const STEP: Step = {
  title: "Packs",
  rows: [
    [press("rivers"), press("remove rivers", true)],
    [press("lakes"), press("remove lakes", true)],
    { kind: "note", text: "Words that are only read" },
    { kind: "field", id: "topic", label: "A pack about", max: 60, autocomplete: "off" },
    { kind: "gap" },
    [press("add"), press("write")],
  ],
};
const { placed, height } = lay(STEP, 140, 12);
const at = (id: string) => placed.find((spot) => "id" in spot.part && spot.part.id === id)!;
const from = (id: string, way: Parameters<typeof move>[2]) => {
  const to = move(placed, at(id), way)?.part;
  return to && "id" in to ? to.id : undefined;
};

test("a step is set out in rows, with a thing marked `right` against the right edge", () => {
  expect(at("rivers")).toMatchObject({ x: 0, y: 14, h: 12 });
  expect(at("remove rivers").x + at("remove rivers").w).toBe(140);
  expect(at("rivers").w).toBeLessThan(at("remove rivers").x);
  expect(at("lakes").y).toBe(26);
  expect(at("topic")).toMatchObject({ x: 0, w: 140, h: 22 });
  expect(at("write").x).toBeGreaterThan(at("add").x + at("add").w);
  expect(height).toBe(at("add").y + 12);
  expect(lay(STEP, 140, 20).height).toBeGreaterThan(height);
});

test("Up and Down go to the nearest thing of the next row, and round from the last row to the first", () => {
  expect(from("rivers", "down")).toBe("lakes");
  expect(from("remove rivers", "down")).toBe("remove lakes");
  expect(from("lakes", "down")).toBe("topic");
  expect(from("topic", "up")).toBe("lakes");
  expect(from("add", "down")).toBe("rivers");
  expect(from("rivers", "up")).toBe("add");
});

test("Left and Right stay on the row", () => {
  expect(from("rivers", "right")).toBe("remove rivers");
  expect(from("remove rivers", "left")).toBe("rivers");
  expect(from("remove rivers", "right")).toBeUndefined();
  expect(from("topic", "right")).toBeUndefined();
});

test("Tab goes through everything in reading order, round and round", () => {
  expect(from("remove lakes", "next")).toBe("topic");
  expect(from("write", "next")).toBe("rivers");
  expect(from("rivers", "previous")).toBe("write");
});

const FACTS = [{ text: "Deepest" }, { text: "30 s of air" }, { text: "built-in packs" }];
const act = (): Part => ({ kind: "action", id: "act", label: "Light the lantern", press: () => {} });
const idOf = (part: Placed["part"] | undefined) => (part && "id" in part ? part.id : undefined);

test("a summary wraps only between its facts, and takes the lines it needs", () => {
  expect(factLines(FACTS, 300)).toEqual([[0, 1, 2]]);
  expect(factLines(FACTS, 90)).toEqual([[0, 1], [2]]);
  const { placed } = lay({ title: "Room", rows: [{ kind: "summary", facts: FACTS }, act()] }, 90, 12);
  expect(placed[0]!.h).toBe(2 * 8 + 4);
  expect(placed[1]!.y).toBe(placed[0]!.y + placed[0]!.h);
});

test("a summary is only read, unless it is pressed: then the focus reaches it", () => {
  const read = lay({ title: "Room", rows: [{ kind: "summary", facts: FACTS }, act(), press("leave")] }, 140, 12).placed;
  expect(idOf(move(read, read[1]!, "up")?.part)).toBe("leave");
  const host = lay({ title: "Room", rows: [{ kind: "summary", facts: FACTS, id: "setup", press: () => {}, value: "Change" }, act()] }, 140, 12).placed;
  expect(idOf(move(host, host[1]!, "up")?.part)).toBe("setup");
});

test("the divers of a room are a row over the step: Up and Down reach them", () => {
  const diver = (name: string, x: number): Placed => ({ part: { kind: "diver", id: name, name, press: () => {}, says: name }, row: -1, x, y: 40, w: 30, h: 36, lines: [] });
  const laid = lay({ title: "Room", rows: [{ kind: "summary", facts: FACTS, id: "setup", press: () => {} }, act()] }, 140, 12).placed;
  const all = [diver("ana", 0), diver("ben", 53), ...laid];
  expect(idOf(move(all, laid[0]!, "up")?.part)).toBe("ana");
  expect(idOf(move(all, all[1]!, "down")?.part)).toBe("setup");
  expect(idOf(move(all, all[0]!, "right")?.part)).toBe("ben");
});

test("two things marked `right` stand side by side against the right edge, in their order", () => {
  const { placed } = lay({ title: "Packs", rows: [[press("rivers"), press("download", true), press("remove", true)]] }, 140, 12);
  const [name, download, remove] = placed;
  expect(remove!.x + remove!.w).toBe(140);
  expect(download!.x + download!.w).toBe(remove!.x - 8);
  expect(name!.x + name!.w).toBe(download!.x - 4);
});

test("words said after a line keep their room once they are gone, so the lines after them stay put", () => {
  const room = (refused: boolean): Step => ({
    title: "Room",
    rows: [press("start"), ...(refused ? [{ kind: "note", text: "Not everyone is ready", bad: true } as Part] : []), press("setup")],
  });
  const kept = new Map<string, number>();
  const y = (step: Step) => lay(step, 140, 12, kept).placed.find((spot) => "id" in spot.part && spot.part.id === "setup")!.y;
  const before = y(room(false));
  const said = y(room(true));
  expect(said).toBeGreaterThan(before);
  expect(y(room(false))).toBe(said);
  expect(y(room(true))).toBe(said);
});

test("words and a gap before a line keep their room once, frame after frame", () => {
  const step: Step = { title: "Write a pack", rows: [{ kind: "note", text: "Words" }, { kind: "gap" }, press("key"), { kind: "gap" }, { kind: "note", text: "More words" }, press("skill")] };
  const kept = new Map<string, number>();
  const ys = (laid: ReturnType<typeof lay>) => laid.placed.map((spot) => spot.y);
  const fresh = ys(lay(step, 140, 12));
  expect(ys(lay(step, 140, 12, kept))).toEqual(fresh);
  expect(ys(lay(step, 140, 12, kept))).toEqual(fresh);
});

test("a step too long for its room stays where it stands and scrolls, no further than its end", () => {
  expect(view(100, 60, 60, 300, 0)).toEqual({ top: 60, scroll: 0 });
  expect(view(400, 60, 60, 300, 0)).toEqual({ top: 60, scroll: 0 });
  expect(view(400, 60, 60, 300, 500)).toEqual({ top: 60, scroll: 160 });
});

test("the line in focus stays put: a short step moves, a long one scrolls", () => {
  expect(view(100, 60, 60, 300, 0, { top: 60, by: 10 })).toEqual({ top: 60, scroll: 0 });
  expect(view(100, 60, 60, 300, 0, { top: 80, by: 10 })).toEqual({ top: 70, scroll: 0 });
  expect(view(400, 60, 60, 300, 30, { top: 60, by: 10 })).toEqual({ top: 60, scroll: 40 });
  expect(view(400, 60, 60, 300, 30, { top: 60, by: -10 })).toEqual({ top: 60, scroll: 20 });
});
