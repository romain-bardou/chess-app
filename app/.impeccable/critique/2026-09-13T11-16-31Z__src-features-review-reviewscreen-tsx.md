---
target: src/features/review/ReviewScreen.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-13T11-16-31Z
slug: src-features-review-reviewscreen-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | `run.waiting` (opponent-reply/intro-delay windows) gives zero visual cue — the board just stops responding for ~450-550ms. |
| 2 | Match System / Real World | 4/4 | Natural French chess vocabulary throughout; no translated-literally awkwardness. |
| 3 | User Control and Freedom | 2/4 | No skip/abandon mid-solve; only exit is answering right or wrong. |
| 4 | Consistency and Standards | 4/4 | `Button`/`Chip`/`Panel` primitives and success/error color mapping used uniformly, matching DESIGN.md exactly. |
| 5 | Error Prevention | 2/4 | A failed `saveReview` isn't prevented from being silently lost — "Carte suivante" stays enabled regardless. |
| 6 | Recognition Rather Than Recall | 3/4 | `LineFilter` chips styled identically to the persistent `ThemeFilter`/`OrderFilter` chips above, inviting confusion about global vs. per-card scope. |
| 7 | Flexibility and Efficiency | 2/4 | Auto-play toggle and shuffle/by-game order are real, but no way to speed past intro/reply animations or skip a known card. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Solving phase is clean; the wrong-answer `Outcome` panel stacks ~9-10 elements in one undivided block. |
| 9 | Error Recovery | 1/4 | `queue.error`/`saveError` render raw untranslated JS error strings with no retry affordance. |
| 10 | Help and Documentation | 3/4 | No formal docs, but contextual micro-copy (`review.prompt`, `review.exploreHint`) does real just-in-time-help work for this solo, already-onboarded audience. |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: Not generic. French chess-domain copy, a FEN-driven board whose wood-grain gradients literally share pigments with the UI's success/selection colors, and multi-move puzzle/replay/explore machinery are all authored specifically for this product. An unrelated app could reuse the `Panel`/`Button`/`Chip` shells but not this screen's actual interaction model (intro-delay reveal, line-filter, branch-and-explore) unchanged.

**Deterministic scan**: `detect.mjs --json src/features/review/ReviewScreen.tsx` — exit 0, `[]`, clean. Secondary mechanical pass: no hardcoded color literals (all route through `Colors.*`), no unused imports/dead code, no Unicode-glyph-as-icon (confirmed the recent `StepButton` SVG-chevron fix removed that anti-pattern entirely), accessibility present on the file's one raw `Pressable`. One low-confidence note: the `StepButton` SVG's `22`px width/height numerically equals `Radius.lg` (22) — flagged but judged a coincidence, not a missed token reference (different semantic quantities).

**Visual overlays**: not available. Target is a native RN screen with no DOM; the project's secondary static web export currently crashes at build (`window is not defined` in the Supabase client during Expo Router's SSR step, unrelated to this UI). No live browser evidence could be gathered.

## Overall Impression

The solving phase is close to ideal — clean hierarchy, real domain specificity, a genuinely well-judged intro beat. Everything the checklist flags concentrates in one place: the wrong-answer `Outcome` panel, which abandons the app's own restraint by dumping ~10 controls into one undivided block the instant a user needs it least.

## What's Working

- **The Wood Grain Rule is actually implemented, not just documented**: `Colors.selected`/`Colors.legal`/`Colors.lastMove` in `atelier.ts` are literally reused as board overlay colors in `Chessboard.tsx`, and `Colors.success` doubles as the theme-accuracy semantic — verifiable cross-system coherence a generic app couldn't copy without inventing its own board palette.
- **The intro-delay reveal** (`usePuzzleRun`, `INTRO_DELAY_MS`) separates "orient yourself" from "the clock is running" — respects how chess players actually study a position, directly serving PRODUCT.md's "closing the loop from blunder to drilled."
- **`useLineReplay.explore()`** turns the post-mortem into a real analysis tool (branch off any point, `reset` to snap back) rather than a static "here's what you should have played."

## Priority Issues

