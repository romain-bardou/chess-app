"""Analyse des parties non traitées : détection des erreurs et création des cartes.

Exécuté quotidiennement par GitHub Actions. Pour chaque partie de `games` avec
`analyzed = false`, on rejoue le PGN, on évalue chacun de mes coups avec
Stockfish en MultiPV, on applique la classification Lichess, et on écrit une
carte dans `mistakes` pour chaque coup sanctionné.
"""
from __future__ import annotations

import io
import logging
import sys
import time
from typing import Any, Dict, List, Optional, Sequence

import chess
import chess.pgn

import classify
from classify import Evaluation
from config import Config
from cook import cook
from db import Supabase
from engine import Candidate, Engine

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
log = logging.getLogger("analysis")


def line_to_json(
    board: chess.Board, moves: Sequence[chess.Move], limit: Optional[int] = None
) -> List[Dict[str, str]]:
    """Sérialise une variante en [{san, uci}], depuis `board`."""
    result: List[Dict[str, str]] = []
    walker = board.copy()
    for move in moves:
        if limit is not None and len(result) >= limit:
            break
        if move not in walker.legal_moves:
            break
        result.append({"san": walker.san(move), "uci": move.uci()})
        walker.push(move)
    return result


def accepted_moves_json(
    board: chess.Board, candidates: Sequence[Candidate], best_chances: float
) -> List[Dict[str, Any]]:
    """Tous les coups candidats qui ne franchissent pas le seuil d'imprécision.

    On en garde plusieurs, et pas seulement le premier choix du moteur : à mon
    niveau, sanctionner une continuation correcte parce qu'elle vaut 15
    centipions de moins produirait des puzzles injustes.
    """
    accepted: List[Dict[str, Any]] = []
    for candidate in candidates:
        delta = classify.delta(best_chances, candidate.winning_chances)
        if not classify.is_accepted(delta):
            continue
        accepted.append(
            {
                "san": board.san(candidate.move),
                "uci": candidate.move.uci(),
                "cp": candidate.evaluation.cp,
                "mate": candidate.evaluation.mate,
                "pv": line_to_json(board, candidate.pv, limit=6),
            }
        )
    return accepted


def find_candidate(
    candidates: Sequence[Candidate], move: chess.Move
) -> Optional[Candidate]:
    for candidate in candidates:
        if candidate.move == move:
            return candidate
    return None


def analyse_game(
    engine: Engine,
    database: Supabase,
    config: Config,
    game_row: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Cartes à créer pour une partie. Liste vide si aucune erreur trouvée."""
    parsed = chess.pgn.read_game(io.StringIO(game_row["pgn"]))
    if parsed is None:
        log.warning("PGN illisible pour %s", game_row["chess_com_url"])
        return []

    my_color = chess.WHITE if game_row["color_played"] == "white" else chess.BLACK
    board = parsed.board()
    rows: List[Dict[str, Any]] = []

    for played in parsed.mainline_moves():
        if board.turn != my_color or board.ply() < config.skip_first_plies:
            board.push(played)
            continue

        card = evaluate_position(engine, database, config, board, played, game_row)
        if card is not None:
            rows.append(card)
        board.push(played)

    return rows


def evaluate_position(
    engine: Engine,
    database: Supabase,
    config: Config,
    board: chess.Board,
    played: chess.Move,
    game_row: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    candidates = engine.analyse(board, multipv=config.multipv)
    if not candidates:
        return None

    best = candidates[0]
    if played == best.move:
        return None  # meilleur coup : rien à réviser

    played_candidate = find_candidate(candidates, played) or engine.evaluate_move(
        board, played
    )
    if played_candidate is None:
        return None

    delta = classify.delta(best.winning_chances, played_candidate.winning_chances)
    category = classify.categorize(delta)
    if category is None:
        return None

    fen = board.fen()
    played_san = board.san(played)

    # Exception « coup de répertoire » (comportement chess.com, absent de
    # l'algorithme Lichess) : un coup théorique n'est jamais une erreur.
    if database.is_book_move(fen, played_san):
        return None

    board.push(played)
    try:
        punishment = line_to_json(
            board, played_candidate.pv[1:], limit=config.punishment_plies
        )
    finally:
        board.pop()

    return {
        "user_id": database.owner_id,
        "game_id": game_row["id"],
        "fen": fen,
        "ply_number": board.ply(),
        "move_played": played_san,
        "accepted_moves": accepted_moves_json(board, candidates, best.winning_chances),
        "punishment_pv": punishment,
        "category": category,
        "themes": cook(board, best.pv, best.evaluation),
        "card_type": "mistake",
    }


def run() -> int:
    config = Config.from_env()
    started = time.monotonic()

    with Supabase(config) as database:
        games = database.pending_games(config.max_games_per_run)
        if not games:
            log.info("Aucune partie à analyser.")
            return 0

        log.info("%d partie(s) à analyser.", len(games))
        database.owner_id  # échoue tôt si app_owner n'est pas renseignée

        with Engine(config) as engine:
            for index, game_row in enumerate(games, start=1):
                elapsed = time.monotonic() - started
                try:
                    rows = analyse_game(engine, database, config, game_row)
                    database.insert_mistakes(rows)
                    database.mark_analyzed(game_row["id"])
                    log.info(
                        "[%d/%d] %s : %d erreur(s) (%.0fs cumulées)",
                        index,
                        len(games),
                        game_row["chess_com_url"],
                        len(rows),
                        elapsed,
                    )
                except Exception:  # une partie corrompue ne doit pas tuer le run
                    log.exception(
                        "Échec sur %s, partie laissée non analysée",
                        game_row["chess_com_url"],
                    )

    log.info("Terminé en %.0fs.", time.monotonic() - started)
    return 0


if __name__ == "__main__":
    sys.exit(run())
