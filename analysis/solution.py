"""Solution d'un puzzle : la variante correcte, coupée quand le gain est acquis.

Une carte n'a d'intérêt que si le bon coup rapporte quelque chose de vérifiable
sur l'échiquier. Un « meilleur coup » qui améliore la position d'un demi-pion
ne se contrôle pas : le joueur ne saurait pas dire s'il a réussi. On ne garde
donc une erreur que si la variante du moteur aboutit à un mat ou à un gain de
matériel, et on coupe cette variante au premier point de repos où le gain est
encaissé et conservé jusqu'à la fin de la ligne analysée.

Le « point de repos » est toujours situé après une réponse adverse : compter le
matériel juste après une prise du solveur donnerait un gain fantôme, effacé par
la reprise au demi-coup suivant. La ligne renvoyée, elle, se termine sur un coup
du solveur — c'est lui qui encaisse.

La PV du moteur n'est vérifiée que sur son premier coup ; au-delà, rien ne dit
que les réponses adverses sont elles-mêmes de bonne qualité. En position déjà
perdue, plusieurs coups se valent à quelques centipions près, et le moteur peut
en choisir un qu'aucun joueur ne jouerait volontairement (rendre une pièce
gratuitement, par exemple). Si un moteur est fourni, chaque coup adverse de la
ligne est donc revérifié comme n'importe quel coup du joueur : s'il franchit le
seuil d'imprécision par rapport à la meilleure défense, la ligne s'arrête avant.

Enfin, le gain est mesuré au bout de la PV : la recherche s'arrête où elle
s'arrête, et une position gagnante en matériel peut être perdante deux coups
plus loin (horizon). Chaque point de repos est donc revérifié par une analyse
plus profonde (voir `_holds_up`) avant d'être retenu.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence

import chess

import classify
from cook import material_balance

if TYPE_CHECKING:
    from engine import Engine

# Gain minimal, en pions, pour qu'une variante compte comme gagnante.
MIN_GAIN = 1


@dataclass(frozen=True)
class Solution:
    """Variante à jouer par le solveur, et ce qu'elle rapporte."""

    moves: List[chess.Move]
    # {"type": "mate"} ou {"type": "material", "value": <pions gagnés>}
    gain: Dict[str, Any]


def _is_sound_defence(engine: "Engine", walker: chess.Board, move: chess.Move) -> bool:
    """L'adversaire a-t-il un coup nettement meilleur que celui de la PV ?

    Comparaison identique à celle qui juge le joueur : winning chance perdue
    face au meilleur coup, seuil d'imprécision. Position sans coup légal (mat,
    pat) : rien à comparer, on laisse passer.
    """
    candidates = engine.analyse(walker, multipv=1)
    if not candidates:
        return True
    best = candidates[0]
    if best.move == move:
        return True
    played = engine.evaluate_move(walker, move)
    if played is None:
        return True
    delta = classify.delta(best.winning_chances, played.winning_chances)
    return classify.is_accepted(delta)


def _holds_up(
    engine: "Engine",
    rest: chess.Board,
    solver: chess.Color,
    kept: int,
    start_wc: Optional[float],
    lookahead_plies: int,
) -> bool:
    """Le gain encaissé en `rest` tient-il encore après quelques coups ?

    `rest` est la position du point de repos, au trait du solveur. Une seule
    analyse profonde en tire deux contrôles :

    - l'évaluation n'a pas chuté par rapport au départ (même seuil que pour
      juger un coup du joueur) : un gain de matériel qui laisse une position
      perdante n'est pas une bonne carte ;
    - en jouant la meilleure ligne sur `lookahead_plies` demi-coups, le
      matériel du solveur ne retombe pas sous ce qu'il avait encaissé. Seul
      le dernier point après une réponse adverse est compté, car au milieu
      d'un échange le matériel est transitoirement bas.

    Position terminale (mat subi, pat) : rien ne tient, on refuse.
    """
    candidates = engine.analyse(rest, multipv=1, deep=True)
    if not candidates:
        return False
    best = candidates[0]

    if start_wc is not None and not classify.is_accepted(
        classify.delta(start_wc, best.winning_chances)
    ):
        return False

    probe = rest.copy()
    settled: Optional[int] = None
    for offset, move in enumerate(best.pv[:lookahead_plies]):
        if move not in probe.legal_moves:
            break
        probe.push(move)
        if probe.is_checkmate():
            # Décalage pair : le solveur mate ; impair : il est maté.
            return offset % 2 == 0
        if offset % 2 == 1:
            settled = material_balance(probe, solver)
    return settled is None or settled >= kept


def build_solution(
    board: chess.Board,
    pv: Sequence[chess.Move],
    max_plies: int = 12,
    engine: Optional["Engine"] = None,
    start_wc: Optional[float] = None,
    lookahead_plies: int = 4,
) -> Optional[Solution]:
    """Variante gagnante depuis `board` (au trait : le solveur), ou `None`.

    `None` signifie « pas de gain concret dans cette ligne » : l'erreur ne
    donnera pas de carte. Sans `engine`, les coups adverses ne sont pas
    revérifiés et le point de repos n'est pas contrôlé (cas des tests, qui
    fournissent la variante toute faite).

    `start_wc` : winning chance du solveur en `board` avec le meilleur coup ;
    sert de référence pour vérifier que la position finale reste bonne.
    """
    solver = board.turn
    start = material_balance(board, solver)

    walker = board.copy()
    played: List[chess.Move] = []
    # Matériel après chaque demi-coup joué, du point de vue du solveur.
    balances: List[int] = []

    for move in pv:
        if len(played) >= max_plies:
            break
        if move not in walker.legal_moves:
            break
        # `len(played)` impair : le coup qu'on s'apprête à jouer est celui de
        # l'adversaire (0 = solveur, 1 = adversaire, 2 = solveur, ...).
        if engine is not None and len(played) % 2 == 1 and not _is_sound_defence(
            engine, walker, move
        ):
            break
        walker.push(move)
        played.append(move)
        balances.append(material_balance(walker, solver))
        if walker.is_checkmate() and (len(played) - 1) % 2 == 0:
            # Indice pair : c'est le solveur qui vient de mater.
            return Solution(moves=played, gain={"type": "mate"})

    # On remonte la ligne pour trouver les points de repos à partir desquels le
    # gain ne redescend plus : du matériel repris plus loin n'est pas un gain,
    # c'est un échange en cours.
    rest_points: List[int] = []
    for index in range(len(played) - 1, 0, -1):
        if index % 2 == 0:
            continue  # coup du solveur : l'adversaire n'a pas encore répondu
        if balances[index] - start >= MIN_GAIN:
            rest_points.append(index)
        else:
            break

    # Du plus tôt au plus tard : on garde la ligne la plus courte qui tienne.
    for cut in reversed(rest_points):
        if engine is not None:
            rest = board.copy()
            for move in played[: cut + 1]:
                rest.push(move)
            if not _holds_up(
                engine, rest, solver, balances[cut], start_wc, lookahead_plies
            ):
                continue
        return Solution(
            # `cut` est impair : la ligne tronquée se termine sur un coup du
            # solveur.
            moves=played[:cut],
            gain={"type": "material", "value": balances[cut] - start},
        )

    return None
