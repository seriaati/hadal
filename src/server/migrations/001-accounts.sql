create table accounts (
  id bigint generated always as identity primary key,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- A session is found by the hash of the token in the player's cookie, so a copy of this
-- table lets nobody in.
create table sessions (
  token_hash text primary key,
  account_id bigint not null references accounts on delete cascade,
  expires_at timestamptz not null
);
