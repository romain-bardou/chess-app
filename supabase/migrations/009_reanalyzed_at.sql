-- ============================================================
-- 009_reanalyzed_at.sql — curseur de réanalyse
-- ============================================================
-- `analyzed` reste le drapeau du pipeline quotidien (parties jamais vues).
-- `reanalyzed_at` sert de curseur séparé pour repasser, petit à petit et sans
-- doublon, les parties déjà analysées sous une nouvelle version de la logique
-- (ex : vérification des défenses adverses). Null tant qu'une partie n'est
-- pas repassée.

alter table games
  add column if not exists reanalyzed_at timestamptz;
