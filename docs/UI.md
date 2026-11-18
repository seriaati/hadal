# Hadal: the interface

How the panels look and how the game is controlled. The code is `src/web/pixel/ui.ts`; a panel
only lists what it holds.

## The idea

There is no panel. The words stand in the water where the title menu stands, in the same
letters, and the water behind them goes two shades darker with a soft edge so the small
letters read. Nothing is framed and the sea is not dimmed: the game goes on in full view.

- On a wide screen (300 game pixels or more) the words take the column to the right of the
  diver. On a narrow one they lie under the diver, across the whole width.
- The words never cover the diver or the lantern. Only a list too long for the screen may
  climb over them.
- While a panel is open the title's own words are not drawn, and in a dive the answer being
  typed is not drawn. The prompt, the air and the depth stay.

## Parts

Every panel is built from these, and each has one look.

| Part | What it is | Look |
|---|---|---|
| Step | One screen of a panel | Its name at the top in dim letters, with a `‹` before it. Under the pointer the `‹` and the name light up like a line in focus, since a press there goes back. A room's step has its code after the name, in pale letters, since it is read out to others; a press on the code copies the room's link, and it lights up the same way |
| Line | Anything pressed: a row of a list, a button, a link | Pale words. A lesser line beside another ("Download", "Remove") is dim; two of them stand side by side against the right edge |
| Field | A line of typing | Its label in dim letters, the typing under it, a rule under that |
| Slider | A level from 0 to 1 | Its label, and 20 pips at the right of the line, like the air gauge. It may have fewer steps (the air of a room: 12, with "30 s" after the pips), or be a choice of colours, one pip of each (a suit) |
| Setting | A line that stands for a choice | Its label, and the choice against the right edge ("Deepest", "built-in + 2"), with a pip before it if it is on or off. Left and Right change it, like a slider; Enter flips an on or off one |
| Player | One of the people in a room | A pip of their suit's colour, the name, and a dim word ("host", "ready"). Only read: the focus passes over it |
| Message | Words that are only read | Dim words, wrapped |
| Wait | Something that takes long | Words, then one pip per piece of the work, then "prompt 4 of 10" |

A password or a key is typed as dots. A field always sits alone on its line. Lines may share
a row.

## States

| State | Shown as |
|---|---|
| At rest | As above |
| In focus | An amber mark `▸` before it, and its words turn cream and glow a little. A field's rule turns amber and its caret blinks. A slider's lit pips turn amber |
| Under the pointer | The same as in focus: moving the pointer over a thing gives it the focus, so there is never a second highlight. A field is the one exception: it takes the focus, and its caret, only when it is clicked or reached by the keys (owner, 2026-11-18, after play) |
| Pressed | Nothing of its own: a press acts at once |
| Busy | The mark blinks, and presses wait until the answer has come |
| About to destroy | The line's words turn rose and ask "Sure?" |
| Refused | A message in rose, where the thing was tried, saying what happened and what to do |

Something always has the focus while a panel is open, and it is always shown this one way:
by a shape and by a change of light, never by colour alone.

## Control

The same in every panel.

| Input | Does |
|---|---|
| Up, Down | Move to the row above or below, to the thing nearest in line. From the last row Down goes to the first |
| Left, Right | Move between things on one row. From the leftmost line of a row, Left goes one step back. On a slider, change it one step (5%). In a field, move the caret |
| Tab, Shift+Tab | The next or the previous thing in reading order, round and round inside the panel |
| Enter | Press what has the focus. In a field: go to the next field, or press the first line after the last one |
| Escape | One step back. With nothing open: at the title it opens the settings, in a dive it asks whether to leave the dive |
| Pointer | Moving over a thing gives it the focus; a click presses it. A click outside the words, or on the `‹`, goes one step back |
| Touch | A tap presses. The `‹` goes back |

- **Back** is always one step: from "Write a pack" to the list, from the list to the title.
  Escape, Left from the leftmost line, the `‹` and a click outside the words all mean it.
  No panel has a "Back" button. The one exception is a message with nothing else to press,
  because the focus must rest somewhere.
- **Leaving a dive** (owner, 2026-11-17). In a dive, Escape or the cog opens the step "Leave
  the dive?" with three lines: "Keep diving" (in focus), "Settings", "Leave the dive". A
  second Escape leaves the dive, as does pressing the last line; opened with Escape, the step
  says so. This is the one step where Escape does not mean back, so everything else that
  means back (Left, the `‹`, a click outside, the cog again) keeps the dive. A dive that is
  left goes straight to the title: it is not logged and no end screen opens. A key held down
  counts once, so holding Escape cannot leave a dive.
- **Where the focus lands.** When a step opens, on its first thing. Coming back from a step,
  on the line that opened it. After something is added, on the new thing. After something is
  removed, on what took its place.
- **Fields and arrows.** Because a field is alone on its row, Up and Down always leave it and
  Left and Right always belong to its caret. There is no editing mode.
- **Removing** takes two presses: "Remove" turns into "Sure?", and moving the focus away
  takes the question back. There is never a hold.
- **The cursor is a hand** over everything that can be pressed: the title menu's lines, the
  cog, and every line, field and slider of a panel.
