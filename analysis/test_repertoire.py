"""Tests de la génération du répertoire (repertoire.py) sans réseau ni Stockfish."""
from __future__ import annotations

from types import SimpleNamespace

import chess

import repertoire
from classify import Evaluation
from engine import Candidate


class _FakeEngine:
    """Joue toujours le coup imposé pour une position, sinon le premier coup légal."""

    def __init__(self, best_by_epd=None):
        self.best_by_epd = best_by_epd or {}
        self.calls = 0

    def analyse(self, board, multipv=1, deep=False):
        self.calls += 1
        if board.is_game_over():
            return []
        uci = self.best_by_epd.get(board.epd())
        move = chess.Move.from_uci(uci) if uci else next(iter(board.legal_moves))
        return [Candidate(move, Evaluation(20, None))]


class _FakeExplorer:
    """Réponses adverses fixes par FEN ; le coup blanc « le plus joué » est un piège."""

    def __init__(self, responses):
        self.responses = responses
        self.lookups = []

    def lookup(self, fen):
        self.lookups.append(fen)
        return self.responses.get(fen, {"white": 0, "draws": 0, "black": 0, "moves": []})


def _config(max_plies=2):
    return SimpleNamespace(
        repertoire_max_plies=max_plies,
        repertoire_min_games=10,
        repertoire_popularity_threshold=0.1,
    )


def test_best_engine_move_returns_san() -> None:
    board = chess.Board()
    engine = _FakeEngine({board.epd(): "e2e4"})
    assert repertoire.best_engine_move(engine, board) == "e4"


def test_best_engine_move_is_none_on_a_finished_game() -> None:
    board = chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")  # pat
    assert repertoire.best_engine_move(_FakeEngine(), board) is None


def test_our_move_comes_from_the_engine_not_from_the_most_played() -> None:
    board = chess.Board()
    fen = board.fen()
    engine = _FakeEngine({board.epd(): "d2d4"})  # le moteur préfère d4…
    after = chess.Board()
    after.push_san("d4")
    explorer = _FakeExplorer({
        # …alors que e4 est bien plus joué (ne doit plus compter pour nos coups)
        fen: {"white": 900, "draws": 0, "black": 100,
              "moves": [{"san": "e4", "white": 800, "draws": 0, "black": 50},
                        {"san": "d4", "white": 100, "draws": 0, "black": 50}]},
        after.fen(): {"white": 60, "draws": 0, "black": 40,
                      "moves": [{"san": "d5", "white": 40, "draws": 0, "black": 20},
                                {"san": "Nf6", "white": 20, "draws": 0, "black": 20}]},
    })
    sink = repertoire.MemorySink()

    repertoire.expand_our_move(
        explorer, engine, sink, board, "white", None, 0, _config(max_plies=2), set(), 0.1
    )

    rows = {r["move_san"]: r for r in sink.rows}
    assert rows["d4"]["source"] == "engine"
    assert rows["d4"]["popularity"] is None
    assert "e4" not in rows
    # les coups adverses restent ceux de Lichess, avec leur popularité réelle
    assert rows["d5"]["source"] == "lichess"
    assert rows["d5"]["popularity"] == 0.6
    assert rows["Nf6"]["popularity"] == 0.4
    # l'explorer n'est plus interrogé pour choisir NOTRE coup
    assert fen not in explorer.lookups


def test_transposition_is_expanded_once() -> None:
    board = chess.Board()
    engine = _FakeEngine({board.epd(): "e2e4"})
    visited = {board.fen()}
    sink = repertoire.MemorySink()
    repertoire.expand_our_move(
        _FakeExplorer({}), engine, sink, board, "white", None, 0, _config(), visited, 0.1
    )
    assert sink.rows == [] and engine.calls == 0


def test_stale_nodes_sql_keeps_only_the_new_keys_per_side() -> None:
    rows = [
        {"side": "white", "fen": "f1", "move_san": "e4"},
        {"side": "white", "fen": "f2", "move_san": "O'Brien"},
        {"side": "black", "fen": "f3", "move_san": "c6"},
    ]
    sql = repertoire.stale_nodes_sql(rows)
    assert sql.count("delete from repertoire_nodes") == 2
    assert "where side = 'white'" in sql and "where side = 'black'" in sql
    assert "('f1', 'e4')" in sql and "('f2', 'O''Brien')" in sql
    assert "('f3', 'c6')" in sql.split("where side = 'black'")[1]
    assert "('f3', 'c6')" not in sql.split("where side = 'black'")[0]


def test_entry_ending_on_the_opponents_move_lets_us_choose_first() -> None:
    """Scandinave (1.e4 d5) : après l'entrée c'est à nous, pas à l'adversaire."""
    spec = {"name": "Test", "side": "white", "entry": [("e4", True), ("d5", False)]}
    board = chess.Board()
    board.push_san("e4")
    board.push_san("d5")
    engine = _FakeEngine({board.epd(): "e4d5"})  # 2.exd5
    # Lichess ne doit pas être lu comme une réponse adverse à cette position.
    explorer = _FakeExplorer({board.fen(): {
        "white": 90, "draws": 0, "black": 10,
        "moves": [{"san": "Nc3", "white": 90, "draws": 0, "black": 10}],
    }})
    sink = repertoire.MemorySink()

    repertoire.build(explorer, engine, sink, spec, _config(max_plies=2))

    rows = {r["move_san"]: r for r in sink.rows}
    assert rows["exd5"]["source"] == "engine"
    assert rows["exd5"]["popularity"] is None
    assert rows["exd5"]["parent_node_id"] == rows["d5"]["id"]
    assert "Nc3" not in rows
    assert board.fen() not in explorer.lookups
