-- ============================================================
-- 012_theme_stats_mastered.sql — compte "maîtrisé" par thème
-- ============================================================
-- L'écran Stats affichait "due" par thème ; avec les boîtes (010), ce
-- chiffre a moins de sens pour new/unvalidated qui ne dépendent plus d'une
-- échéance précise. `mastered` (nombre de cartes en boîte `mastered` pour ce
-- thème) le remplace.

-- Le type de retour change (colonne `mastered` en plus) : postgres refuse un
-- `create or replace` qui modifie la ligne des OUT parameters, il faut drop.
drop function if exists theme_stats();

create function theme_stats()
returns table (
  theme text,
  cards int,
  seen int,
  correct int,
  incorrect int,
  due int,
  mastered int
)
language sql stable security invoker as $$
  select
    t.theme,
    count(*)::int                                                    as cards,
    coalesce(sum(m.times_seen), 0)::int                              as seen,
    coalesce(sum(m.times_correct), 0)::int                           as correct,
    coalesce(sum(m.times_incorrect), 0)::int                         as incorrect,
    count(*) filter (where m.fsrs_due_at <= now())::int              as due,
    count(*) filter (where m.box = 'mastered')::int                  as mastered
  from mistakes m
  cross join lateral unnest(m.themes) as t(theme)
  where m.user_id = auth.uid()
  group by t.theme
  order by cards desc;
$$;
