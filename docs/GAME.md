# Hadal: the game

## The idea

Hadal is a sea-themed web trivia game. A prompt is shown ("Name a country in Asia") and the
player types one answer.

- **Correctness gates the score.** A wrong answer ("USA") scores nothing.
- **Rarity sets the score.** The rarer a correct answer, the more it scores ("Taiwan" scores
  high, "China" scores low).
- **Score is depth.** The higher the score, the deeper the diver goes, through the real ocean
  zones down to the hadal zone (a perfect dive reaches 11,000 m).

Prompts are grouped into themed packs. A single player dives through 10 prompts, in normal
mode or in chaos mode (less air, and the first empty tank ends the dive). Multiplayer is
private rooms joined by a code or a link. Players can also add packs of their own, have
Claude write one, and have answers a pack does not list judged live with their own API key.

The game speaks English and Simplified Chinese. It starts in the browser's language, and the
settings change it; Claude writes a player's packs in their language. The built-in packs are
in English for now.

## The look

- **Dark pixel art.** A lone hard-hat diver descends a line down a trench wall, hanging a lamp
  at every prompt. A correct answer lights the lamp, brighter the rarer it was; a wrong one
  leaves a dead lamp. One low-resolution pixel grid, a 22-colour palette, hand-built bitmap
  fonts, and soft light laid over the crisp pixels.
- **Subtle deep-sea horror.** The sea is dark, lonely and lit only by the diver's lamps and
  by things that glow. Unsettling creatures appear in the deep: they are scenery, never
  attack and never affect the score. The unease is the player's own.
- **Clean screen.** Only what matters is shown: the prompt, the air left, what is being
  typed, the verdict, the depth. Anything else earns its place or lives in the world.
- **Quiet sound.** Sparse ambience, small effects and music made up as it plays, all in one
  key, hollower with depth.

How the panels look and are worked is in `docs/UI.md`.

## Pack format

A pack is one JSON file; `validatePack` in `src/server/packs.ts` checks it and lists every
problem at once, in words meant for the pack's author. The server refuses to start if a
built-in pack is not valid. Uploaded packs go through the same check.

```json
{
  "id": "geography",
  "name": "Geography",
  "prompts": [
    {
      "id": "germany-borders",
      "text": "Name a country that borders Germany",
      "answers": [
        { "text": "France", "rarity": 5 },
        { "text": "Netherlands", "aliases": ["Holland"], "rarity": 25 },
        { "text": "Luxembourg", "rarity": 100 }
      ]
    }
  ]
}
```

- No other fields are allowed, so a misspelt field name is caught.
- Ids are lower-case letters and digits joined by hyphens, at most 40 characters. A prompt's
  id is unique within its pack; a built-in pack's id is its file name.
- The name is at most 24 characters and a prompt's text at most 80.
- A prompt has at least two answers. Rarity is a whole number from 1 (everyone says it) to
  100, and the rarest answer of every prompt has 100.
- Every spelling (the text and each alias) is at most 40 characters, has at least one letter
  or digit, and matches no other spelling of the prompt.
- An uploaded file is at most 200 KB.
