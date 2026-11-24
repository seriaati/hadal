-- The prompts of each day's daily dive in each language, in the order they are asked: built-in prompt ids, fixed when
-- the day's set is first asked for, so that a pack changed during the day does not change it.
create table daily_sets (
  day date not null,
  language text not null,
  prompts jsonb not null,
  primary key (day, language)
);

-- A player's daily dives: only the first of the day is scored. `player` is 'a' and their account's id when signed in,
-- or 'b' and their browser's id. `depth` is in metres, null until the scored dive ends or is left.
create table daily_runs (
  day date not null,
  player text not null,
  depth int,
  primary key (day, player)
);
