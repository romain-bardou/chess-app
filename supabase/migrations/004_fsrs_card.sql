-- ============================================================
-- 004_fsrs_card.sql — état FSRS complet
-- ============================================================
-- `fsrs_stability` / `fsrs_difficulty` / `fsrs_due_at` restent les colonnes de
-- référence : ce sont elles qu'on interroge et qu'on indexe. Mais FSRS a
-- besoin de plus que ça pour planifier correctement (state, reps, lapses,
-- last_review, learning_steps) : sans ces champs, une carte relue après un
-- oubli repart comme une carte neuve.
--
-- Plutôt que d'ajouter six colonnes qui ne servent qu'à l'algorithme, on
-- stocke la Card `ts-fsrs` telle quelle. Les trois colonnes ci-dessus en sont
-- la projection, tenue à jour par l'app à chaque révision.

alter table mistakes
  add column if not exists fsrs_card jsonb;

alter table repertoire_nodes
  add column if not exists fsrs_card jsonb;
