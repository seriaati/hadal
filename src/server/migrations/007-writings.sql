-- A pack Claude is writing for a player in the background, at most one each. `request` is what
-- they asked for (a `WriteOrder`). `plan` is the pack's name and prompts once Claude has written
-- them; `answers` holds each prompt's answers by its place in the plan, null for a prompt that
-- could not be written. The row goes when the pack is kept. One that failed keeps why, in the
-- player's language, until they have been told.
create table writings (
  account_id bigint primary key references accounts on delete cascade,
  language text not null,
  request jsonb not null,
  plan jsonb,
  answers jsonb not null default '{}',
  failed text
);
