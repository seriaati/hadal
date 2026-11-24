# Hadal: the interface

How the panels look and how the game is controlled. The code is `src/web/pixel/ui.ts`; a panel
only lists what it holds.

## The idea

There is no panel. The words stand in the water where the title menu stands, in the same
letters, and the water behind them goes two shades darker so the small letters read. The sea
around darkens towards them over a wide, dithered fade, so the two meet without an edge.
Nothing is framed and the sea is not dimmed: the game goes on in full view.

- On a wide screen (300 game pixels or more) the words take the column to the right of the
  diver. On a narrow one they lie under the diver, across the whole width. In a room before a
  dive, every diver hangs along the boat and the words lie in a dock across the foot of the
  screen, as low as they fit: a deeper step grows it upwards, never over the divers.
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
| Step | One screen of a panel | Its name at the top in dim letters, with a `‹` before it. Under the pointer the `‹` and the name light up like a line in focus, since a press there goes back. A step that leaves something (a room) has an exit mark in place of the `‹`, and its name says so ("Leave"). A room's step has its code against the right edge, in pale letters, since it is read out to others; a press on the code copies the room's link, it lights up the same way, and it says the link was copied for a moment |
| Line | Anything pressed: a row of a list, a button, a link | Pale words. A lesser line beside another ("Download", "Remove") is dim; two of them stand side by side against the right edge |
| Field | A line of typing | Its label in dim letters, the typing under it, a rule under that |
| Slider | A level from 0 to 1 | Its label, and 20 pips at the right of the line, like the air gauge. It may have fewer steps (the air of a room: 12, with "30 s" after the pips), or be a choice of colours, one pip of each (a suit). On a touch screen a level is a counter instead: a minus, the level ("50%", "30 s") and a plus |
| Setting | A line that stands for a choice | Its label, and the choice against the right edge ("Deepest", "built-in + 2"), with a pip before it if it is on or off. Left and Right change it, like a slider; Enter flips an on or off one |
| Action | The one thing a step is for (lighting the lantern in a room, starting the dive) | The larger letters, in amber, in the middle of its row, after an icon if it has one. Dim while it cannot be done yet, though it may still be pressed to hear why. The focus lands on it when its step opens |
| Summary | Facts read together, such as how a room is set up | Pale facts with a dim `~` between them, wrapped only between facts. A fact that has just changed glows amber. Where it can be changed it is pressed like a line, with a dim word at the right edge ("Change") |
| Diver | One of the people in a room, pressed where they hang in the sea | Drawn by the sea, not the panel. A diver is pressed on their name or on themselves. A player's own diver opens their suit and "Say something", with "Tab" at its right where there are keys (Tab opens the chat there too); to the host every other diver opens what the host can do to them. To the others another diver is only seen, and the focus passes over them. The divers are a row over the panel's: Up from its first row reaches them. In a dive the host presses another diver's name to open the same |
| Message | Words that are only read | Dim words, wrapped |
| Wait | Something that takes long | Words, then one pip per piece of the work, then "prompt 4 of 10". Past 10 pieces a pip stands for a tenth of the work |

A password or a key is typed as dots. A field always sits alone on its line. Lines may share
a row.

## States

| State | Shown as |
|---|---|
| At rest | As above |
| In focus | An amber mark `▸` before it, and its words turn cream and glow a little. A field's rule turns amber and its caret blinks; letters selected in it (Ctrl+A, Shift and an arrow) stand on a band of colour 5 and the caret is hidden, as in the answer and what is said. A slider's lit pips turn amber |
| Under the pointer | The same as in focus: moving the pointer over a thing gives it the focus, so there is never a second highlight. Moving it off onto nothing takes the focus away, and nothing is lit until the pointer is over a thing again or a key that moves lights that line again (owner, 2026-11-21). A field is the one exception: it takes the focus, and its caret, only when it is clicked or reached by the keys (owner, 2026-11-18, after play) |
| Pressed | Nothing of its own: a press acts at once |
| Busy | The line that was pressed keeps the look of the focus, wherever the focus goes, and dots after its words fill one by one. Presses wait until the answer has come. A panel that leads into a dive stays until the dive has begun |
| About to destroy | The line's words turn rose and ask "Sure?" (the step's name, when it was the `‹` that was pressed) |
| Refused | A message in rose, where the thing was tried, saying what happened and what to do |
| Warned | A note in rose under what it warns of, such as the horror of chaos mode. A note of what a change will cost, said before it is made, is amber and stands at the top of the step ("changing these puts out 2 lanterns") |

