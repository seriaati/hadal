-- Why the last request the live judge made with this key failed, for its owner to be told at
-- the title: 'refused', 'limited' or 'unanswered'. Null once a request with it works, or
-- when the key is replaced.
alter table keys add column failed text;
