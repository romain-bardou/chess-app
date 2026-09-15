-- 006_repertoire_unique.sql — contrainte d'unicité sur repertoire_nodes
-- ============================================================
-- Le script de génération du répertoire (phase 2, analysis/repertoire.py) est
-- rejouable : changer LICHESS_RATING_BAND en montant en elo doit mettre à
-- jour les lignes existantes, pas les dupliquer. L'index (fen, move_san)
-- posé par 001_init.sql n'est pas unique, donc inutilisable comme cible
-- d'upsert (on_conflict). L'instance est mono-utilisateur (une seule ligne
-- dans app_owner), donc (fen, move_san) suffit sans y ajouter user_id.

drop index if exists repertoire_nodes_fen_idx;

create unique index if not exists repertoire_nodes_fen_move_key
  on repertoire_nodes (fen, move_san);
