-- A player's own pack, kept whole as the JSON that was uploaded (already checked by
-- `validatePack`). Its id is unique within the account, not across accounts.
create table packs (
  account_id bigint not null references accounts on delete cascade,
  id text not null,
  data jsonb not null,
  primary key (account_id, id)
);
