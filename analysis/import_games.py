"""Import des parties chess.com dans `games`.

Exécuté avant l'analyse par le workflow `pipeline.yml`. Remplace le scénario
Make de la V1 : tout le pipeline vit désormais dans le dépôt, donc plus rien à
déclencher à la main.

L'import est incrémental et idempotent : on repart du mois de la partie la
plus récente déjà en base, et les doublons sont ignorés sur `chess_com_url`.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import chesscom
from chesscom import ChessCom
from config import Config
from db import Supabase

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger("import")


def _parse_timestamp(raw: Optional[str]) -> Optional[datetime]:
    """PostgREST renvoie du ISO 8601 ; `Z` n'est accepté qu'à partir de 3.11."""
    if not raw:
        return None
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def run() -> int:
    config = Config.from_env()
    if not config.chess_com_username:
        raise SystemExit(
            "CHESS_COM_USERNAME est requis pour l'import (défini dans "
            ".github/workflows/pipeline.yml)."
        )

    with Supabase(config) as database:
        database.owner_id  # échoue tôt si app_owner n'est pas renseignée
        since = _parse_timestamp(database.latest_played_at())
        log.info(
            "Reprise depuis %s",
            since.date() if since else "le premier mois disponible",
        )

        with ChessCom(config.chess_com_username) as api:
            archives = chesscom.archives_to_fetch(api.archives(), since)
            log.info("%d archive(s) mensuelle(s) à parcourir.", len(archives))

            inserted = 0
            for archive_url in archives:
                rows: List[Dict[str, Any]] = []
                for game in api.games(archive_url):
                    if not chesscom.importable(game, config.import_time_classes):
                        continue
                    row = chesscom.to_game_row(game, config.chess_com_username)
                    if row is not None:
                        rows.append(row)

                created = database.insert_games(rows)
                inserted += created
                log.info(
                    "%s : %d partie(s) retenue(s), %d nouvelle(s).",
                    archive_url.rsplit("/games/", 1)[-1],
                    len(rows),
                    created,
                )

    log.info("%d partie(s) importée(s).", inserted)
    return 0


if __name__ == "__main__":
    sys.exit(run())
