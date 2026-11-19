import { expect, test } from "bun:test";
import { lay, move, type Part, type Step } from "./ui";

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

test("the people of a room are read, not reached: the focus passes over them", () => {
  const room: Step = {
    title: "Room",
    code: { text: "KXWRT", copy: () => {} },
    rows: [
      { kind: "player", name: "ana", color: 5, note: "", host: true },
      { kind: "player", name: "ben", color: 9, note: "" },
      { kind: "gap" },
      press("start"),
      press("leave"),
    ],
  };
  const laid = lay(room, 140, 12).placed;
  const spot = (id: string) => laid.find((placed) => "id" in placed.part && placed.part.id === id)!;
  expect(laid[1]!.y - laid[0]!.y).toBe(9);
  expect((move(laid, spot("start"), "up")?.part as { id: string }).id).toBe("leave");
  expect((move(laid, spot("leave"), "down")?.part as { id: string }).id).toBe("start");
});

test("to the host, another player of the room is a line: the focus reaches it", () => {
  const room: Step = {
    title: "Room",
    rows: [
      { kind: "player", name: "ana", color: 5, note: "", host: true },
      { kind: "player", name: "ben", color: 9, note: "", id: "player:1", press: () => {} },
      { kind: "gap" },
      press("start"),
    ],
  };
  const laid = lay(room, 140, 12).placed;
  const spot = (id: string) => laid.find((placed) => "id" in placed.part && placed.part.id === id)!;
  expect(spot("player:1").h).toBe(12);
  expect((move(laid, spot("start"), "up")?.part as { id: string }).id).toBe("player:1");
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
