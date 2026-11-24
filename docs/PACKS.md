# Writing good packs

The packs are the game. This is how a good prompt, a good answer list and good tiers look, and
how the built-in packs are made. The format itself is under "Pack format" in `docs/GAME.md`.

## A good prompt

A prompt asks for one item of a set. It works when every one of these holds:

1. **One source can list the whole set**: a Wikipedia list, an official register, a ballot, a
   game's own data. If no source lists it, the list will have gaps, and a gap punishes exactly
   the well-read player the game rewards. Rewrite the prompt or drop it.
2. **Its edges are pinned.** Every answer a player could defend is either listed or ruled out
   by the prompt's own words. Try to break it: name five answers a player might argue for,
   and check each one. Where the edge is unclear, say it in the prompt: "Name a fish (living
   species)", "Name a rom-com (1000+ IMDb votes)", "within city limits".
3. **It is neither too narrow nor too broad.** "Name a member of Queen" is too narrow: up to six
   divers share a prompt, and the last finds nothing left. "Name a band" is too broad: nobody
   can list it. Add constraints until the set is closed and still large.
4. **Its answers differ in how well known they are.** The twelve signs of the Chinese zodiac are
   all equally known, so no answer can be told rare. Drop such sets, or cut them differently.
5. **Anyone can start.** An ordinary adult who is no fan can name two or three answers.
6. **Deep answers can be reached.** The best rare answer is one a player can reason their way
   to and knows at once is right ("Central African Republic" for "a country with a P in its
   name": few notice the P in Republic). A tail of answers nobody could think of is noise.
7. **It stays put.** A set that grows on a schedule (award winners, champions, rankings, a
   studio's films) says where it stops: "(to 2025)", "(to the 2026 Oscars)". A living person's
   body of work, which grows seldom and which players expect to be current, may stay open and be
   updated when a new work comes out. No current rosters; nothing not yet released.
8. **It suits the pack's language.** An English pack does not ask about the classic Chinese
   novels; a Chinese pack may. What is rare depends on who plays.

### Patterns that work

- **A familiar set cut by a property**: "a country whose flag has a star", "a capital that is
  not its country's largest city", "an island country", "a country whose English name has J, K
  or V". The set is closed, everyone can start, and rarity comes both from how well known an
  item is and from how plain it is that it has the property.
- **A set an outside authority defines**: Oscar winners, UNESCO sites, the 88 constellations,
  a game's full item list.
- **A large set made closed by a stated cut-off**: a film genre with a vote threshold, living
  species of a group, works of an author.
- **Letters as a constraint** on a huge familiar set: "a one-word animal starting with ch or sh".

### Patterns to avoid

- Sets that rest on judgement: "a scary film", "a famous painter".
- "Name something used to …" (Family Feud style): the list can never be complete.
- Sets that are all equally known (zodiac signs, days of the week, chess pieces).
- Sets that change within a few years.
- Sets of ordinary words anyone can guess (colours, numbers, shapes): naming colours at random
  lands Among Us's Coral without knowing the game, so no answer is rare.

## A good answer list

- **List every answer, not a selection.** Bigger is better as long as each entry is checked: a
  wrong answer in the list is worse than a missing one. Lists of hundreds or thousands are fine.
- **Merge sources.** Take the main list, then add what other lists name. Missing a fair answer
  is the most common complaint about games like this.
- **Aliases** are other names a player may type: older names, short forms, the English name in
  a Chinese pack, the mainland name in a Taiwan pack. Wikipedia's redirects to an article are a
  good source of them. The game already forgives case, accents, punctuation, spaces, a leading
  "the" and small typos.
- **Be generous at the edges.** If a player can make a fair case for an answer, accept it.
- **Political sensitivity is no reason to drop or change a prompt or an answer**, in any
  language's pack. The zh-CN packs list what the sources list, the Dalai Lama among the Nobel
  Peace laureates included.

## Tiers

Picture asking many people for an answer, one at a time: people with a basic knowledge of the
pack's theme, neither experts nor strangers to it, who speak the pack's language. The answers most
of them give, and give first, are common. The fewer of them would give an answer, the rarer it is,
down to answers only someone deep in the field would think of. An answer even those few would not
think of is noise, not rare (see "Deep answers can be reached").

| Tier | Points | Who gives it |
|---|---|---|
| common | 10 | nearly everyone, first |
| familiar | 30 | most players |
| uncommon | 60 | some players |
| rare | 85 | few players |
| gem | 100 | the most satisfying of the rarest answers |

- **A pyramid**, steeper the less players know the set. In a set most players know well
  (countries, capitals, states), many answers are common or familiar: of 50, about 6 common,
  9 familiar, 14 uncommon and 21 rare. In an open set nobody knows whole (fish, films), common is a
  handful even in thousands: of 1,000, about 8, 24, 94 and 874.
- **When torn between two tiers, choose the rarer.** Whoever writes a list knows the topic better
  than most players. Of krillion's 212 capitals, the tiers Claude gave 39 differently from
  krillion's players, 30 of them one tier too common.
- **Gems are chosen, not computed.** One to three per prompt, from the rarest answers, for being
  a pleasure to land on. Not merely the most obscure: something at least a few players get.
- **Watch the "too clever" pick**, the go-to obscure answer that many players give (Eswatini for
  an African country). It is not rare. Data catches it; a guess usually does not.
- **A numbered series is not rare past its first few.** Whoever knows "the First Crusade" can
  count up to the Seventh without knowing anything about it, so such answers are uncommon at most.
- **Rarity is about recall, not fame.** The question is "would a player think of it unprompted?",
  not "has a player heard of it?".

## Measuring rarity

Guesses are a start; data is better. `bun tools/signals.ts <pack file>` looks every answer up on
Wikipedia and suggests tiers from how often its article is read. Use it as a check, not the score:

- **Views rank how famous each answer is.** That is a fair first draft for a plain set: of
  krillion's 212 capitals, views alone put 148 in the tier krillion's players did. They cannot see a
  prompt's property: for "an island country" the United Kingdom is famous, but few players remember
  it is an island. For such prompts, and for fan topics with no articles, judge by hand.
- **Give `--known` for a set most players know well**, so the suggestions follow its gentler
  pyramid. Without it Greece comes out a rare country in Europe.
- **Pageviews measure curiosity as well as fame.** People read about what they do not know:
  Eswatini's article is read more than Mongolia's, yet nobody names Eswatini first. Distrust a
  rare answer the data calls common, and the reverse.
- **Ambiguous names** (Mercury, Chad, Boxer) need the right article; the tool says which it used.
- **Chinese Wikipedia** is thin and is not read in mainland China; an answer with no Chinese
  article at all is likely rare for Chinese players.

The best data is the players' own. The game counts every answer typed to a built-in prompt, right
or wrong (`answer_counts`). The review page shows those counts, the answers players typed that
the pack does not list, and tiers the counts disagree with.

## How a built-in pack is made

The `curate-pack` skill (`.claude/skills/curate-pack/SKILL.md`) walks Claude Code through it:

1. Draft twice as many prompts as needed, check each against "A good prompt", and choose.
2. Build each answer list from sources, check it against a second source, and add aliases.
3. Tier it: signals first, then judgement, then the gems.
4. Check it with `validatePack`, write `packs/<language>/<id>.json`, and upload it from the admin
   panel. The live packs are in the database: download a pack from there before working on it.
5. Review it in the game with developer mode on, at `/dev/review`: move answers between tiers,
   fix or remove them, add what players typed, and save.
6. Make the Chinese packs from it: the names Wikidata gives in Simplified and Traditional
   Chinese, with the English names as aliases.

The packs also grow by one prompt a day from the daily dive (`src/server/writer.ts`). The day
before, Claude writes a prompt for each of the day's ten packs as above, unattended: a reviewer
that has not seen its research must accept the prompt against "A good prompt" before its answers
are written, and the game checks the result. When the day is over the prompt joins its pack, the
tiers of the answers players gave set by their counts once it has had a hundred answers, and right
answers the live judge allowed added as rare.

Prompts whose sets grow keep their sources in the game's database, as `curation/<pack id>.sources.json`
has them (a pack's file is uploaded from the admin panel). Once a month the server checks those
sources for new rows and, when there are some, has Claude add the answers to every pack that asks
the prompt; each January it also moves the cut-off years forward. The changes go live at once, and
the admin panel shows what the last update did. A daily prompt whose set grows names its sources
when it is written, and is checked from the day it joins its pack.
