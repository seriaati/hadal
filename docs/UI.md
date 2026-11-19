# Hadal: the interface

How the panels look and how the game is controlled. The code is `src/web/pixel/ui.ts`; a panel
only lists what it holds.

## The idea

There is no panel. The words stand in the water where the title menu stands, in the same
letters, and the water behind them goes two shades darker with a soft edge so the small
letters read. Nothing is framed and the sea is not dimmed: the game goes on in full view.

- On a wide screen (300 game pixels or more) the words take the column to the right of the
  diver. On a narrow one they lie under the diver, across the whole width.
- The words never cover the diver or the lantern. A step too long for its room scrolls under
  its name, and a thin bar at the right edge shows how far. What acts on a list (its lines,
  such as "Add a pack" and "Write a pack") stands at the step's foot: when the step scrolls,
  the foot stays at the bottom and only the list above it moves, unless that would leave the
  list less than two lines. Only on a screen too short to hold a few lines does a step climb
  over the diver.
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
| Player | One of the people in a room | A pip of their suit's colour, the name, and a dim word ("ready"). The host has a dim crown after the name instead, the same crown that stands before their name over their diver. A player's own name is pressed like a line, and opens their suit. To the host every other player is pressed too, and opens what the host can do to them; to the others they are only read, and the focus passes over them |
| Message | Words that are only read | Dim words, wrapped |
| Wait | Something that takes long | Words, then one pip per piece of the work, then "prompt 4 of 10". Past 10 pieces a pip stands for a tenth of the work |

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
| About to destroy | The line's words turn rose and ask "Sure?" (the step's name, when it was the `‹` that was pressed) |
| Refused | A message in rose, where the thing was tried, saying what happened and what to do |
| Warned | A note in rose under what it warns of, such as the horror of chaos mode |

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
| Wheel | Scrolls a step too long for its room |
| Touch | A tap presses, a drag scrolls. The `‹` goes back |

- **Back** is always one step: from "Write a pack" to the list, from the list to the title.
  Escape, Left from the leftmost line, the `‹` and a click outside the words all mean it.
  No panel has a "Back" button. The one exception is a message with nothing else to press,
  because the focus must rest somewhere.
- **Where the focus lands.** When a step opens, on its first thing. Coming back from a step,
  on the line that opened it. After something is added, on the new thing. After something is
  removed, on what took its place.
- **Fields and arrows.** Because a field is alone on its row, Up and Down always leave it and
  Left and Right always belong to its caret. There is no editing mode.
- **Removing** takes two presses: "Remove" turns into "Sure?", and moving the focus away
  takes the question back. There is never a hold.
- **Nothing jumps.** While a step is open, the line in focus stays where it is when the step
  changes (a message, a player joining), and the step moves, or scrolls, around it as far as
  the screen allows. Words said under a line keep their room after they go until the step closes, so a
  message that comes and goes moves nothing. This holds for every panel, without its own code.
- **Scrolling.** A thing the keys give the focus to is scrolled into view. One the pointer
  gives it to is under the pointer already, and nothing moves.
- **Leaving a room** asks the same way: every way out (Escape, Left, a click outside,
  "Leave the room") first turns "Leave the room" into "Sure?" and puts the focus on it. A
  press on the `‹` (or Left from it) asks there instead: the room's name turns into a rose
  "Sure?", and a second press leaves.
- **The cursor is a hand** over everything that can be pressed: the title menu's lines, the
  cog, and every line, field and slider of a panel.
- **No key hints are drawn.** The keys are the ones every game uses.
- **Nothing waits for an animation.** A panel is there on the frame its key is pressed.

## Sizes

- A line is 12 game pixels tall, or as many as it takes to be 40 screen pixels tall (20 on a
  phone, where one game pixel is two screen pixels): room for a fingertip. If a step would
  have to scroll at that height but fits at 12, it falls back to 12.
- 12 pixels is also what a line in another script needs (the bundled font is 10 tall).
- A slider's track is 60 pixels: 20 pips of 2, a pixel apart.
- Text is the 3 by 5 capitals throughout; a long name loses its end.

## Colours (palette indices)

Step name 6, line 7, lesser line 6, message 6, in focus 16 with the mark in 15, rose 18,
field rule 4 (15 in focus), caret 16, pips 6 on and 4 off (15 on in focus), wait pips 10, scroll bar 4 with the part in
view 6.

## The world

- Sound and light answer for the interface where they can: a slider's step is heard at its
  new level.
- What happens to the people of a room is seen in the sea. One who leaves is hauled up their line
  into the boat; one removed is jolted and yanked up; one banned has their line snap and sinks
  into the dark. The crown flies from the old host's name to the new one's and glints there.

## Wording

- A line says what pressing it does, as a verb: "Add a pack", "Keep key", "Sign out". A row
  of a list is the thing's own name.
- A message is one plain sentence without a full stop. A refusal says what happened and, if
  there is one, the way out ("an account keeps at most 10 packs: remove one first").
- The same thing has the same name everywhere: a pack, a key, a name, a password.
- Every word comes from the table of the player's language in `src/shared/words/`, and the
  rules above hold in each language. Chinese is drawn in the bundled font, which stands taller
  than the capitals: lines of it are set further apart.

## For the browser

Every line, field and slider is a real HTML control, invisible and laid exactly over its
drawing. That keeps what browsers do for forms: saved passwords, Tab, a phone's keyboard, a
file chooser, screen readers. The focus the game draws is the browser's own focus.
