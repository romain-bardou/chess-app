-- ============================================================
-- 005_puzzle_solution.sql — dernier coup adverse et solution complète
-- ============================================================
-- Trois colonnes nullables, pour que les cartes déjà en base restent lisibles
-- par l'app (elles se comportent comme des puzzles à un coup, sans surlignage
-- du coup précédent).

alter table mistakes
  -- {san, uci} : le coup adverse qui a amené la position. Surligné à
  -- l'affichage de la carte pour situer ce qui vient de se passer.
  add column if not exists previous_move jsonb,
  -- [{san, uci}] : la variante à jouer, en alternance solveur / adversaire,
  -- coupée dès que le gain est encaissé. Se termine sur un coup du solveur.
  add column if not exists solution jsonb,
  -- {"type": "mate"} ou {"type": "material", "value": <pions gagnés>}.
  add column if not exists solution_gain jsonb;
