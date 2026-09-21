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
import lichess
import main
from classify import Evaluation
from config import _api_url
from cook import _back_rank_mate, _fork, _line_relations, _smothered_mate, cook
from solution import _is_sound_defence, build_solution


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


def _explorer_response(*moves, draws=0):
    total_white = sum(m[1] for m in moves)
    return {
        "white": total_white,
        "draws": draws,
        "black": 0,
        "moves": [
            {"san": san, "white": n, "draws": 0, "black": 0} for san, n in moves
        ],
    }


def test_top_move_picks_the_most_played() -> None:
    response = _explorer_response(("exd4", 900), ("d6", 100))
    assert lichess.top_move(response)["san"] == "exd4"
    assert lichess.top_move(_explorer_response()) is None


def test_popular_replies_filters_by_share_of_the_total() -> None:
    # Écossaise à 750 elo (aperçu réel) : exd4 domine, mais d6 dépasse aussi
    # le seuil de 5 % — les deux doivent être couverts.
    response = _explorer_response(("exd4", 37), ("d6", 16), ("Nf6", 14), ("f6", 7))
    kept = {m["san"] for m in lichess.popular_replies(response, threshold=0.05)}
    assert kept == {"exd4", "d6", "Nf6", "f6"}
    assert lichess.popular_replies(response, threshold=0.20) == [
        m for m in response["moves"] if m["san"] in ("exd4", "d6")
    ]


def test_usable_replies_requires_a_minimum_sample_size() -> None:
    response = _explorer_response(("a4", 3), ("h4", 2))
    # 5 parties : n'importe quel seuil serait statistiquement creux.
    assert lichess.usable_replies(response, threshold=0.05, min_games=200) == []
    assert lichess.usable_replies(response, threshold=0.05, min_games=5) != []


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
# Solution du puzzle
# ----------------------------------------------------------------------


def _uci(board: chess.Board, sans: list) -> list:
    walker = board.copy()
    moves = []
    for san in sans:
        move = walker.parse_san(san)
        moves.append(move)
        walker.push(move)
    return moves


def test_solution_stops_on_the_move_that_wins_the_piece() -> None:
    # La dame noire est en prise : Rxd5 la gagne, la ligne s'arrête là.
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    found = build_solution(board, _uci(board, ["Rxd5", "Ke7", "Rd1"]))
    assert found is not None
    assert [board.san(move) for move in found.moves[:1]] == ["Rxd5"]
    assert len(found.moves) == 1
    assert found.gain == {"type": "material", "value": 9}


def test_solution_keeps_the_recapture_before_counting() -> None:
    # Le matériel se compte après la réponse adverse, pas juste après la prise.
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    assert build_solution(board, _uci(board, ["Rxd5", "Kf7"])) is not None
    # Ici la tour est reprise : l'échange est nul, il n'y a pas de puzzle.
    even = chess.Board("8/8/3k4/3r4/8/8/8/3RK3 w - - 0 1")
    assert build_solution(even, _uci(even, ["Rxd5+", "Kxd5"])) is None


def test_solution_reports_a_mate() -> None:
    board = chess.Board("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1")
    found = build_solution(board, _uci(board, ["Ra8"]))
    assert found is not None
    assert found.gain == {"type": "mate"}
    assert len(found.moves) == 1


def test_solution_refuses_a_line_without_material_gain() -> None:
    board = chess.Board("4k3/8/8/8/8/8/8/3RK3 w - - 0 1")
    assert build_solution(board, _uci(board, ["Rd4", "Ke7", "Rd5"])) is None


def test_solution_stops_at_the_ply_budget() -> None:
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    assert build_solution(board, _uci(board, ["Rd4", "Ke7"]), max_plies=0) is None


class _FakeCandidate:
    def __init__(self, move, winning_chances, pv=()) -> None:
        self.move = move
        self.winning_chances = winning_chances
        self.pv = list(pv)


class _FakeUnsoundEngine:
    """L'adversaire a toujours un bien meilleur coup que celui testé."""

    def analyse(self, board, multipv=1, deep=False):
        return [_FakeCandidate(chess.Move.null(), 0.9)]

    def evaluate_move(self, board, move):
        return _FakeCandidate(move, -0.9)


class _FakeSoundEngine:
    """Le coup testé est celui que le moteur aurait lui-même choisi."""

    def __init__(self, best_move) -> None:
        self._best_move = best_move

    def analyse(self, board, multipv=1, deep=False):
        return [_FakeCandidate(self._best_move, 0.5)]

    def evaluate_move(self, board, move):
        return _FakeCandidate(move, 0.5)


