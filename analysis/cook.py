"""Détection des motifs tactiques.

Logique adaptée de `lichess-org/lichess-puzzler` (même stack : Python +
python-chess). On analyse la ligne principale du moteur — celle que j'aurais
dû jouer — et on en déduit les motifs présents.

Les clés sont volontairement identiques à celles de Lichess (`fork`, `pin`,
`backRankMate`, ...) pour rester comparable à leurs statistiques ; la
traduction en français se fait côté app.
"""
from __future__ import annotations

from typing import Iterable, List, Optional, Sequence, Set, Tuple

import chess

from classify import Evaluation

VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 99,
}

DIAGONAL = ((1, 1), (1, -1), (-1, 1), (-1, -1))
ORTHOGONAL = ((1, 0), (-1, 0), (0, 1), (0, -1))


# ----------------------------------------------------------------------
# Utilitaires
# ----------------------------------------------------------------------
def _value(piece: Optional[chess.Piece]) -> int:
    return VALUES[piece.piece_type] if piece else 0


def _ray_directions(piece_type: int) -> Tuple[Tuple[int, int], ...]:
    if piece_type == chess.BISHOP:
        return DIAGONAL
    if piece_type == chess.ROOK:
        return ORTHOGONAL
    if piece_type == chess.QUEEN:
        return DIAGONAL + ORTHOGONAL
    return ()


def _walk(square: int, df: int, dr: int) -> Iterable[int]:
    file_, rank = chess.square_file(square), chess.square_rank(square)
    while True:
        file_ += df
        rank += dr
        if not (0 <= file_ < 8 and 0 <= rank < 8):
            return
        yield chess.square(file_, rank)


def _material(board: chess.Board, color: chess.Color) -> int:
    return sum(
        VALUES[piece.piece_type]
        for piece in board.piece_map().values()
        if piece.color == color and piece.piece_type != chess.KING
    )


def _balance(board: chess.Board, color: chess.Color) -> int:
    return _material(board, color) - _material(board, not color)


def _cheapest_attacker(board: chess.Board, color: chess.Color, square: int) -> int:
    """Valeur du plus petit attaquant de `square` appartenant à `color`."""
    attackers = board.attackers(color, square)
    if not attackers:
        return 0
    return min(_value(board.piece_at(sq)) for sq in attackers)


# ----------------------------------------------------------------------
# Relations sur les lignes : clouage, enfilade, rayon X
# ----------------------------------------------------------------------
Relation = Tuple[int, int, int, str]


def _line_relations(board: chess.Board, color: chess.Color) -> Set[Relation]:
    """Paires (pièce devant, pièce derrière) alignées derrière une pièce à
    longue portée de `color`."""
    relations: Set[Relation] = set()
    for square, piece in board.piece_map().items():
        if piece.color != color:
            continue
        for df, dr in _ray_directions(piece.piece_type):
            blockers: List[Tuple[int, chess.Piece]] = []
            for target in _walk(square, df, dr):
                found = board.piece_at(target)
                if found:
                    blockers.append((target, found))
                    if len(blockers) == 2:
                        break
            if len(blockers) < 2:
                continue
            (first_sq, first), (second_sq, second) = blockers
            if first.color == color:
                # Pièce amie devant : la ligne traverse vers une cible adverse.
                if second.color != color and _value(second) >= 5:
                    relations.add((square, first_sq, second_sq, "xRayAttack"))
                continue
            if second.color == color:
                continue
            front, back = _value(first), _value(second)
            if back > front and back >= 5:
                relations.add((square, first_sq, second_sq, "pin"))
            elif front > back and front >= 5:
                relations.add((square, first_sq, second_sq, "skewer"))
    return relations


