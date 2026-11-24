-- An admin may change the built-in packs from the game. Set only by hand in the database: no route changes it.
alter table accounts add column admin boolean not null default false;

-- The built-in packs, kept whole as `validatePack` passed them. An id is unique across every language.
create table system_packs (
  id text primary key,
  language text not null,
  data jsonb not null,
  saved_at timestamptz not null default now()
);

-- Each version a built-in pack had before it was replaced, so that a mistaken upload can be undone by hand.
create table system_pack_versions (
  id text not null,
  language text not null,
  data jsonb not null,
  saved_at timestamptz not null,
  replaced_at timestamptz not null default now()
);