- **No key hints are drawn.** The keys are the ones every game uses.
- **Nothing waits for an animation.** A panel is there on the frame its key is pressed.
- **A room's dive** is worked like single player's: Enter sends what is typed, Escape asks
  whether to leave the dive, and leaving it leaves the room (the step says so: "Esc again
  leaves the dive and the room"). Only the diver whose turn it is types; above their
  typing stands "Your turn" in amber, and the others see it dim, without a caret. One who
  only watches sees "Watching" there instead, dim; how many watch is counted after the
  prompt's number ("2 of 10 ~ 1 watching"), or on a line of its own where it does not fit.
- **In "longest"** every diver's hearts follow their name, rose when full and an outline
  when spent, in view and at the edges. The player's own hearts, their bar (10 teal pips)
  and a spent heart at its end stand at the bottom left while they are in (the bar goes at
  5 hearts, the most a diver can have); labels at the
  bottom edge move up out of their way. A diver who is out is named at the top edge with
  spent hearts. A heart gained is heard as two high bell notes after the lamp's own; a
  heart lost needs no sound of its own, since the broken glass of a dead lamp is it. The
  depth at the bottom right is always the player's own (owner, 2026-11-18); another
  player's diver carries their depth in dim letters over their name. Names are cream for the
  diver whose turn it is (in the room, for every diver who is ready) and dim for the others.
  A diver out of view is named at the top or bottom edge, on their line, with an arrow; a
  name that would run into the depth reading at the bottom right goes above it.
- **After a room's dive** each player's row ends with the depth they reached ("host ~
  2,805 m"), and a dim note under the list says who went deepest.
- **The step's name and code** take the focus from the pointer only (Tab and the arrows
  never reach them). On them, Down or Tab goes to the first line, Up to the last, Left goes
  back from the name, and Left and Right move between the name and the code.
- **In multiplayer** the column of words starts at 184 instead of 170 on a wide screen, so
  that it clears the third line. Going back from a room's step leaves the room; going back
  from `‹ Multiplayer` closes the connection to the server.
- **A key that failed.** When a request the live judge makes with a player's key fails (the
  key is refused, is out of credit or over its rate limit, or no answer comes), the server
  notes it on the key, and in a room on the host's. Back at the title after a dive, a rose
  message in place of the line under the title says "Your key failed: see Account" ("keys"
  if both did). The account panel names it on the key's line ("Anthropic key ~ refused")
  and the key's step says what happened and what to do, in rose. It stays until a request with the key works,
  or the key is replaced or forgotten.
- **A room's link** opens "Join a room" with the code filled in and the focus on the name.
- **The room's mode** is chosen in a step of its own, `‹ Mode`: a line for each mode with a
  message under it on how it is played, and "chosen" against the right edge of the one in use.
  Choosing one goes back to the set-up, with the focus on "Mode".
- **In a room's chaos dive** no hearts are drawn, since each diver has one. A diver whose air
  runs out sees the end of a single player's chaos dive (last words in the dark), then watches.

## The end of a dive

The screen that ends a dive is not a panel: once the diver is back at the surface the sea
fades to black and the lamps of the dive rise into a row on a line, each as bright as its
answer was rare.

- The focus rests on a lamp or on the line back ("Back to the title", or "Back to the room").
  It is shown as everywhere: the amber mark (before a lamp's number, or under a small lamp of a
  room's row) and cream words.
- The words about the lamp in focus stand under the lamps: pack and number, prompt, the answer
  large in mint (or "Out of air" in rose), what it gained and its light.
- Left and Right move along a row and stop at its ends. Up and Down move between rows,
  keeping the column, and round through the line back. Moving the focus makes no sound.
- Enter and Escape leave from anywhere. The pointer gives the focus to a lamp or the line back;
  only a press on the line back leaves.
- In a room every diver has a row, in place order, named at the left in their suit's colour,
  the winner in amber.
- A chaos dive's end stays on the failing tape, with bloodshot eyes that follow
  the focus, and for a lost dive a cut line.

## Sizes

- A line is 12 game pixels tall, or as many as it takes to be 40 screen pixels tall (20 on a
  phone, where one game pixel is two screen pixels): room for a fingertip. If a step does
  not fit the screen at that height, it falls back to 12.
- 12 pixels is also what a line in another script needs (the bundled font is 10 tall).
- A slider's track is 60 pixels: 20 pips of 2, a pixel apart.
- Text is the 3 by 5 capitals throughout; a long name loses its end.

## Colours (palette indices)

Step name 6, line 7, lesser line 6, message 6, in focus 16 with the mark in 15, rose 18,
field rule 4 (15 in focus), caret 16, pips 6 on and 4 off (15 on in focus), wait pips 10.

## The world

- Sound and light answer for the interface where they can: a slider's step is heard at its
  new level, and a pack that has been written rings like a lit lamp (a dull knock if it could
  not be written), whether or not the panel is still open.
- A lantern lit in a room (a player is ready) is heard as a strike and a warm rising note;
  one put out, as a soft puff falling. Not as a dive begins or ends, which clears them all.
- Writing a pack counts the prompts as Claude writes them, and can be stopped. Escape leaves
  the step and the writing goes on.

## Wording

- A line says what pressing it does, as a verb: "Add a pack", "Keep key", "Sign out". A row
  of a list is the thing's own name.
- A message is one plain sentence without a full stop. A refusal says what happened and, if
  there is one, the way out ("an account keeps at most 10 packs: remove one first").
- The same thing has the same name everywhere: a pack, a key, a name, a password.

## For the browser

Every line, field and slider is a real HTML control, invisible and laid exactly over its
drawing. That keeps what browsers do for forms: saved passwords, Tab, a phone's keyboard, a
file chooser, screen readers. The focus the game draws is the browser's own focus.
