"""Accès Supabase via PostgREST.

Le script tourne avec la clé service_role (contexte GitHub Actions, pas de
session utilisateur), donc RLS est contourné : on renseigne `user_id`
explicitement à partir de la table `app_owner`.
"""
from __future__ import annotations

from datetime import datetime, timezone
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

    # ------------------------------------------------------------------
    def games_to_reanalyze(self, limit: int) -> List[Dict[str, Any]]:
        """Parties déjà analysées mais pas encore repassées sous la logique
        courante, les plus anciennes d'abord.

        Indépendant de `analyzed` : une partie reste `analyzed = true`, seul
        `reanalyzed_at` avance, pour ne jamais interférer avec le pipeline
        quotidien qui, lui, ne regarde que les parties jamais vues.
        """
        response = self._client.get(
            "/games",
            params={
                "select": "id,pgn,color_played,chess_com_url,played_at",
                "analyzed": "eq.true",
                "reanalyzed_at": "is.null",
                "order": "played_at.asc",
                "limit": limit,
            },
        )
        response.raise_for_status()
        return response.json()

    def mark_reanalyzed(self, game_id: str) -> None:
        response = self._client.patch(
            "/games",
            params={"id": f"eq.{game_id}"},
            json={"reanalyzed_at": datetime.now(timezone.utc).isoformat()},
            headers={"Prefer": "return=minimal"},
        )
        response.raise_for_status()

    def upsert_mistakes_preserving_fsrs(self, rows: List[Dict[str, Any]]) -> None:
        """Comme `insert_mistakes`, mais remplace le contenu d'une carte déjà
        en base au lieu de l'ignorer.

        `merge-duplicates` ne touche que les colonnes présentes dans `rows` :
        `fsrs_card` et les colonnes `fsrs_*` n'y figurent jamais (elles ne
        sortent pas de `evaluate_position`), donc une carte déjà révisée garde
        son historique FSRS intact même si sa solution change sous elle.
        """
        if not rows:
            return
        response = self._client.post(
            "/mistakes",
            json=rows,
            params={"on_conflict": "game_id,ply_number"},
            headers={"Prefer": "return=minimal,resolution=merge-duplicates"},
        )
        response.raise_for_status()

    def delete_stale_mistakes(self, game_id: str, kept_plies: List[int]) -> int:
        """Supprime les cartes d'une partie que la réanalyse n'a pas
        reproduites, qu'elles aient été révisées ou non. Retourne le nombre
        supprimé.

        Une carte qui n'est plus produite par la logique courante n'est plus un
        bon puzzle : son historique de révision ne justifie pas de la garder.
        """
        params = {"game_id": f"eq.{game_id}", "select": "id"}
        if kept_plies:
            params["ply_number"] = f"not.in.({','.join(str(p) for p in kept_plies)})"
        response = self._client.delete(
            "/mistakes",
            params=params,
            headers={"Prefer": "return=representation"},
        )
        response.raise_for_status()
        return len(response.json())

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

    def upsert_repertoire_node(self, row: Dict[str, Any]) -> str:
        """Insère ou met à jour un noeud de répertoire par (fen, move_san, side).

        `side` fait partie de la clé : les deux répertoires partagent la
        position de départ (1.e4), une fois comme notre coup, une fois comme
        coup adverse assumé — sans `side`, la seconde ligne ne pourrait
        jamais être insérée. Rejouable : relancer analysis/repertoire.py
        après avoir changé LICHESS_RATING_BAND réécrit les lignes existantes
        (popularité, is_book_end) au lieu de les dupliquer.
        """
        response = self._client.post(
            "/repertoire_nodes",
            json=[row],
            params={"on_conflict": "fen,move_san,side"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        response.raise_for_status()
        return response.json()[0]["id"]
