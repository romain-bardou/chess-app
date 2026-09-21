"""Repasse les parties déjà analysées sous la logique courante, par lots.

Contrairement à `main.py` (qui ne regarde que les parties jamais vues), ce
script cible les parties déjà `analyzed = true` mais pas encore `reanalyzed_at`
— utile après un changement de la logique de détection ou de solution, sans
attendre de nouvelles parties. Chaque partie n'est reprise qu'une fois par
lancement de ce script : le curseur `reanalyzed_at` avance à mesure, on peut
donc le relancer à volonté, un petit lot à la fois.

Une carte que la logique actuelle reproduit garde son historique FSRS (voir
`Supabase.upsert_mistakes_preserving_fsrs`) : seule sa solution/évaluation est
remplacée. Une carte qu'elle ne reproduit plus est supprimée, révisée ou non.
"""
from __future__ import annotations

import logging
import os
import sys

from config import Config
from db import Supabase
from engine import Engine
from main import analyse_game

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger("reanalyze")


def run() -> int:
    config = Config.from_env()
    batch = int(os.environ.get("REANALYZE_BATCH", "20"))

    with Supabase(config) as database:
        games = database.games_to_reanalyze(batch)
        if not games:
            log.info("Aucune partie à repasser.")
            return 0

        log.info("%d partie(s) à repasser.", len(games))
        database.owner_id  # échoue tôt si app_owner n'est pas renseignée

        total_removed = 0
        with Engine(config) as engine:
            for index, game_row in enumerate(games, start=1):
                try:
                    rows = analyse_game(engine, database, config, game_row)
                    database.upsert_mistakes_preserving_fsrs(rows)
                    removed = database.delete_stale_mistakes(
                        game_row["id"], [row["ply_number"] for row in rows]
                    )
                    database.mark_reanalyzed(game_row["id"])
                    total_removed += removed
                    log.info(
                        "[%d/%d] %s : %d carte(s), %d supprimée(s)",
                        index,
                        len(games),
                        game_row["chess_com_url"],
                        len(rows),
                        removed,
                    )
                except Exception:  # une partie corrompue ne doit pas tuer le run
                    log.exception(
                        "Échec sur %s, reprise au prochain lancement",
                        game_row["chess_com_url"],
                    )

    log.info("Terminé : %d carte(s) obsolète(s) supprimée(s).", total_removed)
    return 0


if __name__ == "__main__":
    sys.exit(run())
