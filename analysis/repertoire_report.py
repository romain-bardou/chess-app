"""Rapport de qualité du répertoire d'ouvertures (lecture seule).

`repertoire.py` choisit NOTRE coup à chaque position d'après le seul critère
« le plus joué » sur Lichess. Ce script mesure ce que ça donne : pour chaque
position où c'est à nous de jouer, il compare le coup du répertoire au
meilleur coup de Stockfish et au score réel obtenu sur Lichess. Il n'écrit
rien, ni en base ni ailleurs (sauf le CSV demandé avec `--csv`).

Deux mesures, volontairement séparées :
- Stockfish : l'avantage objectif (matériel et positionnel). La perte est
  exprimée en « winning chance » comme dans classify.py, donc comparable d'une
  position à l'autre (0,3 pion ne pèse pas pareil à +0,0 et à +4,0).
- Lichess : le score pratique du coup (victoires + demi-nuls / parties) dans
  la tranche d'Elo configurée. À bas niveau, un coup un peu moins bon au
  moteur mais piégeux peut rapporter plus de points.

Chaque position est pondérée par sa probabilité d'être atteinte (produit des
popularités des coups adverses depuis le début) : une erreur au coup 4 d'une
ligne très jouée coûte bien plus qu'une au coup 8 d'une branche à 2 %.

Usage :
    python repertoire_report.py                       # arbre lu dans Supabase
    python repertoire_report.py --nodes nodes.json    # ou depuis un export JSON
    python repertoire_report.py --side white --csv rapport.csv

Variables : STOCKFISH_PATH (ou --stockfish), SUPABASE_URL +
SUPABASE_SERVICE_ROLE_KEY (sauf avec --nodes), LICHESS_API_TOKEN (sans lui le
score pratique est ignoré), LICHESS_RATING_BAND, LICHESS_SPEEDS.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

import chess
import httpx

import lichess
from classify import Evaluation
from config import _api_url, _csv, _int
from engine import Candidate, Engine
from lichess import LichessExplorer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("repertoire.report")

# Seuils sur la perte de winning chance (0,02 ~ 11 cp, 0,05 ~ 27 cp, 0,10 ~
# 54 cp autour de l'égalité). Plus fins que ceux de classify.py, pensés pour
# juger un choix d'ouverture et non une gaffe en partie.
CATEGORIES = (
    (0.02, "ok"),
    (0.05, "leger"),
    (0.10, "notable"),
)
WORST = "a-revoir"


def category(loss: float) -> str:
    for limit, name in CATEGORIES:
        if loss <= limit:
            return name
    return WORST


# ----------------------------------------------------------------------
# Arbre
# ----------------------------------------------------------------------
def load_nodes(path: Optional[str]) -> List[Dict[str, Any]]:
    if path:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis "
            "(ou passer un export JSON avec --nodes)."
        )
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    rows: List[Dict[str, Any]] = []
    page = 1000
    with httpx.Client(base_url=f"{_api_url(url)}/rest/v1", headers=headers, timeout=30.0) as client:
        while True:
            response = client.get(
                "/repertoire_nodes",
                params={
                    "select": "id,fen,move_san,side,parent_node_id,popularity",
                    "order": "id",
                    "limit": page,
                    "offset": len(rows),
                },
            )
            response.raise_for_status()
            batch = response.json()
            rows.extend(batch)
            if len(batch) < page:
                return rows


def is_our_move(node: Dict[str, Any]) -> bool:
    """Vrai si la ligne est un coup de NOTRE camp (le trait dans `fen`)."""
    turn = chess.Board(node["fen"]).turn
    return turn == (chess.WHITE if node["side"] == "white" else chess.BLACK)


def reach_probability(node: Dict[str, Any], by_id: Dict[str, Dict[str, Any]]) -> float:
    """Probabilité d'arriver à la position de `node`, en supposant que
    l'adversaire reste dans l'arbre : produit des popularités de ses coups
    sur le chemin. Nos propres coups (popularité nulle) comptent pour 1.
    """
    probability = 1.0
    parent_id = node["parent_node_id"]
    while parent_id:
        parent = by_id[parent_id]
        if parent["popularity"] is not None:
            probability *= parent["popularity"]
        parent_id = parent["parent_node_id"]
    return probability


def path_san(node: Dict[str, Any], by_id: Dict[str, Dict[str, Any]]) -> List[str]:
    """Coups joués depuis la position initiale jusqu'à `node` exclu."""
    moves: List[str] = []
    parent_id = node["parent_node_id"]
    while parent_id:
        parent = by_id[parent_id]
        moves.append(parent["move_san"])
        parent_id = parent["parent_node_id"]
    return list(reversed(moves))


