---
target: src/features/stats/StatsScreen.tsx
total_score: 24
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 1
timestamp: 2026-09-13T11-16-37Z
slug: src-features-stats-statsscreen-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | `load()` only runs on mount; Expo Router tabs stay mounted, so returning from a Review session shows frozen numbers. |
| 2 | Match System / Real World | 3/4 | Domain-correct French labels ("Jamais tentée" instead of "0%"), severity vocabulary matches chess.com convention. |
| 3 | User Control and Freedom | 2/4 | "Se déconnecter" fires immediately on tap, no confirm, no undo. |
| 4 | Consistency and Standards | 4/4 | Zero one-off styling; every value traces to `Colors`/`Spacing`/`Radius`/shared primitives, matching DESIGN.md's threshold rule exactly. |
| 5 | Error Prevention | 2/4 | Same sign-out gap as #3: the screen's only irreversible action has no guard. |
| 6 | Recognition Rather Than Recall | 3/4 | Bar + fill + % label removes need to remember prior state; 8 KPI numbers share identical weight so nothing marks which one matters. |
| 7 | Flexibility and Efficiency | 2/4 | Weakest-first sort is a real win, but no filter/re-sort once the theme list grows, no shortcut to "themes with cards due now." |
| 8 | Aesthetic and Minimalist Design | 3/4 | Styling itself is restrained per Atelier, but information volume (8 numbers + 3 counts + N rows, one scroll) works against minimalism. |
| 9 | Error Recovery | 3/4 | Retry present on error and empty states; error body shows the raw thrown message rather than a designed one (acceptable trade-off for a solo dev). |
| 10 | Help and Documentation | n/a | Genuinely inapplicable — single-owner Operate-mode tool; the one user is the app's author. |
| **Total** | | **24/36** | **Acceptable (67%)** |

## Design Specificity Verdict

**LLM assessment**: Clearly authored for this product. The chess-theme taxonomy, FSRS-specific vocabulary ("Dues"), and the exact 60%-threshold moss/terracotta split match DESIGN.md's named "Theme Progress Row" rule verbatim — an unrelated product could not reuse this screen without stripping domain content and undoing that rule.

**Deterministic scan**: `detect.mjs --json src/features/stats/StatsScreen.tsx` — exit 0, `[]`, clean. Secondary mechanical pass: no hardcoded color literals (danger/success threshold at line 199 uses theme tokens, only the `0.6` cutoff itself is a bare numeric literal with no named constant); `track`/`fill` radii (6px/3px) and `pressed` opacity (0.7) are magic numbers that don't match any existing `Spacing`/`Radius` token value, so not token duplication, just ungoverned constants; no unused imports/dead code; no Unicode-glyph-as-icon; `ThemeRow`'s `accessibilityLabel` confirmed dynamically composed per-row (the recent theme-name + rate fix), not static/generic.

**Visual overlays**: not available, same reason as ReviewScreen — native RN screen, no DOM, and the project's web export currently crashes at build (unrelated SSR bug in the Supabase client).

## Overall Impression

The severity/theme data model and its weakest-first sort are the screen's actual intelligence — a real design decision, matching the documented system precisely. But the screen frontloads two dense KPI panels before the one list that answers the question the user actually opened it for ("what do I train next"), and it never refreshes after a training session closes the loop it exists to measure.

## What's Working

- **Weakest-first sort + threshold color-coding** does the user's prioritization for them and is implemented exactly per DESIGN.md's Named Rule — the screen's actual design intelligence, not decoration.
- **Total primitive discipline**: `Panel`/`AppText`/`Button`/`EmptyState`/`Loader` cover the entire surface; nothing bypasses the token system.
- **`ThemeRow`'s composed `accessibilityLabel`** (`"<theme>, <rate>. S'entraîner sur ce thème"`) shows deliberate accessibility authorship — notably better than the plainer `Metric` component two panels above it on the same screen.

## Priority Issues

**[P0] Stats never refresh on tab focus.**
- Why it matters: `load()` runs only in a mount-time `useEffect`; Expo Router tab screens stay mounted across switches. The one screen meant to prove "blundered → drilled until fixed" is the one screen that shows stale numbers right after the user trains a theme and taps back.
- Fix: refetch on focus (`useFocusEffect` from `@react-navigation/native`, calling `load()`), keep the mount-time call as first-paint fallback.
- Suggested command: `/impeccable harden`

