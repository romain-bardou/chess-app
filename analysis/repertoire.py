"""Génération du répertoire d'ouvertures (phase 2) dans `repertoire_nodes`.

Script à part, non branché sur le pipeline GitHub Actions : à relancer à la
main quand LICHESS_RATING_BAND doit monter avec l'elo (rejouable, upsert sur
(fen, move_san, side) — voir migrations 006 et 007).

Deux répertoires fixes, choisis par Romain plutôt que dérivés des données :
Écossaise aux Blancs, Caro-Kann aux Noirs. `entry` fige les coups qui
amènent à la position de départ de chaque répertoire ; au-delà, l'arbre est
construit depuis le Lichess Opening Explorer.

Arbre en alternance stricte : CHAQUE demi-coup a sa ligne, y compris ceux de
l'adversaire — c'est ce qu'attend l'écran Ouvertures de l'app
(`app/src/features/repertoire/tree.ts` détermine qui a le trait en lisant le
FEN de chaque ligne, et déroule un coup à la fois). Sur nos coups, un seul
choix (le plus joué) ; sur les coups adverses, une ligne par réponse
au-dessus du seuil de popularité — on doit être prêt à chacune.

Convention `fen` = position AVANT le coup de la ligne (voir 001_init.sql et
le commentaire d'`is_book_move` dans db.py) : la ligne d'un coup adverse
porte donc le FEN d'après notre propre coup.
"""
from __future__ import annotations

import logging
import sys
import uuid
from typing import Any, Dict, List, Optional, Tuple

import chess

import lichess
from config import Config
from db import Supabase
from lichess import LichessExplorer

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger("repertoire")

# (coup en SAN, coup joué par nous ?) — dans l'ordre depuis la position initiale.
REPERTOIRE = [
    {
        "name": "Écossaise",
        "side": "white",
        "entry": [
            ("e4", True),
            ("e5", False),
            ("Nf3", True),
            ("Nc6", False),
            ("d4", True),
        ],
        # Seuil global (15%) abaissé à 10% pour cette ouverture : fait entrer
        # plus de branches secondaires (à partir du coup 6, après la tabiya
        # fixe). N'ajoute PAS 1...d5 (Scandinave) : ce coup n'est pas soumis
        # au seuil, il est exclu par construction (voir `entry` plus haut,
        # qui fige 1...e5 sans interroger Lichess — l'Écossaise répond à
        # 1...e5, pas à 1...d5, qui demanderait un répertoire séparé).
        "popularity_threshold": 0.10,
    },
    {
        "name": "Caro-Kann",
        "side": "black",
        "entry": [
            ("e4", False),
            ("c6", True),
        ],
    },
]


class MemorySink:
    """Remplace `Supabase` : accumule les lignes en mémoire au lieu d'un
    aller-retour HTTP par ligne (pas besoin de SUPABASE_SERVICE_ROLE_KEY
    pour cette génération ponctuelle — voir `rows_to_sql`).

    Dédoublonne par id déterministe : une transposition peut faire visiter
    la même (fen, move_san) par deux chemins différents, et une même ligne
    ne doit apparaître qu'une fois dans le script SQL final.
    """

    def __init__(self) -> None:
        self._rows: Dict[str, Dict[str, Any]] = {}

    def upsert_repertoire_node(self, row: Dict[str, Any]) -> str:
        # L'entrée fixe des deux répertoires part de la même position initiale
        # (1.e4) : sans le camp dans la clé, le premier coup de l'un et le
        # coup adverse assumé de l'autre calculeraient le même id et
        # s'écraseraient l'un l'autre. Sans risque de collision au-delà (les
        # arbres divergent dès le 2e ou 3e demi-coup), donc on ne qualifie
        # que les lignes d'entrée pour ne pas changer l'id des ~500 lignes
        # déjà issues de Lichess.
        side = row["side"] if row["source"] == "lichess-entry" else None
        node_id = deterministic_id(row["fen"], row["move_san"], side)
        if node_id not in self._rows:
            self._rows[node_id] = {**row, "id": node_id}
        return node_id

    @property
    def rows(self) -> List[Dict[str, Any]]:
        return list(self._rows.values())


