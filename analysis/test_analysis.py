"""Tests de la classification et de la détection de motifs.

Sans moteur : on fournit directement les évaluations et les variantes.
Lancement : `python analysis/test_analysis.py` (ou `pytest analysis`).
"""
from __future__ import annotations

import chess

import classify
from classify import Evaluation
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


def test_cook_survives_an_illegal_tail() -> None:
    board = chess.Board()
    solution = [chess.Move.from_uci("e2e4"), chess.Move.from_uci("a1a8")]
    assert cook(board, solution, Evaluation(cp=30, mate=None))


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
