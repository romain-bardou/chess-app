"""Classification des coups selon la méthode de Lichess (lichess-org/lila).

Le principe : une différence de centipions n'a pas le même sens à +0.3 qu'à
+8.0. On convertit donc chaque évaluation en « winning chance » via une
sigmoïde, et on juge le coup sur la perte de winning chance qu'il provoque.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

# Constante de la sigmoïde utilisée par lila (WinPercent / winningChances).
K = -0.00368208

# Seuils sur le delta de winning chance, du plus grave au plus léger.
BLUNDER = -0.30
MISTAKE = -0.20
INACCURACY = -0.10


def winning_chances(cp: Optional[int], mate: Optional[int]) -> float:
    """Convertit une évaluation (du point de vue du camp au trait) en [-1, 1]."""
    if mate is not None:
        # Un mat force est une certitude : on sature. mate == 0 n'existe pas
        # dans une position analysable, mais on le traite comme une défaite.
        return 1.0 if mate > 0 else -1.0
    if cp is None:
        return 0.0
    value = 2.0 / (1.0 + math.exp(K * cp)) - 1.0
    return max(-1.0, min(1.0, value))


def delta(best_wc: float, move_wc: float) -> float:
    """Perte de winning chance du coup joué par rapport au meilleur coup.

    Les deux valeurs sont déjà du point de vue du camp au trait, donc le
    delta est négatif ou nul (à l'arrondi moteur près).
    """
    return move_wc - best_wc


def categorize(d: float) -> Optional[str]:
    """`None` si le coup est acceptable, sinon la gravité."""
    if d <= BLUNDER:
        return "blunder"
    if d <= MISTAKE:
        return "mistake"
    if d <= INACCURACY:
        return "inaccuracy"
    return None


def is_accepted(d: float) -> bool:
    """Un coup est accepté tant qu'il ne franchit pas le seuil d'imprécision.

    C'est volontairement plus large que « le meilleur coup » : plusieurs
    continuations peuvent être correctes, et sanctionner tout ce qui n'est pas
    le premier choix du moteur produirait des puzzles injustes.
    """
    return d > INACCURACY


@dataclass(frozen=True)
class Evaluation:
    """Évaluation d'un coup candidat, du point de vue du camp au trait."""

    cp: Optional[int]
    mate: Optional[int]

    @property
    def winning_chances(self) -> float:
        return winning_chances(self.cp, self.mate)

    def to_json(self) -> dict:
        return {"cp": self.cp, "mate": self.mate}
