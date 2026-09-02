"""Enveloppe fine autour de Stockfish (UCI) via python-chess."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import chess
import chess.engine

from classify import Evaluation
from config import Config


@dataclass
class Candidate:
    """Un coup candidat renvoyé par le MultiPV, évalué du point de vue du
    camp au trait dans la position analysée."""

    move: chess.Move
    evaluation: Evaluation
    pv: List[chess.Move] = field(default_factory=list)

    @property
    def winning_chances(self) -> float:
        return self.evaluation.winning_chances


class Engine:
    def __init__(self, config: Config):
        self._config = config
        self._engine: Optional[chess.engine.SimpleEngine] = None

    def __enter__(self) -> "Engine":
        self._engine = chess.engine.SimpleEngine.popen_uci(
            self._config.stockfish_path
        )
        self._engine.configure(
            {"Threads": self._config.threads, "Hash": self._config.hash_mb}
        )
        return self

    def __exit__(self, *_exc) -> None:
        if self._engine is not None:
            self._engine.quit()
            self._engine = None

    @property
    def _limit(self) -> chess.engine.Limit:
        # Stockfish s'arrête au premier des deux critères atteint.
        return chess.engine.Limit(
            time=self._config.movetime_ms / 1000.0, depth=self._config.depth
        )

    def analyse(self, board: chess.Board, multipv: int = 1) -> List[Candidate]:
        """Coups candidats classés du meilleur au moins bon.

        Liste vide si la position est terminale (rien à jouer).
        """
        assert self._engine is not None, "Engine utilisé hors du context manager"
        if board.is_game_over(claim_draw=False):
            return []

        infos = self._engine.analyse(board, self._limit, multipv=multipv)
        if isinstance(infos, dict):  # python-chess renvoie un dict si multipv=None
            infos = [infos]

        candidates: List[Candidate] = []
        for info in infos:
            pv = list(info.get("pv") or [])
            if not pv:
                continue
            score = info["score"].pov(board.turn)
            candidates.append(
                Candidate(
                    move=pv[0],
                    evaluation=Evaluation(cp=score.score(), mate=score.mate()),
                    pv=pv,
                )
            )
        return candidates

    def evaluate_move(
        self, board: chess.Board, move: chess.Move
    ) -> Optional[Candidate]:
        """Évalue un coup précis absent du MultiPV.

        On analyse la position résultante et on ramène le score au point de vue
        du camp qui vient de jouer, pour rester comparable au MultiPV.
        """
        assert self._engine is not None, "Engine utilisé hors du context manager"
        mover = board.turn
        board.push(move)
        try:
            if board.is_game_over(claim_draw=False):
                score = _terminal_score(board, mover)
                return Candidate(move=move, evaluation=score, pv=[move])
            info = self._engine.analyse(board, self._limit)
            pov = info["score"].pov(mover)
            pv = [move] + list(info.get("pv") or [])
            return Candidate(
                move=move,
                evaluation=Evaluation(cp=pov.score(), mate=pov.mate()),
                pv=pv,
            )
        finally:
            board.pop()


def _terminal_score(board: chess.Board, pov: chess.Color) -> Evaluation:
    """Score d'une position terminale, du point de vue de `pov`."""
    if board.is_checkmate():
        # Le camp au trait est mat : c'est `pov` qui vient de mater.
        return Evaluation(cp=None, mate=1 if board.turn != pov else -1)
    return Evaluation(cp=0, mate=None)
