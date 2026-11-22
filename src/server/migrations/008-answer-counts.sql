-- How many times players have given each answer to a built-in prompt, right or wrong: how rare
-- an answer really is, and which right ones a pack is missing. Nothing says who gave an answer.
-- `prompt` is the prompt's id, `answer` the answer as `normalize` leaves it and `typed` the last
-- way it was typed. `judged` is the spelling it was last judged to be (a listed answer, or one
-- the live judge allowed), null when it was wrong.
create table answer_counts (
  prompt text not null,
  answer text not null,
  typed text not null,
  judged text,
  times int not null default 1,
  primary key (prompt, answer)
);