**[P1] LineFilter can show an unselected chip while a different, unlabeled line is actually playing.**
- Why it matters: `replaySource` defaults to `'punishment'`. If a mistake has no `solution` and an empty `punishment_pv`, only the "Ma tentative" chip renders — unselected — while the board replays the `'punishment'` branch anyway. Violates visibility-of-system-status exactly where trust matters most.
- Fix: derive the initial `replaySource` from which flags are actually true (fall back to `'attempt'` when neither solution nor punishment exists), not a hardcoded `'punishment'`.
- Suggested command: `/impeccable harden`

**[P1] Outcome panel violates single-focus/progressive-disclosure on every wrong answer.**
- Why it matters: grade, gain, played/expected move, a 3-way line selector, a hint, step controls, two line-action buttons, an autoplay toggle, theme chips, and Next all render at once, ungrouped — the highest-frequency negative moment in the app, and the place the Atelier "restraint" principle is most visibly abandoned.
- Fix: show verdict + grade + played/expected immediately; gate line-selector/replay/explore tooling behind a "voir la suite" affordance, or at minimum insert a hairline divider between "what happened" and "explore it."
- Suggested command: `/impeccable distill`

**[P1] A failed `saveReview` is silently recoverable-looking but isn't.**
- Why it matters: the entire product is FSRS scheduling built on review history — an un-persisted grade corrupts the one thing PRODUCT.md says the app exists to do, and the failure caption sits below an already-long panel with `queue.advance` never blocked.
- Fix: add a visible retry action tied to the error, and/or disable/warn on "Carte suivante" while `saveError` is set.
- Suggested command: `/impeccable harden`

**[P2] No mid-solve skip for a long backlog.**
- Why it matters: with queues of up to 60 cards, a returning user facing a stale/ambiguous position has no graceful way past it, working against the product's own "solo, low-effort" positioning.
- Fix: add a low-emphasis secondary "Passer" action near the prompt.
- Suggested command: `/impeccable adapt`

**[P3] `run.waiting` has no visual cue.**
- Why it matters: a ~500ms unexplained freeze on the board reads as a bug on first impression.
- Fix: a brief low-opacity board overlay while `waiting` is true.
- Suggested command: `/impeccable polish`

## Persona Red Flags

**Alex (Power User)**: `LineFilter` chips use the exact same `Chip` visual language as the persistent `ThemeFilter`/`OrderFilter` chips higher up, with no distinction beyond location — at speed, easy to mistake a per-card line selector for a global filter that just changed. No way to compress the ~190ms move animation + 450-550ms reply-delay pair replayed on every card.

**Riley (Stress Tester)**: Rapid-tapping the board during `run.waiting` produces no feedback (`interactive` silently drops false). A card missing both `solution` and `punishment_pv` reproduces the P1 LineFilter mismatch directly: one unselected chip next to a board quietly replaying an unlabeled line.

**Casey (Distracted Mobile)**: `review.exploreHint` explaining the post-miss board becomes a free two-sided sandbox is 13px muted Label copy, easy to skim past — Casey may start dragging pieces without realizing exploration mode is active. Step-back/forward chevrons sit only 8px from the replay/reset buttons below — tight adjacency for mis-taps on a moving bus.

## Minor Observations

- `review.remaining`'s "{count} carte(s)" — a literal parenthetical plural, worth a pass if English is ever added.
- `mistake.themes` chips at the bottom of `Outcome` reuse the tappable `Chip` component with no `onPress` — visually implies tappability it doesn't have.
- `StepButton`'s 44×44 target correctly meets the native minimum touch-target size.
- The two empty-state copies (`review.emptyBody` vs `review.emptyThemeBody`) correctly distinguish "nothing due at all" from "nothing due on this theme."

## Questions to Consider

- Given every failing checklist item concentrates in the wrong-answer state, would the core learning loop improve — not just look calmer — if the verdict shipped first and the explore/replay tooling required one tap to reveal?
- If FSRS accuracy is the entire value proposition, why does a failed `saveReview` degrade to a caption instead of gating "Carte suivante"?
- The board silently switches from "solve carefully" to "play anything, both colors" after a miss with only a small caption marking the change — would a small, Atelier-consistent visual shift make that mode switch legible without breaking the flat aesthetic?