# ----------------------------------------------------------------------
# Motifs liés à un coup individuel
# ----------------------------------------------------------------------
def _fork(after: chess.Board, move: chess.Move, solver: chess.Color) -> bool:
    piece = after.piece_at(move.to_square)
    if piece is None or piece.piece_type == chess.KING:
        return False
    opponent = not solver

    targets = 0
    for square in after.attacks(move.to_square):
        found = after.piece_at(square)
        if not found or found.color != opponent:
            continue
        if found.piece_type == chess.KING:
            targets += 1
        elif _value(found) > _value(piece) or not after.attackers(opponent, square):
            targets += 1
    if targets < 2:
        return False

    # Une fourchette dont l'auteur se fait reprendre gratuitement n'en est pas une.
    if after.attackers(opponent, move.to_square):
        cheapest = _cheapest_attacker(after, opponent, move.to_square)
        defended = bool(after.attackers(solver, move.to_square))
        if not defended or cheapest < _value(piece):
            return False
    return True


def _discovered(
    before: chess.Board, after: chess.Board, move: chess.Move, solver: chess.Color
) -> Set[str]:
    """Attaques ouvertes par le départ de la pièce jouée."""
    themes: Set[str] = set()
    opponent = not solver
    for square, piece in after.piece_map().items():
        if piece.color != solver or square == move.to_square:
            continue
        if piece.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
            continue
        if before.piece_at(square) is None:
            continue  # la pièce a bougé : ce n'est pas une découverte
        for target in after.attacks(square):
            found = after.piece_at(target)
            if not found or found.color != opponent:
                continue
            if target in before.attacks(square):
                continue  # l'attaque existait déjà
            # `chess.between` renvoie un masque de bits, pas un SquareSet :
            # l'appartenance se teste par intersection.
            if not chess.between(square, target) & chess.BB_SQUARES[move.from_square]:
                continue
            if found.piece_type == chess.KING:
                themes.update({"discoveredAttack", "discoveredCheck"})
            elif _value(found) >= 3:
                themes.add("discoveredAttack")
    return themes


def _trapped_piece(after: chess.Board, solver: chess.Color) -> bool:
    """Pièce adverse attaquée qui n'a aucune case de fuite sûre.

    Ignoré quand le coup donne échec : les coups légaux adverses sont alors
    restreints pour une raison sans rapport avec le piégeage.
    """
    if after.is_check():
        return False
    opponent = not solver
    for square, piece in after.piece_map().items():
        if piece.color != opponent:
            continue
        if piece.piece_type not in (
            chess.KNIGHT,
            chess.BISHOP,
            chess.ROOK,
            chess.QUEEN,
        ):
            continue
        cheapest = _cheapest_attacker(after, solver, square)
        if cheapest == 0 or _value(piece) <= cheapest:
            continue
        has_escape = False
        for candidate in after.legal_moves:
            if candidate.from_square != square:
                continue
            after.push(candidate)
            safe = not after.attackers(solver, candidate.to_square)
            after.pop()
            if safe:
                has_escape = True
                break
        if not has_escape:
            return True
    return False


def _exposed_king(after: chess.Board, solver: chess.Color) -> bool:
    """Roi adverse sans aucun pion d'abri devant lui."""
    opponent = not solver
    king = after.king(opponent)
    if king is None:
        return False
    forward = 1 if opponent == chess.WHITE else -1
    king_file, king_rank = chess.square_file(king), chess.square_rank(king)
    for df in (-1, 0, 1):
        file_ = king_file + df
        if not 0 <= file_ < 8:
            continue
        for step in (1, 2):
            rank = king_rank + forward * step
            if not 0 <= rank < 8:
                continue
            piece = after.piece_at(chess.square(file_, rank))
            if piece and piece.color == opponent and piece.piece_type == chess.PAWN:
                return False
    return True


# ----------------------------------------------------------------------
# Motifs de mat
# ----------------------------------------------------------------------
def _back_rank_mate(final: chess.Board, solver: chess.Color) -> bool:
    opponent = not solver
    king = final.king(opponent)
    if king is None:
        return False
    back_rank = 0 if opponent == chess.WHITE else 7
    if chess.square_rank(king) != back_rank:
        return False
    forward = 1 if opponent == chess.WHITE else -1
    king_file = chess.square_file(king)
    escapes, blocked = 0, 0
    for df in (-1, 0, 1):
        file_ = king_file + df
        if not 0 <= file_ < 8:
            continue
        escapes += 1
        piece = final.piece_at(chess.square(file_, back_rank + forward))
        if piece and piece.color == opponent:
            blocked += 1
    return escapes > 0 and blocked == escapes


