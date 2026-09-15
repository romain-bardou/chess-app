"""Lichess Opening Explorer — statistiques de popularité par position.

L'API exige désormais un jeton (n'importe quel jeton personnel, sans scope :
elle ne sert que des statistiques publiques). Module séparé en deux, comme
`chesscom.py` : les fonctions pures (choix du coup, filtrage des réponses
adverses) sont testables sans réseau, et `LichessExplorer` ne fait que
l'appel HTTP.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

API = "https://explorer.lichess.org"
log = logging.getLogger("repertoire.lichess")


def total_games(response: Dict[str, Any]) -> int:
    return response["white"] + response["draws"] + response["black"]


def move_share(move: Dict[str, Any]) -> int:
    return move["white"] + move["draws"] + move["black"]


def top_move(response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Le coup le plus joué à cette position, ou None si aucune donnée."""
    moves = response.get("moves") or []
    if not moves:
        return None
    return max(moves, key=move_share)


def popular_replies(
    response: Dict[str, Any], threshold: float
) -> List[Dict[str, Any]]:
    """Coups adverses dont la part dépasse `threshold` (ex: 0.05 = 5 %)."""
    total = total_games(response)
    if total == 0:
        return []
    return [m for m in response.get("moves", []) if move_share(m) / total >= threshold]


def usable_replies(
    response: Dict[str, Any], threshold: float, min_games: int
) -> List[Dict[str, Any]]:
    """`popular_replies`, mais renvoie [] si l'échantillon est trop petit
    pour que les pourcentages veuillent dire quoi que ce soit.
    """
    if total_games(response) < min_games:
        return []
    return popular_replies(response, threshold)


class LichessExplorer:
    def __init__(self, token: str, speeds: tuple, rating_band: int):
        self._client = httpx.Client(
            base_url=API,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        self._speeds = speeds
        self._rating_band = rating_band
        # Les transpositions (même position atteinte par plusieurs ordres de
        # coups) sont fréquentes dans un arbre d'ouverture : sans ce cache,
        # chacune redéclenche le même appel réseau.
        self._cache: Dict[str, Dict[str, Any]] = {}

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "LichessExplorer":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def lookup(self, fen: str) -> Dict[str, Any]:
        if fen in self._cache:
            return self._cache[fen]

        # 1 req/s mesuré comme insuffisant (429 après une trentaine d'appels) :
        # on espace davantage et on attend la minute conseillée par la doc
        # Lichess en cas de dépassement, plutôt que d'abandonner le script.
        for attempt in range(5):
            time.sleep(1.0)
            response = self._client.get(
                "/lichess",
                params={
                    "variant": "standard",
                    "fen": fen,
                    "speeds": ",".join(self._speeds),
                    "ratings": self._rating_band,
                    "moves": 15,
                    "topGames": 0,
                    "recentGames": 0,
                },
            )
            if response.status_code == 401:
                raise SystemExit(
                    "Lichess Explorer a répondu 401 : LICHESS_API_TOKEN "
                    "manquant ou invalide (jeton personnel, aucun scope "
                    "requis)."
                )
            if response.status_code == 429:
                log.warning(
                    "429 Too Many Requests, pause d'une minute (essai %d/5)…",
                    attempt + 1,
                )
                time.sleep(60)
                continue
            response.raise_for_status()
            self._cache[fen] = response.json()
            return self._cache[fen]
        raise SystemExit(
            "Lichess Explorer : trop de 429 consécutifs, abandon."
        )
