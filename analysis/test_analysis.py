"""Tests de la classification et de la détection de motifs.

Sans moteur : on fournit directement les évaluations et les variantes.
Lancement : `python analysis/test_analysis.py` (ou `pytest analysis`).
"""
from __future__ import annotations

import random
from datetime import datetime, timezone

import chess

import chesscom
import classify
from classify import Evaluation
from config import _api_url
from cook import _back_rank_mate, _fork, _line_relations, _smothered_mate, cook


def _kinds(board: chess.Board, color: chess.Color) -> set:
    return {kind for _s, _f, _b, kind in _line_relations(board, color)}


def test_winning_chances_is_centred_and_bounded() -> None:
    assert classify.winning_chances(0, None) == 0.0
    assert classify.winning_chances(100, None) > 0
    assert classify.winning_chances(-100, None) < 0
    assert classify.winning_chances(None, 3) == 1.0
    assert classify.winning_chances(None, -3) == -1.0
    assert -1.0 <= classify.winning_chances(100000, None) <= 1.0


def test_thresholds_match_lichess() -> None:
    assert classify.categorize(-0.35) == "blunder"
    assert classify.categorize(-0.30) == "blunder"
    assert classify.categorize(-0.25) == "mistake"
    assert classify.categorize(-0.20) == "mistake"
    assert classify.categorize(-0.15) == "inaccuracy"
    assert classify.categorize(-0.10) == "inaccuracy"
    assert classify.categorize(-0.09) is None
    assert classify.is_accepted(-0.09)
    assert not classify.is_accepted(-0.10)


def test_api_url_normalises_whitespace_and_trailing_slash() -> None:
    assert _api_url("  https://abc.supabase.co/ \n") == "https://abc.supabase.co"
    assert _api_url("https://abc.supabase.co") == "https://abc.supabase.co"


def test_api_url_rejects_a_dashboard_url() -> None:
    # GitHub masque les secrets : sans ce garde-fou, l'erreur se manifeste par
    # un 404 sur une URL illisible.
    for bad in ("https://supabase.com/dashboard/project/abc", "abc.supabase.co", ""):
        try:
            _api_url(bad)
        except SystemExit:
            continue
        raise AssertionError("aurait dû être rejeté : {!r}".format(bad))


def test_smothered_mate() -> None:
    board = chess.Board("6rk/5Npp/8/8/8/8/8/7K b - - 0 1")
    assert board.is_checkmate()
    assert _smothered_mate(board, chess.WHITE)


def test_back_rank_mate() -> None:
    board = chess.Board("R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1")
    assert board.is_checkmate()
    assert _back_rank_mate(board, chess.WHITE)
    assert not _smothered_mate(board, chess.WHITE)


def test_knight_fork_on_king_and_queen() -> None:
    board = chess.Board("4k3/1q6/8/8/2N5/8/8/4K3 w - - 0 1")
    move = chess.Move.from_uci("c4d6")
    board.push(move)
    assert _fork(board, move, chess.WHITE)


def test_capture_that_hangs_is_not_a_fork() -> None:
    # Le cavalier arrive sur une case défendue par un pion : rien à gagner.
    board = chess.Board("4k3/1qp5/8/8/2N5/8/8/4K3 w - - 0 1")
    move = chess.Move.from_uci("c4d6")
    board.push(move)
    assert not _fork(board, move, chess.WHITE)


def test_discovered_attack_when_the_blocker_steps_aside() -> None:
    # Le cavalier a4 quitte la colonne : la tour a1 découvre la dame a8.
    board = chess.Board("q7/8/8/8/N7/8/8/R3K3 w - - 0 1")
    themes = cook(board, [chess.Move.from_uci("a4b6")], Evaluation(cp=700, mate=None))
    assert "discoveredAttack" in themes


def test_discovered_check_is_tagged_on_the_king() -> None:
    board = chess.Board("k7/8/8/8/N7/8/8/R3K3 w - - 0 1")
    themes = cook(board, [chess.Move.from_uci("a4b6")], Evaluation(cp=900, mate=None))
    assert "discoveredCheck" in themes
    assert "discoveredAttack" in themes


def test_pin_and_skewer_are_distinguished() -> None:
    pin = chess.Board("8/3k4/2n5/1B6/8/8/8/4K3 w - - 0 1")
    assert "pin" in _kinds(pin, chess.WHITE)

    skewer = chess.Board("4r3/8/8/4k3/8/8/8/4R1K1 w - - 0 1")
    assert "skewer" in _kinds(skewer, chess.WHITE)


def test_cook_tags_a_hanging_queen() -> None:
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    solution = [chess.Move.from_uci("d1d5")]
    themes = cook(board, solution, Evaluation(cp=900, mate=None))
    assert "hangingPiece" in themes
    assert "crushing" in themes
    assert "oneMove" in themes


def test_cook_tags_a_back_rank_mate_line() -> None:
    board = chess.Board("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1")
    solution = [chess.Move.from_uci("a1a8")]
    themes = cook(board, solution, Evaluation(cp=None, mate=1))
    assert "mate" in themes
    assert "mateIn1" in themes
    assert "backRankMate" in themes


