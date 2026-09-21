"""Tests des parties pures de repertoire_report.py (sans Stockfish ni réseau)."""
from __future__ import annotations

from types import SimpleNamespace

import chess

import repertoire_report as report
from classify import Evaluation
from engine import Candidate

START = chess.Board().fen()
AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def _node(node_id, fen, san, side="white", parent=None, popularity=None):
    return {
        "id": node_id, "fen": fen, "move_san": san, "side": side,
        "parent_node_id": parent, "popularity": popularity,
    }


def _tree():
    board = chess.Board()
    e4 = _node("a", board.fen(), "e4")
    board.push_san("e4")
    e5 = _node("b", board.fen(), "e5", parent="a", popularity=0.6)
    board.push_san("e5")
    nf3 = _node("c", board.fen(), "Nf3", parent="b")
    return {n["id"]: n for n in (e4, e5, nf3)}


def test_is_our_move_follows_the_side_to_move_in_the_fen() -> None:
    tree = _tree()
    assert report.is_our_move(tree["a"]) is True
    assert report.is_our_move(tree["b"]) is False
    assert report.is_our_move(tree["c"]) is True


def test_black_repertoire_owns_the_black_to_move_lines() -> None:
    assert report.is_our_move(_node("x", AFTER_E4, "c6", side="black")) is True
    assert report.is_our_move(_node("y", START, "e4", side="black")) is False


def test_reach_multiplies_the_opponents_popularity_only() -> None:
    tree = _tree()
    assert report.reach_probability(tree["a"], tree) == 1.0
    assert report.reach_probability(tree["c"], tree) == 0.6


def test_line_is_numbered_from_the_initial_position() -> None:
    tree = _tree()
    assert report.format_line(report.path_san(tree["c"], tree)) == "1.e4 e5"
    assert report.path_san(tree["a"], tree) == []


def test_practical_score_counts_a_draw_as_half_a_point() -> None:
    response = {"moves": [{"san": "Nf3", "white": 60, "draws": 20, "black": 20}]}
    assert report.practical_score(response, "Nf3", "white", 50) == (0.7, 100)
    assert report.practical_score(response, "Nf3", "black", 50) == (0.3, 100)


def test_practical_score_needs_a_sample_and_a_known_move() -> None:
    response = {"moves": [{"san": "Nf3", "white": 6, "draws": 2, "black": 2}]}
    assert report.practical_score(response, "Nf3", "white", 50) is None
    assert report.practical_score(response, "d4", "white", 1) is None


def test_category_thresholds() -> None:
    assert report.category(0.0) == "ok"
    assert report.category(0.04) == "leger"
    assert report.category(0.08) == "notable"
    assert report.category(0.4) == "a-revoir"


def test_suggestion_prefers_the_best_practical_score_among_near_best() -> None:
    candidates = [("Be3", 0.0, 0.50), ("Nb3", 0.02, 0.58), ("f4", 0.20, 0.90)]
    assert report.pick_suggestion(candidates, 0.03) == "Nb3"


def test_suggestion_falls_back_to_the_engine_move_without_scores() -> None:
    candidates = [("Be3", 0.0, None), ("Nb3", 0.02, None)]
    assert report.pick_suggestion(candidates, 0.03) == "Be3"


class _FakeEngine:
    """Deux candidats : 1.e4 (+0.30) et 1.a3 (-0.50) ; Nf3 hors MultiPV."""

    def analyse(self, board, multipv=1, deep=False):
        return [
            Candidate(chess.Move.from_uci("e2e4"), Evaluation(30, None)),
            Candidate(chess.Move.from_uci("a2a3"), Evaluation(-50, None)),
        ]

    def evaluate_move(self, board, move):
        return Candidate(move, Evaluation(10, None))


def test_analyse_node_measures_the_loss_against_the_engines_best() -> None:
    args = SimpleNamespace(multipv=2, tolerance=0.03)
    node = _node("z", START, "a3")
    result = report.analyse_node(_FakeEngine(), None, node, args, 100)
    assert result["best"] == "e4"
    assert result["played"] == "a3"
    assert result["loss"] > 0.1
    assert result["category"] == "a-revoir"
    assert result["suggestion"] == "e4"


def test_analyse_node_uses_the_extra_evaluation_for_a_move_outside_the_multipv() -> None:
    args = SimpleNamespace(multipv=2, tolerance=0.03)
    node = _node("z", START, "Nf3")
    result = report.analyse_node(_FakeEngine(), None, node, args, 100)
    assert result["played_eval"] == "+0.10"
    assert result["best_eval"] == "+0.30"
    assert result["category"] == "leger" or result["category"] == "ok"
