-- ============================================================
-- 002_stats.sql — agrégations pour l'écran de stats
-- ============================================================

-- Taux de réussite par thème tactique. Une carte à N thèmes compte dans
-- chacun d'eux (dépliage du tableau `themes`).
create or replace function theme_stats()
returns table (
  theme text,
  cards int,
  seen int,
  correct int,
  incorrect int,
  due int
)
language sql stable security invoker as $$
  select
    t.theme,
    count(*)::int                                                    as cards,
    coalesce(sum(m.times_seen), 0)::int                              as seen,
    coalesce(sum(m.times_correct), 0)::int                           as correct,
    coalesce(sum(m.times_incorrect), 0)::int                         as incorrect,
    count(*) filter (where m.fsrs_due_at <= now())::int              as due
  from mistakes m
  cross join lateral unnest(m.themes) as t(theme)
  where m.user_id = auth.uid()
  group by t.theme
  order by cards desc;
$$;

-- Chiffres globaux (une seule ligne).
create or replace function global_stats()
returns table (
  cards int,
  seen int,
  correct int,
  incorrect int,
  due int,
  inaccuracies int,
  mistakes_count int,
  blunders int,
  games_analyzed int
)
language sql stable security invoker as $$
  select
    (select count(*) from mistakes where user_id = auth.uid())::int,
    (select coalesce(sum(times_seen),0) from mistakes where user_id = auth.uid())::int,
    (select coalesce(sum(times_correct),0) from mistakes where user_id = auth.uid())::int,
    (select coalesce(sum(times_incorrect),0) from mistakes where user_id = auth.uid())::int,
    (select count(*) from mistakes where user_id = auth.uid() and fsrs_due_at <= now())::int,
    (select count(*) from mistakes where user_id = auth.uid() and category = 'inaccuracy')::int,
    (select count(*) from mistakes where user_id = auth.uid() and category = 'mistake')::int,
    (select count(*) from mistakes where user_id = auth.uid() and category = 'blunder')::int,
    (select count(*) from games where user_id = auth.uid() and analyzed)::int;
$$;