def _smothered_mate(final: chess.Board, solver: chess.Color) -> bool:
    opponent = not solver
    king = final.king(opponent)
    checkers = list(final.checkers())
    if king is None or len(checkers) != 1:
        return False
    checker = final.piece_at(checkers[0])
    if checker is None or checker.piece_type != chess.KNIGHT:
        return False
    for square in final.attacks(king):
        piece = final.piece_at(square)
        if piece is None or piece.color != opponent:
            return False
    return True


# ----------------------------------------------------------------------
# Phase de partie
# ----------------------------------------------------------------------
def _phase_themes(board: chess.Board) -> Set[str]:
    pieces = [
        piece
        for piece in board.piece_map().values()
        if piece.piece_type not in (chess.KING, chess.PAWN)
    ]
    if len(pieces) <= 4:
        themes = {"endgame"}
        types = {piece.piece_type for piece in pieces}
        if not types:
            themes.add("pawnEndgame")
        elif types == {chess.ROOK}:
            themes.add("rookEndgame")
        elif types == {chess.BISHOP}:
            themes.add("bishopEndgame")
        elif types == {chess.KNIGHT}:
            themes.add("knightEndgame")
        elif chess.QUEEN in types:
            themes.add("queenEndgame")
        return themes
    if board.fullmove_number <= 10:
        return {"opening"}
    return {"middlegame"}


# ----------------------------------------------------------------------
# Point d'entrée
# ----------------------------------------------------------------------
def cook(
    board: chess.Board,
    solution: Sequence[chess.Move],
    evaluation: Evaluation,
) -> List[str]:
    """Motifs tactiques de la position, déduits de la ligne correcte.

    `board` est la position avant mon coup, `solution` la variante principale
    du moteur qui commence par le coup que j'aurais dû jouer.
    """
    if not solution:
        return []

    solver = board.turn
    themes: Set[str] = set(_phase_themes(board))

    # Déroulé de la ligne, en gardant chaque paire (avant, après).
    steps: List[Tuple[chess.Board, chess.Move, chess.Board]] = []
    walker = board.copy()
    for move in solution:
        if move not in walker.legal_moves:
            break
        before = walker.copy()
        walker.push(move)
        steps.append((before, move, walker.copy()))
    if not steps:
        return []
    final = walker

    start_balance = _balance(board, solver)
    worst_balance = start_balance

    for index, (before, move, after) in enumerate(steps):
        if index % 2 == 1:  # coup adverse
            worst_balance = min(worst_balance, _balance(after, solver))
            continue

        if _fork(after, move, solver):
            themes.add("fork")
        themes.update(_discovered(before, after, move, solver))
        if len(after.checkers()) >= 2:
            themes.add("doubleCheck")
        if _trapped_piece(after, solver):
            themes.add("trappedPiece")

        new_relations = _line_relations(after, solver) - _line_relations(before, solver)
        for _slider, _front, _back, kind in new_relations:
            themes.add(kind)

        if move.promotion:
            themes.add("promotion")
            if move.promotion != chess.QUEEN:
                themes.add("underPromotion")

        moved = before.piece_at(move.from_square)
        if moved and moved.piece_type == chess.PAWN:
            rank = chess.square_rank(move.to_square)
            relative = rank if solver == chess.WHITE else 7 - rank
            if relative >= 5:
                themes.add("advancedPawn")

        captured = before.piece_at(move.to_square)
        if captured and not before.attackers(not solver, move.to_square):
            if _value(captured) >= 3:
                themes.add("hangingPiece")
        if captured:
            themes.update(_capturing_defender(before, move, solver, steps, index))

        # Motifs jugés sur le coup à trouver uniquement.
        if index == 0:
            if not captured and not after.is_check() and not move.promotion:
                themes.add("quietMove")
            if _exposed_king(after, solver) and "endgame" not in themes:
                themes.add("exposedKing")
            if _attraction(before, move, solver, steps):
                themes.add("attraction")

        worst_balance = min(worst_balance, _balance(after, solver))

    themes.update(_mate_themes(final, solver, evaluation))

    if worst_balance <= start_balance - 2 and _is_winning(evaluation):
        themes.add("sacrifice")

    themes.update(_outcome_themes(evaluation))
    themes.update(_flank_themes(final, solver, themes))

    first_before, first_move, first_after = steps[0]
    if (
        "mate" not in themes
        and first_before.piece_at(first_move.to_square) is None
        and not first_after.is_check()
        and evaluation.mate is None
        and evaluation.cp is not None
        and abs(evaluation.cp) < 200
    ):
        themes.add("defensiveMove")

    solver_moves = (len(steps) + 1) // 2
    if solver_moves <= 1:
        themes.add("oneMove")
    elif solver_moves <= 2:
        themes.add("short")
    else:
        themes.add("long")
    return sorted(themes)


