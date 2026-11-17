-- What the live judge ruled on an answer its pack does not list, kept so that no answer is
-- judged (and paid for) twice. Shared by every player. `prompt` is a hash of the prompt's
-- text and listed answers, so a prompt that is edited starts afresh; `asked` is its text, for
-- whoever reads this table. `answer` is the answer as `normalize` leaves it. `spelling` is how
-- a correct answer is written, null when the answer was ruled wrong (rarity 0).
-- A wrong ruling is undone by deleting its row.
create table verdicts (
  prompt text not null,
  answer text not null,
  asked text not null,
  spelling text,
  rarity int not null,
  primary key (prompt, answer)
);
