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

Prompts are grouped into themed packs. A single player dives through 10 prompts, in normal
mode or in chaos mode (less air, and the first empty tank ends the dive), from the built-in
packs of their language or from the packs they choose. Multiplayer is private rooms joined by
a code or a link. A player joins in the suit they chose, or in one nobody in the room wears yet if
it is taken, and in the room may press their own diver to change it. A new room starts with the
settings of the last room its host's browser set up. A player whose connection drops keeps their
place for 30 seconds while the page connects again; if the server has restarted meanwhile (a new
version), the room opens again under its code, without the dive that was under way. A page left
open across a new version keeps running it, and the title offers to update. The host may pass the crown to another player, kick a player (who may
come back with the code), ban one (until the room closes) or mute one (who still dives, but cannot
talk until unmuted or given the crown), in the room or during a dive; one kicked or banned from a
dive leaves it as if they had left. When the host leaves, the crown
passes to the next player; the room closes when the last one leaves. The players can talk, 50
characters at a time, and no chat box is shown. Tab opens it, in the room and in a dive (except
while the player's own air runs), and types nothing, as a Chinese input method needs; before a
dive a player may also just start typing. On a phone, their own diver opens it before a dive, and
a speech mark at the bottom left in one. What they say rises from their helmet in a bubble over
them and stays long enough to read, then goes; a newer bubble pushes an older one it would cover
out of its way. One whose diver is out of view says it from where they are named at the edge of
the screen, or, if they are not named, at the bottom left after their name. Screen readers read
out what the others say. Nothing said is kept, and in a dive what names an answer to the prompt
that nobody has taken yet is refused, so no answer is given away. A room asks no prompt
twice until it has asked every one. While another diver answers, a player may type their own
answer ahead, and send it when their turn comes. A diver's air runs out by their own browser's
clock, which the server waits a moment for, so the last letters typed before it ran out still
count. Players can also add
packs of their own, have Claude write one (10 to 50 prompts on a topic, with notes of their
own, searching the web if they turn that on), and have answers a pack does not list judged
live with their own API key. Claude writes a pack in the background, one at a time for each
player: first its name and prompts, then each prompt's answers, which may run to thousands.
The game may be closed meanwhile, and a server that restarts goes on where it stood; the pack
appears among the player's when it is done. Before it begins, the player is told roughly what it
may cost their key, and while it goes on, what it has cost so far. The game counts the answers
players give to built-in prompts, right or wrong, tied to nobody, to measure how rare each
really is and to find the right ones a pack misses (see `docs/PACKS.md`).

The game speaks English, Simplified Chinese and Traditional Chinese (as written in Taiwan). It
starts in the browser's language, and the settings change it; Claude writes a player's packs in
their language. Each language has built-in packs of its own: the Chinese ones are the English
packs translated, and their answers also take the English names. Where a prompt is about Chinese
works that English speakers seldom know (the classic novels), the English pack asks another
instead; the traditional ones use
Taiwan's names and also take the mainland's. A room starts with the packs of its host's
language, and the host may add any others. An answer may be typed in either simplified or
traditional characters: 關 and 关 are the same answer.

## The look

- **Dark pixel art.** A lone hard-hat diver descends a line down a trench wall, hanging a lamp
  at every prompt. A correct answer lights the lamp, brighter the rarer it was; a wrong one
  leaves a dead lamp. One low-resolution pixel grid, a 22-colour palette, hand-built bitmap
  fonts (Chinese and other scripts in half pixels of the grid, so dense characters stay readable),
  and soft light laid over the crisp pixels. The settings set how finely the light is
  drawn (Glow: High, Medium, Low), for slower devices; Auto, the default, starts at High and
  steps down while frames come too slowly. Low keeps the lamps' light but drops the bloom.
- **Subtle deep-sea horror.** The sea is dark, lonely and lit only by the diver's lamps and
  by things that glow. Unsettling creatures appear in the deep: they are scenery, never
  harm the diver and never affect the score. The unease is the player's own. Once in every
  chaos dive, and only there, a giant anglerfish comes straight at the diver, bloodied: first
  only its red lure, a light growing out of the dark, then its face, its eyes and its mouth,
  wide open round the diver. The screen cuts to dark; after a moment its face slams back at
  the screen as its jaws shut, then the dark lifts and the dive goes on.
  Chaos mode warns of its minor horror.
- **Gentler life at its own depths.** Five creatures drawn by NekuMeow swim past, one at a
  time, each where the water matches the one it was drawn on: a blue dragon and a sea angel
  near the surface, a nautilus in the twilight, a squid in the deep and a dumbo octopus in
  the abyss. Flat blocks of colour (a body, a shadow, a lit upper edge), tentacles that sway.
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
  (`packs/en/`, `packs/zh-CN/`, `packs/zh-TW/`). A built-in pack is uploaded into the language
  chosen in the admin panel; one with the id of a pack already there replaces it, and the old
  version is kept in the database. An upload that would remove prompts the pack has (added since
  the copy was downloaded) asks first.
- The name is at most 24 characters and a prompt's text at most 80.
- A prompt has at least two answers. An answer's tier is "common" (what nearly everyone says
  first), "familiar", "uncommon", "rare" or "gem", and every prompt has at least one gem. A
  pack written with a rarity from 1 to 100 instead was moved to tiers once: up to 20 common, to
  40 familiar, to 60 uncommon, below 100 rare, and 100 gem.
- Every spelling (the text and each alias) is at most 40 characters, has at least one letter
  or digit, and matches no other spelling of the prompt (spellings that differ only in simplified
  and traditional characters match).
- An uploaded file is at most 5 MB.

`skills/write-hadal-pack/SKILL.md` restates these rules for players' own AI tools; change it with
them.
