# Atelier — entraînement échecs

Import des parties chess.com, détection des erreurs avec Stockfish, révision en
puzzles avec répétition espacée (FSRS), statistiques par thème tactique.

```
chess.com API → Make → Supabase (Postgres)
                            │
              GitHub Actions (cron quotidien)
              Python + python-chess + Stockfish
              → classifie, tague, écrit dans `mistakes`
                            │
                    App Expo (React Native)
                    → file de révision FSRS + stats
```

## Structure

| Dossier | Rôle |
| --- | --- |
| `app/` | Application Expo (React Native, TypeScript) |
| `analysis/` | Script d'analyse Python (Stockfish, python-chess) |
| `supabase/migrations/` | Schéma SQL |
| `.github/workflows/` | Cron d'analyse + tests |

## Mise en route

### 1. Supabase

Exécuter dans le SQL Editor, dans l'ordre :

1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_stats.sql`
3. `supabase/migrations/004_fsrs_card.sql`

Puis créer le compte (Authentication → Users → Add user, email + mot de passe),
copier son UUID, et renseigner le propriétaire :

```bash
cp supabase/migrations/003_owner.sql.template supabase/migrations/003_owner.sql
```

Coller l'UUID dans le fichier et l'exécuter. Ce fichier est ignoré par git.

### 2. Script d'analyse

Secrets à créer dans le dépôt GitHub (Settings → Secrets → Actions) :

| Secret | Valeur |
| --- | --- |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret key** `sb_secret_…` (ou la clé `service_role` de l'onglet legacy). Jamais dans l'app. |

Le workflow `analyse.yml` tourne tous les jours à 04h20 UTC, et peut être
déclenché à la main (`workflow_dispatch`) avec un nombre de parties à traiter.

En local :

```bash
python -m venv .venv && ./.venv/Scripts/pip install -r analysis/requirements.txt
```

```bash
cd analysis && python test_analysis.py
```

Pour un run réel en local il faut un binaire Stockfish et les variables
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STOCKFISH_PATH`.

### 3. App

```bash
cd app && cp .env.example .env
```

Renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` à partir
de :

| Valeur | Emplacement dans Supabase |
| --- | --- |
| Project URL | Settings → Data API |
| clé publique (app) | Settings → API Keys → **Publishable key** (`sb_publishable_…`) |
| clé serveur (script) | Settings → API Keys → **Secret key** (`sb_secret_…`) |

L'onglet « Legacy anon, service_role API keys » expose les anciennes clés JWT
équivalentes (`anon` ↔ publishable, `service_role` ↔ secret), utilisables en repli
si une clé nouveau format est refusée.

Puis :

```bash
cd app && npm install && npx expo start
```

Expo Go suffit pour cette V1 (aucune fonctionnalité native hors modules Expo).

## Import chess.com

Géré par un scénario Make côté utilisateur : `ormaniba`, rapid uniquement,
`https://api.chess.com/pub/player/ormaniba/games/archives` puis chaque mois.
Le scénario n'a qu'à insérer dans `games` ; `user_id` est rempli automatiquement
par un trigger à partir de `app_owner`.

## Classification des coups

Méthode Lichess (`lichess-org/lila`), reproduite dans `analysis/classify.py` :

1. Chaque évaluation en centipions devient une *winning chance* :
   `wc(cp) = clamp(2 / (1 + exp(-0.00368208 · cp)) − 1, −1, 1)`
2. Le coup joué est comparé au meilleur coup, du point de vue du camp au trait.
3. Seuils sur le delta : imprécision ≤ −0.10, erreur ≤ −0.20, gaffe ≤ −0.30.
4. Tout coup candidat au-dessus de −0.10 entre dans `accepted_moves` — pas
   seulement le premier choix du moteur.

Exception « coup de répertoire » (comportement chess.com, absent de l'algorithme
Lichess) : un couple (position, coup) présent dans `repertoire_nodes` n'est
jamais sanctionné. La table est vide tant que la phase 2 n'existe pas, donc
l'exception est sans effet pour l'instant, mais le code est en place.

Les motifs tactiques (`analysis/cook.py`) sont adaptés de
`lichess-org/lichess-puzzler`, avec les mêmes clés que Lichess (`fork`, `pin`,
`backRankMate`…) ; la traduction en français vit dans `app/src/locales/fr.json`.

## Notation FSRS

Aucune auto-évaluation : la note se déduit du résultat et du temps.

```
temps_attendu = 10 s + 5 s × (nombre de demi-coups de punishment_pv)
raté                             → Again
réussi, < 60 % du temps attendu  → Easy
réussi, 60–120 %                 → Good
réussi, > 120 %                  → Hard
```

Les constantes sont regroupées en tête de `app/src/lib/fsrs.ts`.

Le barème `15 s + 12 s` de la spec initiale donnait 111 s attendues sur une
réfutation de 8 demi-coups. Un puzzle à un seul coup se résolvant en 10-30 s,
tout aurait été noté « Easy » et FSRS aurait repoussé les cartes bien trop loin.
Le barème resserré à `10 s + 5 s` (50 s sur 8 demi-coups) répartit réellement
entre Easy, Good et Hard.

## Écarts assumés par rapport à la spec

| Écart | Raison |
| --- | --- |
| Colonne `user_id` ajoutée aux trois tables + trigger de remplissage | Sans elle, RLS ne peut rien restreindre, et la clé anon d'une app publiée sur l'App Store donnerait un accès libre aux données. |
| Colonne `fsrs_card jsonb` ajoutée (migration 004) | FSRS a besoin de `state`, `reps`, `lapses`, `last_review` pour planifier. Avec seulement stabilité/difficulté/échéance, une carte oubliée repartirait comme neuve. Les trois colonnes de la spec restent la projection interrogeable. |
| Contrainte `unique (game_id, ply_number)` sur `mistakes` | Une partie réanalysée ne doit pas dupliquer ses cartes ni écraser un état FSRS existant. |
| Pièces d'échecs dessinées sur mesure | Les jeux libres courants (Cburnett) sont sous licence à attribution ; contrainte inutile pour une publication App Store. |
| Les 8 premiers demi-coups ne sont pas analysés (`SKIP_FIRST_PLIES`) | Les écarts en ouverture relèvent du répertoire, pas du calcul. Réglable par variable d'environnement. |

## Hors périmètre V1

Répertoire d'ouvertures (phase 2 — la table `repertoire_nodes` existe mais
aucune logique ne s'appuie dessus), notifications push, cadences autres que le
rapid, EAS Build/Submit.
