-- Where the answers of a built-in prompt that grows come from (an `Entry` of tools/sources.ts), and what its sources
-- listed when last checked: by source, its values. `pack` is the English pack's id for a prompt every language asks,
-- or a Chinese pack's for one only it asks, as the files in curation/ are named.
create table prompt_sources (
  pack text not null,
  prompt text not null,
  entry jsonb not null,
  seen jsonb not null default '{}',
  primary key (pack, prompt)
);

-- Each month's update of the prompts that grow (as 'YYYY-MM'): what it changed, for the admin panel, and what it used
-- of the instance's key.
create table pack_updates (
  month text primary key,
  ran_at timestamptz not null default now(),
  summary jsonb not null
);