def _capturing_defender(
    before: chess.Board,
    move: chess.Move,
    solver: chess.Color,
    steps: Sequence[Tuple[chess.Board, chess.Move, chess.Board]],
    index: int,
) -> Set[str]:
    """La pièce capturée défendait-elle une cible que l'on prend ensuite ?"""
    defended = set()
    for square in before.attacks(move.to_square):
        piece = before.piece_at(square)
        if piece is not None and piece.color != solver and _value(piece) >= 3:
            defended.add(square)
    if not defended:
        return set()
    next_solver_index = index + 2
    if next_solver_index < len(steps):
        follow_up = steps[next_solver_index][1]
        if follow_up.to_square in defended:
            return {"capturingDefender"}
    return set()


def _attraction(
    before: chess.Board,
    move: chess.Move,
    solver: chess.Color,
    steps: Sequence[Tuple[chess.Board, chess.Move, chess.Board]],
) -> bool:
    """Sacrifice qui force le roi adverse à venir sur une case fatale."""
    if len(steps) < 2:
        return False
    reply = steps[1][1]
    replying_piece = steps[1][0].piece_at(reply.from_square)
    if replying_piece is None or replying_piece.piece_type != chess.KING:
        return False
    if reply.to_square != move.to_square:
        return False
    return _value(before.piece_at(move.from_square)) > _value(
        before.piece_at(move.to_square)
    )


def _mate_themes(
    final: chess.Board, solver: chess.Color, evaluation: Evaluation
) -> Set[str]:
    themes: Set[str] = set()
    if evaluation.mate is not None and evaluation.mate > 0:
        themes.add("mate")
        if evaluation.mate <= 5:
            themes.add("mateIn{}".format(evaluation.mate))
    if final.is_checkmate() and final.turn != solver:
        themes.add("mate")
        if _back_rank_mate(final, solver):
            themes.add("backRankMate")
        if _smothered_mate(final, solver):
            themes.add("smotheredMate")
    return themes


def _is_winning(evaluation: Evaluation) -> bool:
    if evaluation.mate is not None:
        return evaluation.mate > 0
    return evaluation.cp is not None and evaluation.cp >= 200


def _outcome_themes(evaluation: Evaluation) -> Set[str]:
    if evaluation.mate is not None:
        return {"crushing"} if evaluation.mate > 0 else set()
    if evaluation.cp is None:
        return set()
    if evaluation.cp >= 500:
        return {"crushing"}
    if evaluation.cp >= 200:
        return {"advantage"}
    if evaluation.cp >= -200:
        return {"equality"}
    return set()


def _flank_themes(
    final: chess.Board, solver: chess.Color, themes: Set[str]
) -> Set[str]:
    if "endgame" in themes:
        return set()
    if not themes & {"mate", "exposedKing", "doubleCheck"}:
        return set()
    king = final.king(not solver)
    if king is None:
        return set()
    return {"kingsideAttack" if chess.square_file(king) >= 4 else "queensideAttack"}
