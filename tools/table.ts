// Prints the tables of a Wikipedia page as tab-separated rows: most lists an answer list starts
// from are tables. A cell spanning rows is repeated in each. `--links` prints the title of the
// article a cell first links to, rather than its text: the name the other tools look it up by.
//   bun tools/table.ts "List of national capitals" [--table 2] [--links] [--language zh]
import { option } from "./curation";
import { rendered } from "./wiki";

export type Cell = { text: string; link: string | null };
type Spanning = Cell & { rows: number; columns: number };

/** Every `wikitable` on a page, in page order, each as rows of cells with spanning cells copied into each place they cover. */
export async function tables(page: string, language: string): Promise<Cell[][][]> {
  const html = await rendered(page, language);
  const found: Spanning[][][] = [];
  let cell: Spanning | null = null;
  // Footnote marks and hidden sort keys are not part of what a cell says.
  let skipping = 0;
  new HTMLRewriter()
    .on("table.wikitable", { element: () => void found.push([]) })
    .on("table.wikitable tr", { element: () => void found.at(-1)!.push([]) })
    .on("table.wikitable td, table.wikitable th", {
      element(element) {
        const span = (name: string) => Math.max(1, Number(element.getAttribute(name)) || 1);
        cell = { text: "", link: null, rows: span("rowspan"), columns: span("colspan") };
        found.at(-1)!.at(-1)?.push(cell);
      },
      text(chunk) {
        if (cell && !skipping) cell.text += chunk.text;
      },
    })
    .on("table.wikitable sup, table.wikitable style, table.wikitable [style*='display:none']", {
      element(element) {
        skipping++;
        element.onEndTag(() => void skipping--);
      },
    })
    .on("table.wikitable br", {
      element: () => void (cell && (cell.text += " ")),
    })
    .on("table.wikitable a[title]", {
      element(element) {
        if (cell && !skipping && !cell.link) cell.link = element.getAttribute("title");
      },
    })
    .transform(html);
  return found.map(grid);
}

function grid(rows: Spanning[][]): Cell[][] {
  const out: Cell[][] = [];
  const carried: { value: Cell; left: number }[] = [];
  for (const row of rows) {
    const line: Cell[] = [];
    let column = 0;
    const take = () => {
      while (carried[column]?.left) {
        line[column] = carried[column]!.value;
        carried[column]!.left--;
        column++;
      }
    };
    for (const one of row) {
      take();
      const value = { text: one.text.replace(/&#\d+;|&\w+;/g, " ").replace(/\s+/g, " ").trim(), link: one.link };
      for (let i = 0; i < one.columns; i++) {
        line[column] = value;
        if (one.rows > 1) carried[column] = { value, left: one.rows - 1 };
        column++;
      }
    }
    take();
    if (line.length) out.push(line);
  }
  return out;
}

if (import.meta.main) {
  const page = process.argv[2];
  if (!page || page.startsWith("--")) {
    console.error('Name a page: bun tools/table.ts "List of national capitals"');
    process.exit(1);
  }
  const only = option("--table");
  const links = process.argv.includes("--links");
  (await tables(page, option("--language") ?? "en")).forEach((lines, i) => {
    if (only && Number(only) !== i + 1) return;
    console.log(`## Table ${i + 1} (${lines.length} rows)`);
    for (const line of lines) console.log(line.map((cell) => (links && cell.link ? cell.link : cell.text)).join("\t"));
    console.log();
  });
}
