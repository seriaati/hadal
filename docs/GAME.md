# Hadal: the game

## The idea

Hadal is a sea-themed web trivia game. A prompt is shown ("Name a country in Asia") and the
player types one answer.

- **Correctness gates the score.** A wrong answer ("USA") scores nothing.
- **Rarity sets the score.** Every answer is in one of five tiers, and the rarer its tier, the more
  it scores: common 10 points, familiar 30, uncommon 60, rare 85 and gem 100 ("Taiwan" scores
  high, "China" scores low). A prompt's gems are the most satisfying of its rarest answers.
- **Score is depth.** The higher the score, the deeper the diver goes, through the real ocean
  zones down to the hadal zone (a perfect dive reaches 11,000 m).

Prompts are grouped into themed packs. A single player dives through 10 prompts from the
built-in packs of their language or from packs they choose, in normal mode or in chaos mode (less
air, and the first empty tank ends the dive). The daily dive asks everyone the same 10 prompts for
a day, written by Claude the day before, and only a player's first daily dive of the day is scored.

Multiplayer is private rooms joined by a code or a link. The divers take turns on the same prompts,
and others may join as ghosts who watch without diving. The host runs the room and may pass the
crown, kick, ban or mute. Players can talk, in bubbles over their divers, but nothing said may give
away an answer nobody has taken yet.

Players can also add packs of their own, have Claude write one in the background, and have answers
a pack does not list judged live, all with their own API key. The game counts the answers players
give to built-in prompts, tied to nobody, to measure how rare each really is (see `docs/PACKS.md`).

The game speaks English, Simplified Chinese and Traditional Chinese (as written in Taiwan). It
starts in the browser's language, and the settings change it; Claude writes a player's packs in
their language. Each language has built-in packs of its own: the Chinese ones are the English
packs translated, and their answers also take the English names. Where a prompt is about Chinese
works that English speakers seldom know (the classic novels), the English pack asks another
instead; the traditional ones use Taiwan's names and also take the mainland's. An answer may be typed in either simplified or
traditional characters: 關 and 关 are the same answer.

## The look

- **Dark pixel art.** A lone hard-hat diver descends a line down a trench wall, hanging a lamp
  at every prompt. A correct answer lights the lamp, brighter the rarer it was; a wrong one
  leaves a dead lamp. One low-resolution pixel grid, a 22-colour palette, hand-built bitmap
  fonts (Chinese and other scripts in half pixels of the grid, so dense characters stay readable),
  and soft light laid over the crisp pixels, drawn more coarsely on slower devices.
- **Subtle deep-sea horror.** The sea is dark, lonely and lit only by the diver's lamps and
  by things that glow. Unsettling creatures appear in the deep: they are scenery, never
  harm the diver and never affect the score. The unease is the player's own. Once in every
  chaos dive a giant anglerfish lunges at the diver and seems to swallow them, then the dive goes
  on. Chaos mode warns of its minor horror.
- **Gentler life at its own depths.** Creatures drawn by NekuMeow swim past, one at a time,
  each where the water matches the one it was drawn on. Flat blocks of colour (a body, a
  shadow, a lit upper edge), tentacles that sway.
- **Clean screen.** Only what matters is shown: the prompt, the air left, what is being
  typed, the verdict, the depth. Anything else earns its place or lives in the world.
- **Quiet sound.** Sparse ambience, small effects and music made up as it plays, all in one
  key, hollower with depth.

How the panels look and are worked is in `docs/UI.md`.

## Pack format

A pack is one JSON file; `validatePack` in `src/server/packs.ts` checks it and lists every
problem at once, in words meant for the pack's author. Every upload goes through it: a player's
own pack, and a built-in pack an admin uploads.

```json
{
  "id": "geography",
  "name": "Geography",
  "prompts": [
    {
      "id": "germany-borders",
      "text": "Name a country that borders Germany",
      "answers": [
        { "text": "France", "tier": "common" },
        { "text": "Netherlands", "aliases": ["Holland"], "tier": "familiar" },
        { "text": "Luxembourg", "tier": "gem" }
      ]
    }
  ]
}
```

- No other fields are allowed, so a misspelt field name is caught.
- Ids are lower-case letters and digits joined by hyphens, at most 40 characters. A prompt's
  id is unique within its pack. A built-in pack's id is unique across every language, and in a
  working copy it is the file's name: the packs of a language are in `packs/<language>/`
  (`packs/en/`, `packs/zh-CN/`, `packs/zh-TW/`).
- The name is at most 24 characters and a prompt's text at most 80.
- A prompt has at least two answers. An answer's tier is "common" (what nearly everyone says
  first), "familiar", "uncommon", "rare" or "gem", and every prompt has at least one gem.
- Every spelling (the text and each alias) is at most 40 characters, has at least one letter
  or digit, and matches no other spelling of the prompt (spellings that differ only in simplified
  and traditional characters match).
- An uploaded file is at most 5 MB.

`skills/write-hadal-pack/SKILL.md` restates these rules for players' own AI tools; change it with
them.
