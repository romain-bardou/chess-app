# Atelier — entraînement échecs

Import des parties chess.com, détection des erreurs avec Stockfish, révision en
puzzles avec répétition espacée (FSRS), statistiques par thème tactique.

```
GitHub Actions — .github/workflows/pipeline.yml, toutes les 6 h
                            │
   import_games.py          │          main.py
   chess.com API  ──────────┼────────▶ python-chess + Stockfish
   → table `games`          │          → classifie, tague, écrit
                            │            dans `mistakes`
                            │
                   Supabase (Postgres)
                            │
                    App Expo (React Native)
                    → file de révision FSRS + stats
```

Aucune étape manuelle : le même run importe les parties de la journée, puis
analyse tout ce qui reste en `analyzed = false`.

## Structure

| Dossier | Rôle |
| --- | --- |
| `app/` | Application Expo (React Native, TypeScript) |
| `analysis/` | Script d'analyse Python (Stockfish, python-chess) |
| `supabase/migrations/` | Schéma SQL |
| `.github/workflows/` | Cron import + analyse, et tests |

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

Le workflow `pipeline.yml` tourne toutes les 6 heures (à 20 min passées). Il
importe d'abord les nouvelles parties chess.com, puis analyse celles qui restent
en `analyzed = false`. Il peut aussi être déclenché à la main
(`workflow_dispatch`) avec un nombre de parties à traiter.

Le pseudo chess.com n'est pas un secret : il vit dans le workflow
(`CHESS_COM_USERNAME`), avec `IMPORT_TIME_CLASSES` pour les cadences importées.

Une panne de l'API chess.com ne bloque pas l'analyse : l'étape d'import est en
`continue-on-error`, l'analyse tourne quand même, et le job finit rouge pour que
l'échec remonte par mail.

**GitHub désactive les crons d'un dépôt public resté 60 jours sans activité**
(un mail d'avertissement arrive avant). Si le pipeline s'arrête tout seul, c'est
la première chose à vérifier : onglet Actions → le workflow → « Enable ».

En local :

```bash
python -m venv .venv && ./.venv/Scripts/pip install -r analysis/requirements.txt
```

```bash
cd analysis && python test_analysis.py
```

Pour un run réel en local il faut un binaire Stockfish et les variables
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STOCKFISH_PATH`. Les deux étapes
du pipeline se lancent séparément :

```bash
cd analysis && CHESS_COM_USERNAME=ormaniba python import_games.py && python main.py
```

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

**Le SDK est volontairement figé au 54.** Expo Go n'embarque qu'une seule
version du SDK à la fois : monter ce projet plus haut casserait l'autre app
installée sur le même téléphone. Ne pas lancer `npx expo install --fix` après
une montée de version d'Expo sans vérifier ce point. `npx expo install --check`
doit répondre « Dependencies are up to date ».

## Import chess.com

`analysis/import_games.py`, via l'API publique (aucune clé, mais un User-Agent
explicite est obligatoire, sinon 403).

L'import est incrémental et idempotent :

1. on lit la date de la partie la plus récente en base ;
2. on ne télécharge que les archives mensuelles à partir de ce mois inclus
   (le mois courant peut avoir gagné des parties depuis le dernier run) ;
3. on garde `rules = chess` et les cadences de `IMPORT_TIME_CLASSES` ;
4. l'insertion ignore les doublons sur `chess_com_url`, donc réimporter un mois
   déjà traité ne remet aucune partie à analyser et ne duplique rien.

`user_id` n'est pas envoyé : le trigger `games_set_user_id` le remplit depuis
`app_owner`.

Le scénario Make de la V1 n'est plus nécessaire. S'il tourne encore, il fait
double emploi sans casser quoi que ce soit (même contrainte d'unicité), mais
autant le désactiver.

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
