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
