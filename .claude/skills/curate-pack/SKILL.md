---
name: curate-pack
description: Make or improve one of Hadal's built-in packs (packs/<language>/<id>.json) - choose its prompts, build complete answer lists from sources, put the answers in tiers with Wikipedia data and the players' counts, and make the Chinese versions. Use when asked to write, curate, retier, grow or fix a built-in pack, or to turn a topic into a new built-in pack.
---

# Curating a built-in pack

Read `docs/PACKS.md` first: it says what a good prompt, answer list and tiering are. This skill is
how to get there. Work one prompt at a time and show the owner each stage before going on: the
owner decides which prompts stay and has the last word on tiers.

## 1. Choose the prompts

- Ask who the pack is for if it is not plain (the language, and how expert the players are).
- Draft about twice as many prompts as the pack needs (30 for a full pack). For each, say in one
  line which source lists the whole set and roughly how many answers it has.
- Check each against the eight points under "A good prompt" and drop the ones that fail. Prefer
  the patterns that work (a familiar set cut by a property, a set an authority defines, a large set
  closed by a stated cut-off).
- Try to break each survivor: name five answers a player might argue for, and either list them or
  reword the prompt to rule them out.
- Show the owner the list with the reasons, and let them choose.

## 2. Build each answer list

- Start from the source. Most Wikipedia lists are tables: `bun tools/table.ts "List of …" [--links]`
  prints a page's tables as rows (`--links` gives each cell's article title, the name the other
  tools look it up by). For a list of links or a category, `bun tools/members.ts "List of …"` or
  `bun tools/members.ts "Category:…"` prints every article it links to; keep the members and drop
  the rest (places, people, other lists).
- Then compare the list with a second source (another list, a Wikidata query, the game's own data)
  and look at every answer only one of them has. A fair answer that is missing is the worst fault a
  list can have; a wrong one is worse still, so check what you add.
- Write the answers into the pack with `"tier": "rare"` for now, then run
  `bun tools/names.ts <file> [--hint "dog breed"]`. It writes `curation/<id>.names.json` with
  each answer's aliases in the pack's other prompts (`inPack`: take these first) and its Wikipedia
  redirects, less those the game already takes (case, accents, small typos) and other kinds of
  title. Take the redirects a player could type (older names, short forms) and leave out
  nicknames, romanizations and sub-topics. Add by hand the longer forms the game does not take
  for the short one: "Amazon River" for "Amazon".
- An answer that leads to the wrong article ("Newfoundland" to the province) gets its title in
  `curation/<id>.titles.json`: `{ "<prompt id>": { "Newfoundland": "Newfoundland dog" } }`. That
  file is kept in git; the others under `curation/` are made again whenever a tool runs.

## 3. Put the answers in tiers

- Run `bun tools/signals.ts <file> [--hint …] [--known]`. It suggests a tier for each answer from
  how often its article is read, and lists the answers far from their suggestion and those with no
  article. Give `--known` (with `--prompt` to run it on some prompts only) for a set most players
  know well, such as countries, capitals or states; without it the suggestions come out far too rare.
- Trust the suggestions only as far as `docs/PACKS.md` says: a fair first draft for a plain set
  (capitals, rivers), not for a set cut by a property ("an island country") or a fan topic.
- Judge each answer by the one question that matters: would a player think of it unprompted?
  Pageviews also count curiosity: a strange name people look up (Eswatini, Xoloitzcuintle) is read a
  lot but seldom given. When torn between two tiers, choose the rarer. Keep the pyramid of
  `docs/PACKS.md`.
- Choose one to three gems among the rarest: the answers most satisfying to land on, which a
  player could reason their way to. Not merely the most obscure.
- For a pack already played, open the review page (below): the players' counts outrank both the
  data and your judgement once a prompt has had a hundred answers.

## 4. Check and hand over

- `bun tools/check.ts --write packs/<language>/<id>.json` checks the pack as the game does, lays
  it out as the other packs are, and shows each prompt's spread over the tiers.
- Tell the owner to review it at `/dev/review` (with `HADAL_DEV_MODE=1` in `.env` and the game
  running): they can move answers between tiers, fix or remove them, and add what players typed.
  A save rewrites the file, and the game plays it at once.

## 5. The Chinese packs

The Chinese packs follow the English one: same prompt ids under `packs/zh-CN/zh-<id>.json` and
`packs/zh-TW/tw-<id>.json`, the prompts in Chinese, and every answer under its Chinese name with
the English name among its aliases.

- `bun tools/names.ts packs/en/<id>.json` gives each answer's names in Simplified Chinese and in
  Taiwan's Traditional Chinese (`zhCN`, `zhTW`). Where it has none, use the usual Chinese name.
- The Taiwan pack uses Taiwan's names and takes the mainland's as aliases.
- Where a prompt is about something English speakers seldom know and Chinese players do (or the
  reverse), the packs may ask different prompts, as `docs/GAME.md` says of the classic novels.
- Tier for Chinese players, not by copying: run `bun tools/signals.ts` on each Chinese pack (it
  reads zh.wikipedia.org), and remember that an answer with no Chinese article is likely rare.
- Check both files with `bun tools/check.ts --write`.