def format_line(moves: List[str]) -> str:
    parts = []
    for i, san in enumerate(moves):
        parts.append(f"{i // 2 + 1}.{san}" if i % 2 == 0 else san)
    return " ".join(parts)


# ----------------------------------------------------------------------
# Mesures
# ----------------------------------------------------------------------
def practical_score(
    response: Dict[str, Any], san: str, side: str, min_games: int
) -> Optional[Tuple[float, int]]:
    """(score entre 0 et 1, nombre de parties) du coup `san` pour notre camp,
    ou None sans échantillon suffisant."""
    for move in response.get("moves") or []:
        if move["san"] != san:
            continue
        games = lichess.move_share(move)
        if games < min_games:
            return None
        wins = move["white"] if side == "white" else move["black"]
        return (wins + 0.5 * move["draws"]) / games, games
    return None


def format_eval(evaluation: Evaluation) -> str:
    if evaluation.mate is not None:
        return f"#{evaluation.mate}"
    return f"{evaluation.cp / 100:+.2f}"


def pick_suggestion(
    candidates: List[Tuple[str, float, Optional[float]]], tolerance: float
) -> Optional[str]:
    """Parmi les candidats moteur (san, perte, score pratique) dont la perte
    ne dépasse pas `tolerance`, celui qui a le meilleur score pratique. À
    défaut de score pour tous, le meilleur coup moteur.
    """
    close = [c for c in candidates if c[1] <= tolerance]
    if not close:
        return None
    scored = [c for c in close if c[2] is not None]
    if scored:
        return max(scored, key=lambda c: (c[2], -c[1]))[0]
    return min(close, key=lambda c: c[1])[0]


def analyse_node(
    engine: Engine,
    explorer: Optional[LichessExplorer],
    node: Dict[str, Any],
    args: argparse.Namespace,
    min_games: int,
) -> Dict[str, Any]:
    board = chess.Board(node["fen"])
    played = board.parse_san(node["move_san"])
    candidates = engine.analyse(board, multipv=args.multipv, deep=True)
    best = candidates[0]

    by_move = {c.move: c for c in candidates}
    played_candidate: Optional[Candidate] = by_move.get(played) or engine.evaluate_move(board, played)
    loss = max(0.0, best.winning_chances - played_candidate.winning_chances)

    response = explorer.lookup(node["fen"]) if explorer else None

    def score_of(san: str) -> Optional[Tuple[float, int]]:
        if response is None:
            return None
        return practical_score(response, san, node["side"], min_games)

    scored: List[Tuple[str, float, Optional[float]]] = []
    for candidate in candidates:
        san = board.san(candidate.move)
        practical = score_of(san)
        scored.append(
            (san, max(0.0, best.winning_chances - candidate.winning_chances),
             practical[0] if practical else None)
        )

    played_practical = score_of(node["move_san"])
    best_san = board.san(best.move)
    best_practical = score_of(best_san)
    suggestion = pick_suggestion(scored, args.tolerance)

    return {
        "played": node["move_san"],
        "played_eval": format_eval(played_candidate.evaluation),
        "best": best_san,
        "best_eval": format_eval(best.evaluation),
        "loss": loss,
        "category": category(loss),
        "played_score": played_practical[0] if played_practical else None,
        "played_games": played_practical[1] if played_practical else None,
        "best_score": best_practical[0] if best_practical else None,
        "suggestion": suggestion if suggestion and suggestion != node["move_san"] else "",
    }


# ----------------------------------------------------------------------
# Sortie
# ----------------------------------------------------------------------
def pct(value: Optional[float]) -> str:
    return "" if value is None else f"{value * 100:.0f}%"


def print_report(rows: List[Dict[str, Any]], top: int) -> None:
    total_reach = sum(r["reach"] for r in rows) or 1.0
    counts: Dict[str, int] = {}
    for row in rows:
        counts[row["category"]] = counts.get(row["category"], 0) + 1
    weighted_loss = sum(r["loss"] * r["reach"] for r in rows) / total_reach

    print(f"\n{len(rows)} position(s) où on choisit un coup.")
    for _, name in CATEGORIES:
        print(f"  {name:9s} {counts.get(name, 0)}")
    print(f"  {WORST:9s} {counts.get(WORST, 0)}")
    print(f"Perte moyenne pondérée par la probabilité d'atteindre la position : {weighted_loss * 100:.1f} % de winning chance.")
    different = sum(1 for r in rows if r["played"] != r["best"])
    print(f"Le coup du répertoire n'est pas le premier choix du moteur dans {different} position(s).\n")

    worst = sorted(rows, key=lambda r: r["loss"] * r["reach"], reverse=True)[:top]
    print(f"Les {len(worst)} choix qui coûtent le plus (perte × probabilité) :\n")
    print(f"{'atteint':>7} {'perte':>6}  {'joué':<8}{'éval':>7}  {'moteur':<8}{'éval':>7}  {'score joué':>10}  {'suggestion':<10} ligne")
    for r in worst:
        played_score = pct(r["played_score"])
        print(
            f"{pct(r['reach']):>7} {r['loss'] * 100:>5.1f}%  {r['played']:<8}{r['played_eval']:>7}  "
            f"{r['best']:<8}{r['best_eval']:>7}  {played_score:>10}  {r['suggestion']:<10} {r['line']}"
        )


