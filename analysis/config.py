"""Configuration du script d'analyse, lue depuis l'environnement."""
from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlsplit


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


def _csv(name: str, default: str) -> tuple:
    raw = os.environ.get(name) or default
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _api_url(raw: str) -> str:
    """Valide l'URL de l'API du projet Supabase.

    GitHub masque la valeur des secrets dans les logs : une URL erronée ne
    produit qu'un « 404 sur ***rest/v1/games », indéchiffrable. On refuse donc
    de démarrer avec un message qui dit quoi corriger.

    L'erreur classique est de coller l'URL du tableau de bord
    (`https://supabase.com/dashboard/project/<ref>`) au lieu de celle de l'API
    (`https://<ref>.supabase.co`, dans Settings > Data API > Project URL).
    """
    url = raw.strip().rstrip("/")
    parsed = urlsplit(url)

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise SystemExit(
            "SUPABASE_URL doit être une URL complète de la forme "
            "https://<ref>.supabase.co (Settings > Data API > Project URL)."
        )

    if parsed.path:
        raise SystemExit(
            "SUPABASE_URL ne doit contenir aucun chemin, seulement l'hôte : "
            f"https://<ref>.supabase.co. Reçu un chemin « {parsed.path} » — "
            "c'est probablement l'URL du tableau de bord et non celle de l'API."
        )

    return url


@dataclass(frozen=True)
class Config:
    supabase_url: str
    service_role_key: str
    stockfish_path: str

    # Import chess.com. Le pseudo n'est pas un secret : il vit dans le
    # workflow, pas dans les secrets du dépôt.
    chess_com_username: str
    # Cadences importées. Le reste (bullet, blitz, daily) est hors périmètre.
    import_time_classes: tuple

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
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise SystemExit(
                "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis."
            )
        return Config(
            supabase_url=_api_url(url),
            service_role_key=key,
            stockfish_path=os.environ.get("STOCKFISH_PATH", "stockfish"),
            chess_com_username=os.environ.get("CHESS_COM_USERNAME", "").strip(),
            import_time_classes=_csv("IMPORT_TIME_CLASSES", "rapid"),
            movetime_ms=_int("ENGINE_MOVETIME_MS", 400),
            depth=_int("ENGINE_DEPTH", 14),
            multipv=_int("ENGINE_MULTIPV", 4),
            threads=_int("ENGINE_THREADS", 2),
            hash_mb=_int("ENGINE_HASH_MB", 128),
            punishment_plies=_int("PUNISHMENT_PLIES", 8),
            max_games_per_run=_int("MAX_GAMES_PER_RUN", 40),
            skip_first_plies=_int("SKIP_FIRST_PLIES", 8),
        )
