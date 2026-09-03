"""Accès Supabase via PostgREST.

Le script tourne avec la clé service_role (contexte GitHub Actions, pas de
session utilisateur), donc RLS est contourné : on renseigne `user_id`
explicitement à partir de la table `app_owner`.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from config import Config


class Supabase:
    def __init__(self, config: Config):
        self._client = httpx.Client(
            base_url=f"{config.supabase_url}/rest/v1",
            headers={
                "apikey": config.service_role_key,
                "Authorization": f"Bearer {config.service_role_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
        self._owner_id: Optional[str] = None
        # Cache mémoire des positions de répertoire déjà interrogées, pour
        # éviter un aller-retour réseau par coup analysé.
        self._book_cache: Dict[tuple, bool] = {}

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "Supabase":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # ------------------------------------------------------------------
    @property
    def owner_id(self) -> str:
        if self._owner_id is None:
            response = self._client.get("/app_owner", params={"select": "user_id", "limit": 1})
            response.raise_for_status()
            rows = response.json()
            if not rows:
                raise SystemExit(
                    "La table app_owner est vide : exécuter supabase/migrations/003_owner.sql."
                )
            self._owner_id = rows[0]["user_id"]
        return self._owner_id

    # ------------------------------------------------------------------
    def latest_played_at(self) -> Optional[str]:
        """Date de la partie la plus récente en base, ou None si table vide.

        Sert de point de reprise à l'import : inutile de retélécharger les
        archives mensuelles antérieures.
        """
        response = self._client.get(
            "/games",
            params={"select": "played_at", "order": "played_at.desc", "limit": 1},
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0]["played_at"] if rows else None

    def insert_games(self, rows: List[Dict[str, Any]]) -> int:
        """Insère les parties absentes. Retourne le nombre effectivement créé.

        Les doublons sont ignorés sur `chess_com_url` : réimporter un mois déjà
        traité ne remet pas `analyzed` à false et ne duplique rien.
        """
        if not rows:
            return 0
        response = self._client.post(
            "/games",
            json=rows,
            params={"on_conflict": "chess_com_url", "select": "id"},
            headers={"Prefer": "return=representation,resolution=ignore-duplicates"},
        )
        response.raise_for_status()
        return len(response.json())

    # ------------------------------------------------------------------
    def pending_games(self, limit: int) -> List[Dict[str, Any]]:
        response = self._client.get(
            "/games",
            params={
                "select": "id,pgn,color_played,chess_com_url,played_at",
                "analyzed": "eq.false",
                "order": "played_at.asc",
                "limit": limit,
            },
        )
        response.raise_for_status()
        return response.json()

    def mark_analyzed(self, game_id: str) -> None:
        response = self._client.patch(
            "/games",
            params={"id": f"eq.{game_id}"},
            json={"analyzed": True},
            headers={"Prefer": "return=minimal"},
        )
        response.raise_for_status()

    def insert_mistakes(self, rows: List[Dict[str, Any]]) -> None:
        if not rows:
            return
        response = self._client.post(
            "/mistakes",
            json=rows,
            # Une partie réanalysée ne doit pas dupliquer ses cartes, ni faire
            # perdre son état FSRS à une carte déjà révisée : on ignore les
            # doublons sur la contrainte (game_id, ply_number).
            params={"on_conflict": "game_id,ply_number"},
            headers={"Prefer": "return=minimal,resolution=ignore-duplicates"},
        )
        response.raise_for_status()

    def is_book_move(self, fen: str, move_san: str) -> bool:
        """Exception « coup de répertoire » : un coup présent dans mon
        répertoire n'est jamais sanctionné, même si le moteur le juge
        inférieur. Table vide tant que la phase 2 n'est pas construite.
        """
        key = (fen, move_san)
        if key not in self._book_cache:
            response = self._client.get(
                "/repertoire_nodes",
                params={
                    "select": "id",
                    "fen": f"eq.{fen}",
                    "move_san": f"eq.{move_san}",
                    "limit": 1,
                },
            )
            response.raise_for_status()
            self._book_cache[key] = bool(response.json())
        return self._book_cache[key]