def test_cook_survives_a_whole_game() -> None:
    """Passe tous les détecteurs sur une partie complète.

    Les tests par position ne couvrent qu'un motif à la fois : une erreur de
    type dans un détecteur rarement atteint ne se voit qu'en production. Ici on
    déroule une partie entière, avec une variante tirée au sort à chaque coup,
    pour que chaque détecteur croise des positions variées.
    """
    rng = random.Random(20260902)
    board = chess.Board()
    positions = 0

    while not board.is_game_over() and board.fullmove_number <= 60:
        variation = []
        probe = board.copy()
        for _ in range(6):
            options = list(probe.legal_moves)
            if not options:
                break
            move = rng.choice(options)
            variation.append(move)
            probe.push(move)

        evaluation = (
            Evaluation(cp=None, mate=rng.randint(1, 4))
            if positions % 11 == 0
            else Evaluation(cp=rng.randint(-900, 900), mate=None)
        )
        themes = cook(board, variation, evaluation)
        assert isinstance(themes, list)
        assert all(isinstance(theme, str) for theme in themes)

        positions += 1
        board.push(rng.choice(list(board.legal_moves)))

    assert positions > 40


def test_cook_survives_an_illegal_tail() -> None:
    board = chess.Board()
    solution = [chess.Move.from_uci("e2e4"), chess.Move.from_uci("a1a8")]
    assert cook(board, solution, Evaluation(cp=30, mate=None))


# ----------------------------------------------------------------------
# Import chess.com
# ----------------------------------------------------------------------

_PGN = '\n'.join(
    [
        '[Event "Live Chess"]',
        '[White "ThirdyVoid"]',
        '[Black "Ormaniba"]',
        '[Result "0-1"]',
        '[ECO "B12"]',
        '[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense-2.d4-d5"]',
        "",
        "1. e4 c6 2. d4 d5 0-1",
        "",
    ]
)


def _game(**overrides) -> dict:
    game = {
        "url": "https://www.chess.com/game/live/173775544356",
        "pgn": _PGN,
        "end_time": 1788150663,
        "time_class": "rapid",
        "rules": "chess",
        "white": {"username": "ThirdyVoid", "result": "checkmated"},
        "black": {"username": "Ormaniba", "result": "win"},
        "eco": "https://www.chess.com/openings/Caro-Kann-Defense-2.d4-d5",
    }
    game.update(overrides)
    return game


def test_archives_resume_at_the_month_of_the_last_known_game() -> None:
    archives = [
        "https://api.chess.com/pub/player/x/games/2026/07",
        "https://api.chess.com/pub/player/x/games/2026/08",
        "https://api.chess.com/pub/player/x/games/2026/09",
    ]
    # Le mois de la dernière partie est refait : d'autres parties du même mois
    # peuvent avoir été jouées depuis.
    since = datetime(2026, 8, 31, tzinfo=timezone.utc)
    assert chesscom.archives_to_fetch(archives, since) == archives[1:]
    assert chesscom.archives_to_fetch(archives, None) == archives
    # Le tri est celui des mois, pas celui des chaînes.
    assert chesscom.archives_to_fetch(list(reversed(archives)), None) == archives


def test_game_row_maps_my_colour_and_result() -> None:
    row = chesscom.to_game_row(_game(), "ormaniba")
    assert row["color_played"] == "black"
    assert row["result"] == "win"
    assert row["eco"] == "B12"
    assert row["opening_name"] == "Caro Kann Defense 2.d4 d5"
    assert row["played_at"].startswith("2026-08-31")
    # Le trigger `games_set_user_id` s'en charge : l'envoyer serait une erreur.
    assert "user_id" not in row

    lost = chesscom.to_game_row(
        _game(black={"username": "Ormaniba", "result": "resigned"}), "ormaniba"
    )
    assert lost["result"] == "loss"

    drawn = chesscom.to_game_row(
        _game(black={"username": "Ormaniba", "result": "repetition"}), "ormaniba"
    )
    assert drawn["result"] == "draw"


def test_game_row_rejects_what_it_cannot_map() -> None:
    assert chesscom.to_game_row(_game(), "quelquun-dautre") is None
    assert chesscom.to_game_row(_game(pgn=None), "ormaniba") is None
    assert chesscom.to_game_row(_game(end_time=None), "ormaniba") is None


def test_importable_filters_time_class_and_variants() -> None:
    assert chesscom.importable(_game(), ["rapid"])
    assert not chesscom.importable(_game(time_class="bullet"), ["rapid"])
    assert not chesscom.importable(_game(rules="chess960"), ["rapid"])


if __name__ == "__main__":
    failures = 0
    for name, test in sorted(globals().items()):
        if not name.startswith("test_") or not callable(test):
            continue
        try:
            test()
            print("ok   {}".format(name))
        except AssertionError:
            failures += 1
            print("FAIL {}".format(name))
    raise SystemExit(1 if failures else 0)
