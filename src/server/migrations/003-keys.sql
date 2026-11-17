-- A player's API key for an AI provider. `sealed` is the key encrypted with the server's
-- HADAL_SECRET (see `keys.ts`), so a copy of this table alone gives no keys away.
create table keys (
  account_id bigint not null references accounts on delete cascade,
  provider text not null,
  sealed text not null,
  primary key (account_id, provider)
);
