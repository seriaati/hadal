-- Answers are ranked in tiers instead of a rarity from 1 to 100. Each rarity goes to the tier
-- of the light it used to show (20 points each), except that only a rarity of 100, the
-- rarest answer of its prompt, becomes a gem, so every prompt keeps at least one.
create function pg_temp.tier_of(rarity int) returns text language sql immutable as $$
  select case
    when rarity <= 20 then 'common'
    when rarity <= 40 then 'familiar'
    when rarity <= 60 then 'uncommon'
    when rarity < 100 then 'rare'
    else 'gem'
  end
$$;

update packs set data = jsonb_set(data, '{prompts}', (
  select jsonb_agg(
    jsonb_set(prompt, '{answers}', (
      select jsonb_agg((answer - 'rarity') || jsonb_build_object('tier', pg_temp.tier_of((answer->>'rarity')::int)) order by j)
      from jsonb_array_elements(prompt->'answers') with ordinality as a(answer, j)
    ))
    order by i)
  from jsonb_array_elements(data->'prompts') with ordinality as p(prompt, i)
));

-- A ruling is found by a hash of its prompt's listed answers, tiers now among them, so no
-- kept ruling can be found again.
delete from verdicts;