def deterministic_id(fen: str, move_san: str, side: Optional[str] = None) -> str:
    """Id stable pour une (fen, move_san) donnée (+ camp pour les lignes
    d'entrée, voir `MemorySink.upsert_repertoire_node`).

    Les enfants d'un noeud référencent son id avant même que la ligne SQL
    correspondante ait été exécutée, donc l'id ne peut pas venir de
    `gen_random_uuid()`. Le dériver de (fen, move_san) plutôt que de tirer un
    uuid4 au hasard garde aussi l'id stable d'un run à l'autre : un futur
    upsert par ON CONFLICT référencera le même id, pas un nouveau.
    """
    key = f"repertoire_nodes:{fen}|{move_san}"
    if side is not None:
        key = f"{key}:{side}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def insert_opponent_replies(
    explorer: LichessExplorer,
    database: Any,
    board: chess.Board,
    parent_id: Optional[str],
    side: str,
    our_move_count: int,
    config: Config,
    threshold: float,
) -> List[Tuple[chess.Board, str]]:
    """Une ligne par réponse adverse retenue (popularité réelle), à `board`
    (trait adverse). Renvoie (position après cette réponse, id de sa ligne).
    """
    if our_move_count >= config.repertoire_max_plies:
        return []
    fen = board.fen()
    response = explorer.lookup(fen)
    replies = lichess.usable_replies(
        response, threshold, config.repertoire_min_games
    )
    total = lichess.total_games(response)
    children = []
    for reply in replies:
        node_id = database.upsert_repertoire_node(
            {
                "fen": fen,
                "move_san": reply["san"],
                "side": side,
                "parent_node_id": parent_id,
                "source": "lichess",
                "popularity": round(lichess.move_share(reply) / total, 4),
                "is_book_end": False,
            }
        )
        child_board = board.copy()
        child_board.push_san(reply["san"])
        children.append((child_board, node_id))
    return children


def expand_our_move(
    explorer: LichessExplorer,
    database: Any,
    board: chess.Board,
    side: str,
    parent_id: Optional[str],
    our_move_count: int,
    config: Config,
    visited: set,
    threshold: float,
) -> None:
    """Insère notre coup à `board` (notre trait), puis les réponses adverses
    en dessous, une ligne chacune.

    `visited` retient les positions où l'on a déjà choisi notre coup : les
    transpositions sont fréquentes, et sans ce garde-fou chacune
    reconstruirait tout son sous-arbre en double.
    """
    fen_before = board.fen()
    if fen_before in visited:
        return
    visited.add(fen_before)

    response = explorer.lookup(fen_before)
    move = lichess.top_move(response)
    if move is None:
        return

    our_node_id = database.upsert_repertoire_node(
        {
            "fen": fen_before,
            "move_san": move["san"],
            "side": side,
            "parent_node_id": parent_id,
            "source": "lichess",
            "popularity": None,
            "is_book_end": False,
        }
    )
    log.info("%-6s %s", side, move["san"])

    board_after = board.copy()
    board_after.push_san(move["san"])
    new_count = our_move_count + 1

    opponent_children = insert_opponent_replies(
        explorer, database, board_after, our_node_id, side, new_count, config, threshold
    )
    for child_board, opp_node_id in opponent_children:
        expand_our_move(
            explorer, database, child_board, side, opp_node_id, new_count, config, visited, threshold
        )


def seed_entry(database: Any, spec: Dict[str, Any]) -> Tuple[chess.Board, Optional[str]]:
    """Rejoue les coups fixes de `entry`, une ligne chacun (y compris les
    coups adverses assumés : `e5`/`Nc6` pour l'Écossaise, `e4` pour le
    Caro-Kann — l'écran a besoin de chaque demi-coup pour dérouler la
    position, pas seulement des nôtres). Popularité à 1.0 pour un coup
    adverse assumé : ce n'est pas une statistique Lichess, c'est le
    périmètre choisi (si l'adversaire ne joue pas ce coup, on sort du
    répertoire préparé).
    """
    board = chess.Board()
    parent_id: Optional[str] = None
    for san, is_ours in spec["entry"]:
        fen_before = board.fen()
        board.push_san(san)
        parent_id = database.upsert_repertoire_node(
            {
                "fen": fen_before,
                "move_san": san,
                "side": spec["side"],
                "parent_node_id": parent_id,
                "source": "lichess-entry",
                "popularity": None if is_ours else 1.0,
                "is_book_end": False,
            }
        )
    return board, parent_id