Something has the focus while a panel is open, unless the pointer has just moved off it, and the focus is always shown this one way:
by a shape and by a change of light, never by colour alone.

## Control

The same in every panel.

| Input | Does |
|---|---|
| Up, Down | Move to the row above or below, to the thing nearest in line. From the last row Down goes to the first |
| Left, Right | Move between things on one row. From the leftmost line of a row, Left goes one step back. On a slider, change it one step (5%). In a field, move the caret |
| Tab, Shift+Tab | The next or the previous thing in reading order, round and round inside the panel. In a room, Tab opens what the player says instead (see Typing), as it does in a dive (owner, 2026-11-21); Shift+Tab and the arrows still move |
| Enter | Press what has the focus. In a field: go to the next field, or press the first line after the last one |
| Space | Nothing, outside a field, where it is typed: only Enter presses (owner, 2026-11-21) |
| Typing | What the player says to a room, in a bubble over their own diver, edged in amber while it is typed. Tab opens it with nothing typed, in the room and in a dive while it is not the player's turn: an input method (Chinese) composes only into a field that already has the focus. In the room, with no field in focus, a letter or `/` opens it too, and a key an input method takes first opens it and is lost; in a dive letters type the answer, and "/" may be in one. Enter sends it, Escape takes it back (not a step back), Tab goes back with it kept, and the focus returns where it was; while it is open the pointer lights nothing, and only a click on another thing closes it (owner, 2026-11-21); the player's turn closes it the same way. No key moves to it, and nothing of it is drawn until it is typed. A phone opens it from the player's own diver, and in a dive from a speech mark at the bottom left, lit while it is open. What would give away an answer is refused in a rose bubble in its place. A screen reader is told what the others say |
| Escape | One step back. With nothing open: at the title it opens the settings, in a dive it asks whether to leave the dive |
| Pointer | Moving over a thing gives it the focus; a click presses it. A click on the `‹` goes one step back; a click on nothing does nothing (owner, 2026-11-21). The title menu's lines are chosen and let go the same way. On a slider, a press on a pip sets the level there, a click on the label sets it to the lowest (owner, 2026-11-20) or, on a choice of colours, to the next, round to the first (owner, 2026-11-21), and a drag anywhere along the row moves it a step for each pip it passes |
| Wheel | Scrolls a step too long for its room |
| Touch | A tap presses, a drag scrolls. On a counter, a tap on the minus or the plus moves it one step. The `‹` goes back. In a dive a tap anywhere opens the keyboard, and after a verdict it goes on, like Enter (a tap, not a mouse click) |

- **Back** is always one step: from "Write a pack" to the list, from the list to the title.
  Escape, Left from the leftmost line and the `‹` all mean it.
  No panel has a "Back" button. The one exception is a message with nothing else to press,
  because the focus must rest somewhere.
- **Where the focus lands.** When a step opens, on its first thing. Coming back from a step,
  on the line that opened it. After something is added, on the new thing. After something is
  removed, on what took its place.
- **W, A, S and D** are the arrows too (by where they sit, so ZQSD on AZERTY), at the title,
  in every panel and on the screen that ends a dive. Not in a field, where they are typed, nor
  in a room, where a letter opens what the player says.
- **Fields and arrows.** Because a field is alone on its row, Up and Down always leave it and
  Left and Right always belong to its caret. There is no editing mode.