**[P1] Theme list has no progressive disclosure.**
- Why it matters: every theme with ≥1 card renders as a full row in one continuous scroll (realistically 15-25+ given the theme taxonomy) — turns the primary decision into a long scan instead of a bounded choice, failing the ≤4-choices checklist item exactly where it matters most.
- Fix: show the worst 5-8 by default with a "Voir plus" expander; consider separating `rate === null` ("Jamais tentée") rows into a visually distinct, de-prioritized group since they aren't performance data yet.
- Suggested command: `/impeccable distill`

**[P2] Sign-out is one unconfirmed tap below the last theme row.**
- Why it matters: after scrolling a long, same-shaped list, a fast or distracted tap can log the user out with no recovery step short of re-authenticating; visually it reads as "just another row."
- Fix: wrap in a native confirm (`Alert.alert`) before calling `signOut()`, and/or add a visual break so it stops reading as part of the list.
- Suggested command: `/impeccable harden`

**[P3] No typographic priority among 8 equal-weight KPI numbers.**
- Why it matters: "Dues" (answers "is there anything to do right now") carries the same 26px/700 weight as "Parties analysées" (a purely contextual count) — nothing tells the eye which number to look at first.
- Fix: give the one or two decision-driving numbers stronger treatment (accent color, or pull out of the 3-up grid); demote the rest.
- Suggested command: `/impeccable typeset`

**[P4] Long/untranslated theme names have no overflow guard.**
- Why it matters: `themeHeader` is a row with `justifyContent:'space-between'` and no `flexShrink`/`numberOfLines` on either child — a long French translation, or a raw camelCase fallback key for any theme missing from `fr.json` (realistic given the pipeline auto-tags mistakes), can push the accuracy % off the row or force ugly wrapping.
- Fix: give the theme-name `AppText` `numberOfLines={1}` + `flexShrink:1`.
- Suggested command: `/impeccable polish`

## Persona Red Flags

**Alex (Power User)**: Finishes a themed review, taps back to Stats — `global.due`, overall accuracy, and every `ThemeRow` still show pre-session values (P0), exactly the moment confirmation is wanted most. The list sorts by weakness only, not filtered by `row.due > 0`, so Alex still has to eyeball the small `themeMeta` line under each bar to find which weak themes actually have cards ready.

**Sam (Accessibility-Dependent)**: `Metric` (used 8 times) has no composed `accessibilityLabel` — VoiceOver/TalkBack announces value and caption as two separate stops, inconsistent with `ThemeRow` on the same screen, which composes correctly. The progress-bar `View`s carry no `accessibilityRole="progressbar"`/`accessibilityValue` — a missed chance given the row is otherwise well-built for accessibility.

**Casey (Distracted Mobile)**: The sign-out pill sits directly beneath the last `ThemeRow` with identical spacing rhythm and press feedback to any section gap — nothing distinguishes "administrative, irreversible action" from "just another row" (ties to P2). No pull-to-refresh: if Casey suspects the numbers are stale (they may well be, per P0), there's no quick gesture to check.

## Minor Observations

- `formatPercent` rounds with no sample-size signal: 1/1 (100%) reads visually identical in confidence to 50/53 (94%) — only the small muted `themeCards` line hints at volume.
- The `<View style={styles.metric} />` dummy spacer, while now commented, is a fragile pattern; a small grid primitive would remove the need for the comment entirely.
- `void signOut()` has no try/catch anywhere in the call chain — a network failure during sign-out surfaces as a silent unhandled rejection with no user feedback.
- No `RefreshControl` on the `Screen scroll` ScrollView — a reasonable stopgap even after fixing the focus-refetch issue.
- Accuracy-sort ties fall back to array stability (original RPC order, cards desc) — reasonable but silent.

## Questions to Consider

- If this dashboard's whole reason to exist is "tell me what to drill next," why do two dense KPI panels and 8 numbers come before the one list that actually answers that question?
- Is "weakest-first, unqualified by sample size" really the right default once there are 20+ themes — should a theme seen once at 0% really outrank one seen 50 times at 20%?
- The product's stated success metric is closing the loop from blunder to drilled — why is the one screen meant to prove that loop closed the one screen that doesn't refresh when the user comes back from doing the drilling?
