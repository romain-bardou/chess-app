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
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import chess

from cook import material_balance

# Gain minimal, en pions, pour qu'une variante compte comme gagnante.
MIN_GAIN = 1


@dataclass(frozen=True)
class Solution:
    """Variante à jouer par le solveur, et ce qu'elle rapporte."""

    moves: List[chess.Move]
    # {"type": "mate"} ou {"type": "material", "value": <pions gagnés>}
    gain: Dict[str, Any]


def build_solution(
    board: chess.Board, pv: Sequence[chess.Move], max_plies: int = 12
) -> Optional[Solution]:
    """Variante gagnante depuis `board` (au trait : le solveur), ou `None`.

    `None` signifie « pas de gain concret dans cette ligne » : l'erreur ne
    donnera pas de carte.
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
        walker.push(move)
        played.append(move)
        balances.append(material_balance(walker, solver))
        if walker.is_checkmate() and (len(played) - 1) % 2 == 0:
            # Indice pair : c'est le solveur qui vient de mater.
            return Solution(moves=played, gain={"type": "mate"})

    # On remonte la ligne pour trouver le plus tôt possible un point de repos
    # à partir duquel le gain ne redescend plus : du matériel repris plus loin
    # n'est pas un gain, c'est un échange en cours.
    cut: Optional[int] = None
    for index in range(len(played) - 1, 0, -1):
        if index % 2 == 0:
            continue  # coup du solveur : l'adversaire n'a pas encore répondu
        if balances[index] - start >= MIN_GAIN:
            cut = index
        else:
            break

    if cut is None:
        return None

    return Solution(
        # `cut` est impair : la ligne tronquée se termine sur un coup du solveur.
        moves=played[:cut],
        gain={"type": "material", "value": balances[cut] - start},
    )