def build(
    explorer: LichessExplorer, database: Any, spec: Dict[str, Any], config: Config
) -> None:
    log.info("=== %s (%s) ===", spec["name"], spec["side"])
    threshold = spec.get("popularity_threshold", config.repertoire_popularity_threshold)
    board, parent_id = seed_entry(database, spec)
    our_move_count = sum(1 for _, is_ours in spec["entry"] if is_ours)
    visited: set = set()

    opponent_children = insert_opponent_replies(
        explorer, database, board, parent_id, spec["side"], our_move_count, config, threshold
    )
    for child_board, opp_node_id in opponent_children:
        expand_our_move(
            explorer,
            database,
            child_board,
            spec["side"],
            opp_node_id,
            our_move_count,
            config,
            visited,
            threshold,
        )


def finalize_book_ends(rows: List[Dict[str, Any]]) -> None:
    """`is_book_end` = True pour toute ligne sans enfant (calculé après coup :
    plus simple et toujours exact, plutôt que de deviner pendant la
    récursion si une ligne aura une suite).
    """
    parents_with_children = {row["parent_node_id"] for row in rows if row["parent_node_id"]}
    for row in rows:
        row["is_book_end"] = row["id"] not in parents_with_children


def _sql_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def rows_to_sql(rows: List[Dict[str, Any]]) -> str:
    """Un seul INSERT multi-lignes, upsert sur (fen, move_san, side) — voir 007."""
    columns = (
        "id",
        "fen",
        "move_san",
        "side",
        "parent_node_id",
        "source",
        "popularity",
        "is_book_end",
    )
    values = ",\n  ".join(
        "(" + ", ".join(_sql_literal(row[col]) for col in columns) + ")" for row in rows
    )
    updates = ", ".join(f"{col} = excluded.{col}" for col in columns if col != "id")
    return (
        f"insert into repertoire_nodes ({', '.join(columns)})\nvalues\n  {values}\n"
        f"on conflict (fen, move_san, side) do update set {updates};\n"
    )


def print_tree(rows: List[Dict[str, Any]]) -> None:
    by_parent: Dict[Optional[str], List[Dict[str, Any]]] = {}
    for row in rows:
        by_parent.setdefault(row["parent_node_id"], []).append(row)

    def walk(parent_id: Optional[str], depth: int) -> None:
        for row in by_parent.get(parent_id, []):
            pct = "" if row["popularity"] is None else f" ({row['popularity'] * 100:.0f}%)"
            end = " ■ fin de théorie" if row["is_book_end"] else ""
            print("  " * depth + f"{row['move_san']}{pct}{end}")
            walk(row["id"], depth + 1)

    walk(None, 0)
    print(f"— {len(rows)} ligne(s) au total.")


def run() -> int:
    config = Config.from_env()
    if not config.lichess_api_token:
        raise SystemExit(
            "LICHESS_API_TOKEN est requis (jeton personnel Lichess, aucun "
            "scope : https://lichess.org/account/oauth/token)."
        )

    dry_run = "--dry-run" in sys.argv
    sql_out = None
    if "--sql-out" in sys.argv:
        sql_out = sys.argv[sys.argv.index("--sql-out") + 1]
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    specs = [s for s in REPERTOIRE if only is None or s["name"] == only]
    if only and not specs:
        raise SystemExit(f"--only {only!r} ne correspond à aucun répertoire connu.")

    with LichessExplorer(
        config.lichess_api_token, config.lichess_speeds, config.lichess_rating_band
    ) as explorer:
        if dry_run or sql_out:
            sink = MemorySink()
            for spec in specs:
                build(explorer, sink, spec, config)
            finalize_book_ends(sink.rows)

            if dry_run:
                print_tree(sink.rows)
                return 0

            with open(sql_out, "w", encoding="utf-8") as handle:
                handle.write(rows_to_sql(sink.rows))
            log.info("%d ligne(s) écrite(s) dans %s.", len(sink.rows), sql_out)
            return 0

        with Supabase(config) as database:
            database.owner_id  # échoue tôt si app_owner n'est pas renseignée
            for spec in specs:
                build(explorer, database, spec, config)

    return 0


if __name__ == "__main__":
    sys.exit(run())
