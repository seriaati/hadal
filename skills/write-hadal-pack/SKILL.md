---
name: write-hadal-pack
description: Write or fix a trivia pack for Hadal, the deep-sea diving trivia game, as a JSON file the player uploads in the game. Use when the user asks for a Hadal pack, a pack of prompts and answers for Hadal, or pastes problems Hadal reported about a pack.
---

# Writing a Hadal pack

Hadal shows the player a prompt such as "Name a country that borders Germany" and they type one
answer. A correct answer scores by its tier: the answers few players think of take the diver
deepest. An answer that is not in the pack counts as wrong, so a list with gaps punishes exactly
the well-informed players the game is meant to reward.

Write the pack in the language the player plays the game in, with as many prompts as they ask
for. Give back one JSON file named after the pack's id, such as `rivers-of-europe.json`.

## Format

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

Hadal refuses a pack that breaks any of these:

- No fields other than the ones above. `aliases` may be left out when there are none.
- `id` (the pack's and each prompt's) is lower-case letters and digits joined by single hyphens,
  at most 40 characters. Prompt ids are unique within the pack.
- `name` is at most 24 characters; a prompt's `text` at most 80.
- At least one prompt, and at least two answers per prompt.
- `tier` is one of `"common"`, `"familiar"`, `"uncommon"`, `"rare"` and `"gem"`, and every prompt
  has at least one gem.
- Every spelling (an answer's `text` and each alias) is at most 40 characters, has at least one
  letter or digit, and matches no other spelling in the same prompt. Spellings that differ only in
  capitals, accents, punctuation, spaces, a leading "the", or simplified against traditional
  Chinese characters count as the same.
- The file is at most 5 MB.

## Making it good

Prompts
- Each asks for one item of a well-defined set and can be judged plainly right or wrong: "Name a
  moon of Jupiter", not "Name a good film". The best sets are a familiar set cut by a property
  ("Name a country whose flag has a star"), a set some authority lists in full (an award's
  winners, an official register), or a large set closed by a stated cut-off. Avoid sets that rest
  on judgement and "Name something used to…": their lists can never be complete.
- Each is widely known: an ordinary adult who is no specialist or fan can name two or three
  answers. "Name a dog breed", not "Name a Uralic language" or "Name a Kanto Gym Leader".
- Each has at least 8 correct answers, and there is no upper limit: hundreds or thousands are
  welcome, as long as every one can be listed and checked. Up to six divers answer the same prompt
  in a room, and an answer once given is taken.
- A player can tell where its set ends. Where that would be unclear, the prompt says it, as in
  "Name a fish (living species)".
- Its answers clearly differ in how well known they are, so their tiers are plain. Avoid sets
  whose members are all about as well known as each other, such as the signs of the zodiac.
- Its rare answers are ones a player could reason their way to, not only ones nobody could think of.
- Its set stays put. Avoid sets that change within a few years, such as current team rosters or
  the latest winners of a yearly award, and list nothing not yet released or not yet happened.
- It suits the people who play in the pack's language. An English pack does not ask about works
  that English speakers seldom know, such as the characters of the classic Chinese novels; a
  Chinese pack may.
- No two prompts ask for nearly the same set.
- Cover different corners of the topic, and mix easier sets with harder ones.

Name
- Say plainly what the pack is about, the way a player would put it: "Programming", "Rivers of
  Europe". Leave the sea and the game out of it: no "Depths", "Abyss", "Dive" or other wordplay.

Answers
- List every correct answer, not a selection: for a large set, that may be hundreds or thousands.
  Check each one: a wrong answer in the list is worse than a missing one.
- `text` is the usual way to write the answer. `aliases` are other names or spellings a player
  might type for the same thing ("Holland" for "Netherlands", "JFK" for "John F. Kennedy"). The
  game already ignores capitals, accents, punctuation, spaces and a leading "the", and forgives
  small typos, so do not list such variants.
- `tier` is how likely a typical player is to give the answer: `common` is what nearly everyone
  says first, `familiar` what most players would think of, `uncommon` what some would, and `rare`
  what few would. Few answers are common; in a long list, most are rare.
- `gem` goes to the rarest answers that are a pleasure to land on: ones a player could reason
  their way to and would know at once to be right, not merely the most obscure. Every prompt has
  at least one, and seldom more than three.

## Before handing it over

Go through the rules under "Format" one by one against the file, especially the gem in every
prompt, the length limits and spellings repeated within a prompt. Then read the prompts once more
as a player who knows the topic only a little, and replace any that fail the points under
"Prompts".

## Fixing a pack

When the player uploads the pack, Hadal lists every problem it finds at once. If they paste that
list back, fix all of it and give the whole file again. Keep the pack's `id` unchanged: uploading
a pack with the id of one the player already has replaces that pack.
