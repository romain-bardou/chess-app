"""Import des parties depuis l'API publique chess.com.

L'API est en lecture seule et sans authentification, mais elle exige un
User-Agent explicite : sans lui, elle répond 403.

Le module est séparé en deux : les fonctions pures (choix des archives,
conversion d'une partie JSON en ligne `games`) sont testables sans réseau, et
la classe `ChessCom` ne fait que les appels HTTP.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urlsplit

import chess.pgn
import httpx

API = "https://api.chess.com/pub"
USER_AGENT = "chess-app/1.0 (+https://github.com/romain-bardou/chess-app)"

# Codes de fin de partie chess.com valant nulle. Tout le reste est une défaite
# du camp concerné, `win` mis à part.
DRAW_RESULTS = frozenset(
    {
        "agreed",
        "repetition",
        "stalemate",
        "insufficient",
        "50move",
        "timevsinsufficient",
    }
)


def archive_month(url: str) -> tuple:
    """(année, mois) d'une URL d'archive `.../games/2026/08`."""
    parts = urlsplit(url).path.rstrip("/").split("/")
    return (int(parts[-2]), int(parts[-1]))


def archives_to_fetch(
    archives: Sequence[str], since: Optional[datetime]
) -> List[str]:
    """Archives à télécharger, de la plus ancienne à la plus récente.

    `since` est la date de la partie la plus récente déjà en base. On reprend
    à son mois inclus (des parties plus tardives du même mois peuvent manquer)
    et on ne redescend jamais plus bas : les mois antérieurs sont déjà
    importés, les retélécharger coûterait plusieurs mégaoctets par run.
    """
    ordered = sorted(archives, key=archive_month)
    if since is None:
        return ordered
    floor = (since.year, since.month)
    return [url for url in ordered if archive_month(url) >= floor]


def _headers(pgn: str) -> Dict[str, str]:
    parsed = chess.pgn.read_headers(io.StringIO(pgn))
    return dict(parsed) if parsed is not None else {}


def _opening_name(eco_url: str) -> Optional[str]:
    """Nom lisible depuis `https://www.chess.com/openings/Caro-Kann-Defense-2.d4-d5`.

    Le slug ne distingue pas les tirets séparateurs des tirets du nom
    (« Caro-Kann »), donc l'inverse exact est impossible : on remplace tout par
    des espaces, ce qui reste lisible.
    """
    slug = urlsplit(eco_url).path.rstrip("/").split("/")[-1]
    return slug.replace("-", " ") or None


def to_game_row(game: Dict[str, Any], username: str) -> Optional[Dict[str, Any]]:
    """Ligne `games`, ou None si la partie n'est pas importable.

    `user_id` est volontairement absent : le trigger `games_set_user_id` le
    remplit depuis `app_owner`.
    """
    pgn = game.get("pgn")
    url = game.get("url")
    end_time = game.get("end_time")
    if not pgn or not url or not end_time:
        return None

    me = username.lower()
    white = (game.get("white") or {}).get("username", "").lower()
    black = (game.get("black") or {}).get("username", "").lower()
    if me == white:
        color, mine = "white", game.get("white") or {}
    elif me == black:
        color, mine = "black", game.get("black") or {}
    else:
        return None

    outcome = mine.get("result", "")
    if outcome == "win":
        result = "win"
    elif outcome in DRAW_RESULTS:
        result = "draw"
    else:
        result = "loss"

    headers = _headers(pgn)
    eco_url = game.get("eco") or headers.get("ECOUrl", "")

    return {
        "chess_com_url": url,
        "played_at": datetime.fromtimestamp(end_time, timezone.utc).isoformat(),
        "time_control": game.get("time_class", "rapid"),
        "color_played": color,
        "result": result,
        "eco": headers.get("ECO") or None,
        "opening_name": _opening_name(eco_url) if eco_url else None,
        "pgn": pgn,
    }


def importable(
    game: Dict[str, Any], time_classes: Iterable[str]
) -> bool:
    """Filtre les cadences et variantes hors périmètre (bullet, chess960…)."""
    return (
        game.get("rules") == "chess"
        and game.get("time_class") in set(time_classes)
    )


class ChessCom:
    def __init__(self, username: str):
        self.username = username
        self._client = httpx.Client(
            base_url=API,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=60.0,
            follow_redirects=True,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ChessCom":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def archives(self) -> List[str]:
        response = self._client.get(f"/player/{self.username}/games/archives")
        if response.status_code == 404:
            raise SystemExit(
                f"Joueur chess.com « {self.username} » introuvable : "
                "vérifier la variable CHESS_COM_USERNAME."
            )
        response.raise_for_status()
        return response.json().get("archives", [])

    def games(self, archive_url: str) -> List[Dict[str, Any]]:
        response = self._client.get(archive_url)
        response.raise_for_status()
        return response.json().get("games", [])