- **Removing**, and passing a room's crown, take two presses: the line turns into "Sure?", and
  moving the focus away takes the question back. There is never a hold.
- **Nothing jumps.** While a step is open, the line in focus stays where it is when the step
  changes (a message, a player joining), and the step moves, or scrolls, around it as far as
  the screen allows. Words said under a line keep their room after they go until the step closes, so a
  message that comes and goes moves nothing. This holds for every panel, without its own code.
- **Scrolling.** A thing the keys give the focus to is scrolled into view. One the pointer
  gives it to is under the pointer already, and nothing moves.
- **Leaving a room** asks the same way: every way out (Escape, Left, a press on "Leave") first turns "Leave" into a rose "Sure?" and puts the focus on it. A
  second way out leaves.
- **The cursor is a hand** over everything that can be pressed: the title menu's lines, the
  icons at the top right, and every line, field and slider of a panel.
- **The icons at the top right** stand in a row with the cog always rightmost: [update][admin][cog].
  An admin has a key at the cog's left, at the title and not in a room, that opens the admin
  panel; its words are English in every language, the one panel that does not follow the
  player's (owner, 2026-11-24). When a newer version is out, an amber turning arrow at the far
  left reloads the game; it shows only at the title, where no dive is lost. The icons stand clear of
  the frame's edges, and the one under the mouse turns cream and glows, as a line in focus does.
- **No key hints are drawn.** The keys are the ones every game uses.
- **Nothing waits for an animation.** A panel is there on the frame its key is pressed.

## Sizes

- On a phone held upright the frame is about 150 game pixels across (one game pixel is two and
  a half screen pixels or more), so the words are big enough to read and press. The game fills
  only what can be seen: when the keyboard opens, the frame loses rows at the bottom and keeps
  its scale.
- A line is 12 game pixels tall, or as many as it takes to be 40 screen pixels tall (about 15
  on a phone): room for a fingertip. If a step would have to scroll at that height but fits at
  12, it falls back to 12.
- 12 pixels is also what a line in another script needs (its letters are 8 tall, in half pixels).
- A slider's track is 60 pixels: 20 pips of 2, a pixel apart.
- Text is the 3 by 5 capitals throughout; a long name loses its end.

## Colours (palette indices)

Step name 6, line 7, lesser line 6, message 6, action 15 (5 while dim), in focus 16 with the mark in 15, rose 18,
field rule 4 (15 in focus), caret 16, selection 5, pips 6 on and 4 off (15 on in focus), wait pips 10, scroll bar 4 with the part in
view 6.

## The world

- Sound and light answer for the interface where they can: a slider's step is heard at its
  new level.
- What happens to the people of a room is seen in the sea. One who leaves is hauled up their line
  into the boat; one removed is jolted and yanked up; one banned has their line snap and sinks
  into the dark. The crown flies from the old host's name to the new one's and glints there.
  A muted diver has a struck-through speech mark where a host's crown would be.
- The host's "Start the dive", pressed while some are not ready, calls them instead of saying
  why: a ship's bell rings twice for everyone, and the lanterns of those not ready blink red
  for a few seconds, until they light them.

## Wording

- A line says what pressing it does, as a verb: "Add a pack", "Keep key", "Sign out". A row
  of a list is the thing's own name.
- A message is one plain sentence without a full stop. A refusal says what happened and, if
  there is one, the way out ("an account keeps at most 25 packs: remove one first").
- The same thing has the same name everywhere: a pack, a key, a name, a password.
- Every word comes from the table of the player's language in `src/shared/words/`, and the
  rules above hold in each language. Chinese is drawn in the bundled font, which stands taller
  than the capitals: lines of it are set further apart.

## For the browser

Every line, field and slider is a real HTML control, invisible and laid exactly over its
drawing. That keeps what browsers do for forms: saved passwords, Tab, a phone's keyboard, a
file chooser, screen readers. The focus the game draws is the browser's own focus.
