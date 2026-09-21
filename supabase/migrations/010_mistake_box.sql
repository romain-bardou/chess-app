-- ============================================================
-- 010_mistake_box.sql — classement des puzzles en boîtes
-- ============================================================
-- `fsrs_due_at` dit QUAND revoir une carte, pas OÙ elle en est : une carte
-- jamais vue et une carte ratée hier partagent le même pool "due". `box`
-- ajoute ce classement, en plus de FSRS (qui reste seul maître de la
-- planification) :
--   new         jamais résolue
--   unvalidated ratée au moins une fois, quelle que soit sa boîte d'avant
--   validated   résolue une fois depuis new/unvalidated
--   mastered    résolue une seconde fois d'affilée depuis validated
--
-- Transitions (voir `nextBox` dans app/src/lib/fsrs.ts) :
--   échec            -> unvalidated, toujours
--   réussite depuis new/unvalidated -> validated
--   réussite depuis validated/mastered -> mastered

alter table mistakes
  add column if not exists box text not null default 'new'
    check (box in ('new','unvalidated','validated','mastered'));

-- Backfill des cartes déjà en base à partir des compteurs existants : pas
-- l'historique exact des boîtes, mais une approximation raisonnable plutôt
-- que de tout remettre à "new" et perdre la progression déjà faite.
update mistakes set box = case
  when times_correct = 0 and times_incorrect = 0 then 'new'
  when times_incorrect > 0 then 'unvalidated'
  when times_correct >= 2 then 'mastered'
  else 'validated'
end;

create index if not exists mistakes_box_idx on mistakes (user_id, box);
