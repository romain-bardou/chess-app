# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Native cross-platform (Expo/React Native): iOS + Android, with a static web
export as a secondary target. No per-OS (Cupertino/Material) divergence is
intended — one unified custom "Atelier" theme across iOS, Android, and web.

## Users

Solo use: the developer trains themselves on their own chess mistakes.
Informal sharing with a few other people (family/friends, each with their own
Supabase account) may follow later, but there is no public or unknown
audience.

## Product Purpose

Turns the user's own chess.com games into a personal, low-effort mistake
trainer. A scheduled pipeline (GitHub Actions, every 6h) imports finished
games from the chess.com API, analyzes them with Stockfish, and files
detected mistakes as puzzles. The app is where those puzzles get reviewed —
spaced repetition (FSRS) picks what to show, the user tries to find the
better move on an interactive board, and stats break performance down by
tactical theme. Success is closing the loop from "I blundered in a real game"
to "I drilled that exact position until it's not a blind spot" with zero
manual data entry.

## Positioning

Unlike generic tactics trainers (chess.com puzzles, Lichess puzzle rush,
Chessable), the puzzles here are not a curated third-party set — they are the
user's own actual blunders, extracted automatically from their own rated
games and scheduled with FSRS like a flashcard deck. Nothing to import or
tag by hand; the pipeline runs unattended and the app only has to surface
what's due.

## Operating Context

- Backend: Supabase (Postgres), one `games` table fed by chess.com import,
  one `mistakes` table fed by the Stockfish analysis step.
- Automation: `.github/workflows/pipeline.yml` runs unattended every 6 hours;
  a chess.com API outage does not block the analysis step (`continue-on-error`
  on import).
- App: Expo/React Native (`app/`), single authenticated owner account.
- Navigation: two tabs, Accueil (`src/features/home`) and Statistiques.
  Accueil is a chooser for the mode to train — today it links only to
  Puzzles (`/puzzles`, a stacked route outside the tab bar); an Ouvertures
  entry will join it once the phase 2 repertoire generator exists (see
  `repertoire_nodes` below). Accueil also links to Réglages (`/settings`, also
  stacked, `src/features/settings`).
- Review flow (`src/features/review`): FSRS-scheduled puzzle queue, custom
  SVG chessboard (`src/chess/Chessboard.tsx`) for attempting/exploring moves.
  Theme filter and review order (by game or random) are no longer in-screen
  controls — they moved to Réglages as persisted defaults
  (`src/lib/settings.ts`); a theme picked from Stats ("train this theme")
  still overrides the default for that session via the `/puzzles?theme=`
  param.
- Stats flow (`src/features/stats`): performance broken down by tactical
  theme.
- Opening repertoire (planned, phase 2): `repertoire_nodes` table exists in
  the schema (FSRS columns, tree via `parent_node_id`) but has 0 rows — no
  generator populates it yet (would pull from the Lichess Opening Explorer:
  Scotch/Écossaise as White, Caro-Kann as Black) and no app-side review flow
  exists for it. Currently only wired into `analysis/main.py`'s book-move
  exception (queried by `fen` + `move_san`, not surfaced in the app).

## Capabilities and Constraints

- Single-owner auth model: one Supabase user, UUID wired in manually via a
  gitignored migration file — not built for self-serve signup.
- `userInterfaceStyle` is light-only by deliberate choice (no dark mode
  currently).
- Piece art currently uses the "ocean" set extracted from chess.com
  (`app/assets/images/pieces/ocean/`) — not freely licensed. Acceptable
  because distribution stays informal (no App Store / Play Store); revisit
  if that changes.
- Not planned for public app-store distribution; informal sharing (e.g.
  TestFlight-style, a shared APK) with a few people is possible later.

## Evidence on Hand

- `README.md` (repo root) documents the pipeline and setup steps.
- `supabase/migrations/` is the source of truth for the data schema.
- No test users, testimonials, or external evidence — single-user tool.

## Product Principles

- Zero manual effort for data entry: the pipeline owns import and analysis;
  the app only ever surfaces what's already computed.
- Train on your own mistakes, not someone else's curated puzzle set — realism
  over polish of the puzzle content itself.
- Spaced repetition drives what's shown; the user doesn't triage their own
  review queue.
- Solo tool first: correctness and personal usefulness outrank
  shareability or onboarding polish.
