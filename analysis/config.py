"""Configuration du script d'analyse, lue depuis l'environnement."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


@dataclass(frozen=True)
class Config:
    supabase_url: str
    service_role_key: str
    stockfish_path: str

    # On privilégie la vitesse à la profondeur : le niveau visé (~700 rapid)
    # ne justifie pas une analyse profonde, et les minutes GitHub Actions
    # gratuites sont limitées.
    movetime_ms: int
    depth: int
    multipv: int
    threads: int
    hash_mb: int

    # Nombre de demi-coups conservés dans punishment_pv.
    punishment_plies: int
    # Garde-fou : au-delà, le run s'arrête et reprendra le lendemain.
    max_games_per_run: int
    # On ignore l'ouverture : les écarts y sont dus au répertoire, pas au calcul.
    skip_first_plies: int

    @staticmethod
    def from_env() -> "Config":
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise SystemExit(
                "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis."
            )
        return Config(
            supabase_url=url,
            service_role_key=key,
            stockfish_path=os.environ.get("STOCKFISH_PATH", "stockfish"),
            movetime_ms=_int("ENGINE_MOVETIME_MS", 400),
            depth=_int("ENGINE_DEPTH", 14),
            multipv=_int("ENGINE_MULTIPV", 4),
            threads=_int("ENGINE_THREADS", 2),
            hash_mb=_int("ENGINE_HASH_MB", 128),
            punishment_plies=_int("PUNISHMENT_PLIES", 8),
            max_games_per_run=_int("MAX_GAMES_PER_RUN", 40),
            skip_first_plies=_int("SKIP_FIRST_PLIES", 8),
        )
