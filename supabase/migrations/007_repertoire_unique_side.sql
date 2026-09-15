-- 007_repertoire_unique_side.sql — la contrainte d'unicité doit inclure `side`
-- ============================================================
-- (fen, move_san) ne suffit pas : les deux répertoires partagent la position
-- de départ (1.e4), une fois comme notre coup côté Blancs, une fois comme
-- coup adverse assumé côté Noirs. Sans `side` dans la contrainte, la seconde
-- ligne ne pouvait jamais être insérée (conflit avec la première), et
-- l'arbre Noirs se retrouvait sans racine — "fin de la variante" immédiate
-- côté app.

drop index if exists repertoire_nodes_fen_move_key;

create unique index if not exists repertoire_nodes_fen_move_side_key
  on repertoire_nodes (fen, move_san, side);
