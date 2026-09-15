-- ============================================================
-- 008_repertoire_clean.sql — variante « maîtrisée » = passe complète sans faute
-- ============================================================
-- `fsrs_due_at` seul ne suffit pas à afficher une variante comme maîtrisée
-- dans l'arbre : un enfant peut avoir un état FSRS "acquis" alors que la
-- dernière fois qu'on a atteint cette fin de variante, c'était après un
-- Recommencer (une erreur suivie d'un retry sur la même ligne). `clean` ne
-- vaut vrai que si la dernière atteinte de ce nœud s'est faite d'une traite,
-- sans erreur ni Recommencer (voir RepertoireScreen.tsx).

alter table repertoire_nodes
  add column if not exists clean boolean not null default false;
