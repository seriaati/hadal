-- The prompts Claude writes for a day's daily dive, one for each of its themes (an English pack id), written the day
-- before. `prompts` holds the prompt in each language, by language; null until it is written. `sources`, for a prompt
-- whose set grows, is where its answers come from (an `Entry` of tools/sources.ts). `tries` counts the
-- attempts; the tokens (input not read from the cache, written to it and read from it, and output) and searches are
-- what they used of the instance's key. Kept apart from the packs, but judged like any built-in prompt, until
-- `absorbed_at`, when the day was over and the prompt joined its packs (if the day asked it).
create table daily_prompts (
  day date not null,
  theme text not null,
  prompts jsonb,
  sources jsonb,
  tries int not null default 0,
  input_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  searches int not null default 0,
  absorbed_at timestamptz,
  primary key (day, theme)
);