CSV_FIELDS = (
    "side", "line", "played", "played_eval", "best", "best_eval", "loss",
    "category", "reach", "played_score", "played_games", "best_score", "suggestion",
)


def write_csv(path: str, rows: List[Dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    log.info("%d ligne(s) écrite(s) dans %s.", len(rows), path)


# ----------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--nodes", help="export JSON des lignes repertoire_nodes (sinon lu dans Supabase)")
    parser.add_argument("--side", choices=("white", "black"), help="un seul camp")
    parser.add_argument("--stockfish", default=os.environ.get("STOCKFISH_PATH", "stockfish"))
    parser.add_argument("--depth", type=int, default=20, help="profondeur Stockfish (défaut 20)")
    parser.add_argument("--multipv", type=int, default=4, help="candidats moteur par position (défaut 4)")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--hash", type=int, default=128, help="Mo de hash Stockfish")
    parser.add_argument("--tolerance", type=float, default=0.03,
                        help="perte de winning chance tolérée pour une suggestion (défaut 0.03 ~ 16 cp)")
    parser.add_argument("--min-games", type=int, default=100, help="parties minimum pour un score pratique")
    parser.add_argument("--top", type=int, default=25, help="nombre de lignes affichées (défaut 25)")
    parser.add_argument("--limit", type=int, help="n'analyser que les N positions les plus probables")
    parser.add_argument("--no-lichess", action="store_true", help="ignorer le score pratique Lichess")
    parser.add_argument("--csv", help="écrire toutes les positions dans ce fichier CSV")
    return parser.parse_args()


def run() -> int:
    args = parse_args()
    nodes = load_nodes(args.nodes)
    by_id = {n["id"]: n for n in nodes}
    ours = [n for n in nodes if is_our_move(n) and (args.side is None or n["side"] == args.side)]
    for node in ours:
        node["_reach"] = reach_probability(node, by_id)
    ours.sort(key=lambda n: n["_reach"], reverse=True)
    if args.limit:
        ours = ours[: args.limit]
    log.info("%d position(s) à analyser sur %d ligne(s) en base.", len(ours), len(nodes))

    # Engine ne lit que ces champs de Config ; on évite Config.from_env()
    # qui exigerait les identifiants Supabase même avec --nodes. Pas de limite
    # de temps effective : la profondeur seule décide, donc le rapport est
    # reproductible d'un run à l'autre.
    engine_config = SimpleNamespace(
        stockfish_path=args.stockfish,
        threads=args.threads,
        hash_mb=args.hash,
        movetime_ms=600_000,
        depth=args.depth,
        verify_movetime_ms=600_000,
        verify_depth=args.depth,
    )

    token = os.environ.get("LICHESS_API_TOKEN", "").strip()
    use_lichess = bool(token) and not args.no_lichess
    if not use_lichess:
        log.warning("Pas de score pratique Lichess (LICHESS_API_TOKEN absent ou --no-lichess).")

    rows: List[Dict[str, Any]] = []
    explorer_cm = (
        LichessExplorer(token, _csv("LICHESS_SPEEDS", "rapid"), _int("LICHESS_RATING_BAND", 0))
        if use_lichess
        else None
    )
    with Engine(engine_config) as engine:  # type: ignore[arg-type]
        try:
            for index, node in enumerate(ours, start=1):
                result = analyse_node(engine, explorer_cm, node, args, args.min_games)
                result.update(
                    side=node["side"],
                    reach=node["_reach"],
                    line=format_line(path_san(node, by_id)),
                )
                rows.append(result)
                if index % 10 == 0:
                    log.info("%d/%d", index, len(ours))
        finally:
            if explorer_cm:
                explorer_cm.close()

    print_report(rows, args.top)
    if args.csv:
        write_csv(args.csv, rows)
    return 0


if __name__ == "__main__":
    sys.exit(run())