class _FakeVerifyEngine:
    """Défense correcte ; l'analyse profonde renvoie l'évaluation et la ligne
    fournies, et garde trace de son appel."""

    def __init__(self, defence, final_wc, final_pv) -> None:
        self._defence = defence
        self._final = _FakeCandidate(
            final_pv[0] if final_pv else chess.Move.null(), final_wc, final_pv
        )
        self.deep_calls = 0

    def analyse(self, board, multipv=1, deep=False):
        if deep:
            self.deep_calls += 1
            return [self._final]
        return [_FakeCandidate(self._defence, 0.5)]

    def evaluate_move(self, board, move):
        return _FakeCandidate(move, 0.5)


def test_is_sound_defence_rejects_a_move_with_a_much_better_alternative() -> None:
    board = chess.Board("4k3/8/8/8/8/8/8/3RK3 b - - 0 1")
    move = chess.Move.from_uci("e8e7")
    assert not _is_sound_defence(_FakeUnsoundEngine(), board, move)


def test_is_sound_defence_accepts_the_engines_own_best_move() -> None:
    board = chess.Board("4k3/8/8/8/8/8/8/3RK3 b - - 0 1")
    move = chess.Move.from_uci("e8e7")
    assert _is_sound_defence(_FakeSoundEngine(move), board, move)


def test_solution_drops_a_line_whose_only_confirmed_defence_is_unsound() -> None:
    # Rxd5 gagne la dame, mais le moteur factice affirme qu'une bien
    # meilleure défense existait que Ke7 : sans elle pour confirmer le gain,
    # la ligne ne peut pas être retenue.
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    pv = _uci(board, ["Rxd5", "Ke7"])
    assert build_solution(board, pv, engine=_FakeUnsoundEngine()) is None


def test_solution_keeps_a_line_whose_defence_matches_the_engines_best() -> None:
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    pv = _uci(board, ["Rxd5", "Ke7"])
    found = build_solution(board, pv, engine=_FakeSoundEngine(pv[1]))
    assert found is not None
    assert found.gain == {"type": "material", "value": 9}


def _verified_solution(final_wc, final_sans, start_wc=0.5):
    # Rxd5 Ke7 : la tour a gagné la dame, position de repos au trait des blancs.
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    pv = _uci(board, ["Rxd5", "Ke7"])
    rest = board.copy()
    for move in pv:
        rest.push(move)
    engine = _FakeVerifyEngine(pv[1], final_wc, _uci(rest, final_sans))
    found = build_solution(board, pv, engine=engine, start_wc=start_wc)
    return found, engine


def test_solution_verifies_the_rest_point_with_a_deep_analysis() -> None:
    found, engine = _verified_solution(0.5, ["Rd1", "Kf7"])
    assert found is not None
    assert found.gain == {"type": "material", "value": 9}
    assert engine.deep_calls == 1


def test_solution_drops_a_gain_that_leaves_a_lost_position() -> None:
    # Matériel gagné, mais la position finale est bien pire qu'au départ.
    found, _engine = _verified_solution(-0.4, ["Rd1", "Kf7"])
    assert found is None


def test_solution_ignores_the_reference_eval_when_none_is_given() -> None:
    found, _engine = _verified_solution(-0.4, ["Rd1", "Kf7"], start_wc=None)
    assert found is not None


def test_solution_drops_a_gain_given_back_within_the_lookahead() -> None:
    # Rd6 Kxd6 : la tour est reprise dans les deux coups qui suivent.
    found, _engine = _verified_solution(0.5, ["Rd6", "Kxd6"])
    assert found is None


def test_solution_keeps_a_gain_when_the_lookahead_ends_on_a_solver_move() -> None:
    # Ligne coupée avant la réponse adverse : rien à comparer sur le matériel.
    found, _engine = _verified_solution(0.5, ["Rd1"])
    assert found is not None


def test_solution_refuses_a_terminal_rest_position() -> None:
    board = chess.Board("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1")
    pv = _uci(board, ["Rxd5", "Ke7"])

    class _Terminal(_FakeVerifyEngine):
        def analyse(self, board, multipv=1, deep=False):
            return [] if deep else super().analyse(board, multipv, deep)

    engine = _Terminal(pv[1], 0.5, [])
    assert build_solution(board, pv, engine=engine, start_wc=0.5) is None


def test_previous_move_carries_the_position_before_it() -> None:
    board = chess.Board()
    before = board.fen()
    played = main.move_json(board, board.parse_san("e4"))
    assert played == {"san": "e4", "uci": "e2e4", "fen": before}
    # L'app rejoue ce coup depuis cette FEN : il doit y être légal.
    assert main.move_json(board, chess.Move.from_uci("e2e5")) is None


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
