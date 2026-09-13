---
name: Atelier
description: Personal chess-mistake trainer — warm wood-toned board, flat bordered UI, light-only.
colors:
  walnut-brown: "#8B5E34"
  cream-ink: "#F7F1E3"
  warm-parchment: "#F7EFE2"
  ivory-surface: "#FFFBF3"
  soft-tan: "#E0CFB4"
  espresso: "#3B2412"
  muted-taupe: "#7A6349"
  moss-green: "#4C7A3F"
  burnt-terracotta: "#A3402C"
  board-light-from: "#E3C79A"
  board-light-to: "#D2AD76"
  board-dark-from: "#8B5E34"
  board-dark-to: "#6E4623"
  selection-moss: "rgba(76, 122, 63, 0.45)"
  legal-espresso: "rgba(59, 36, 18, 0.28)"
  last-move-amber: "rgba(204, 160, 60, 0.45)"
  piece-shadow: "rgba(0, 0, 0, 0.45)"
typography:
  title:
    fontFamily: "System default (San Francisco / Roboto / system-ui)"
    fontSize: "26px"
    fontWeight: 700
  heading:
    fontFamily: "System default (San Francisco / Roboto / system-ui)"
    fontSize: "19px"
    fontWeight: 700
  body:
    fontFamily: "System default (San Francisco / Roboto / system-ui)"
    fontSize: "16px"
    fontWeight: 400
  label:
    fontFamily: "System default (San Francisco / Roboto / system-ui)"
    fontSize: "13px"
    fontWeight: 600
  mono:
    fontFamily: "System default (San Francisco / Roboto / system-ui)"
    fontSize: "15px"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.walnut-brown}"
    textColor: "{colors.cream-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.walnut-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  panel:
    backgroundColor: "{colors.ivory-surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.ivory-surface}"
    textColor: "{colors.muted-taupe}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  chip-selected:
    backgroundColor: "{colors.walnut-brown}"
    textColor: "{colors.cream-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
---

# Design System: Atelier

## Overview

**Creative North Star: "L'Établi du Luthier" (The Luthier's Workbench)**

Atelier is a solo instrument, not a showcase: one person sitting down with their own chess mistakes, the way a luthier sits at a workbench with a single instrument in front of them. The palette is warm, wood-grained, and restrained — a single walnut accent against parchment and ivory, the same materials that build the chessboard itself. Surfaces are flat and hairline-bordered rather than shadowed or glossy: nothing floats, nothing performs. Every panel, chip, and button is cut from the same plain stock, in service of the board, which is the one place the app allows itself a flourish (a diagonal wood-grain gradient on every square).

The app is deliberately light-only — no dark mode, no per-OS Material/Cupertino divergence — because it is one tool for one craftsperson, tuned once rather than adapted per visitor. Typography stays on the system default everywhere; the only "custom" typographic gesture is a small monospace-flavored label role reserved for theme names and notation-adjacent text.

**Anti-reference:** not a cold blue/gray SaaS dashboard, not a playful/gamified tactics-trainer aesthetic (no badges, mascots, or saturated gamification color), no dark mode.

**Key Characteristics:**
- One saturated accent (Walnut Brown) on an otherwise warm-neutral palette — sparse, not omnipresent.
- Flat, hairline-bordered surfaces; no drop shadows anywhere in the system.
- System font only, no custom typeface.
- Light-only; no dark-mode variant exists or is planned.
- The chessboard is the signature component: diagonal (155°) wood-grain gradients per square, animated piece travel, and overlay colors that deliberately reuse the UI's own semantic colors (see The Wood Grain Rule below).

## Colors

Warm, low-saturation, wood- and paper-toned; one accent carries all emphasis.

### Primary
- **Walnut Brown** (`#8B5E34`): the only saturated accent. Used on primary buttons, selected chips, and as the origin tone of the board's dark-square gradient — the UI's accent color and the board's wood are the same pigment.

### Secondary
- **Moss Green** (`#4C7A3F`): correct-answer state (the "Correct!" heading, positive theme-accuracy bar fill). Its exact RGB also drives the board's selected-square overlay at 45% opacity — success and "this is your active square" share one hue.

### Tertiary
- **Burnt Terracotta** (`#A3402C`): incorrect-answer state (the "Incorrect" heading, error text, low-accuracy bar fill). Reserved for negative/attention states only — never decorative.

### Neutral
- **Warm Parchment** (`#F7EFE2`): app background, splash background, Android adaptive-icon background.
- **Ivory Surface** (`#FFFBF3`): panels, cards, chip fill, theme-row background — the "paper" every component sits on.
- **Soft Tan** (`#E0CFB4`): hairline borders, dividers, and the empty track behind progress bars.
- **Espresso** (`#3B2412`): primary text color, black pieces, and (as `rgba(59, 36, 18, 0.28)`) the legal-move overlay on the board.
- **Muted Taupe** (`#7A6349`): secondary/muted text — captions, labels, metadata lines.
- **Cream Ink** (`#F7F1E3`): text on top of Walnut Brown (button labels, selected-chip labels) and doubles as the white piece fill — the UI's "light neutral" and the board's white pieces are the same tone.

### Named Rules
**The One Accent Rule.** Walnut Brown is the only saturated color that isn't semantic (success/error). It appears on primary actions, selection state, and the single most actionable number on a stats surface (e.g. Stats' "Dues" tile, marking what to act on now) — never as decoration or background fill, and never on more than one number at a time.

**The Wood Grain Rule.** Every board square is a 155°-angled two-stop linear gradient, not a flat fill: light squares run `#E3C79A → #D2AD76`, dark squares run `#8B5E34 → #6E4623`. Board overlays (selected square, legal-move markers, last-move highlight) are translucent reuses of Moss Green, Espresso, and a dedicated amber (`rgba(204, 160, 60, 0.45)`) respectively — the board never introduces a color the rest of the UI doesn't already use.

## Typography

**Display/Body/Label Font:** System default (San Francisco on iOS, Roboto on Android, system-ui on web) — no custom typeface is loaded anywhere in the app.

**Character:** Plain and utilitarian by choice. The five roles differ only in size and weight; there is no display serif or decorative face competing with the board.

### Hierarchy
- **Title** (700, 26px): screen titles ("Réviser", "Statistiques") and the large numeric value in a stat tile.
- **Heading** (700, 19px): section headers inside panels, the "Correct"/"Incorrect" outcome banner.
- **Body** (400, 16px): default running text — prompts, move descriptions, empty-state copy.
- **Label** (600, 13px): button labels, chip labels, muted captions and metadata (no uppercase transform).
- **Mono** (600, 15px): reserved for the theme-name line on a stats theme row — the one spot text reads like a tag/notation rather than prose.

### Named Rules
**The No-Custom-Face Rule.** Never introduce a font family. Every text role is a size/weight variation on the platform system font.

## Layout

Single-column, vertically stacked screens inside a `SafeAreaView`, with `Spacing.md` (16px) horizontal page padding and no grid system — this is a phone-first, one-thing-at-a-time flow, not a dashboard. Filter rows (theme chips, order-of-review chips) are horizontally scrolling `ScrollView`s that never wrap onto the main vertical rhythm. The board is always centered and capped at 440px so it reads the same on a phone and on a tablet's `supportsTablet` iOS build. Vertical rhythm runs almost entirely on the `Spacing` scale (4/8/16/24/32px): `sm` between a label and its value, `md` between unrelated blocks, `lg` before a new major section.

## Elevation & Depth

Flat by design — no shadows anywhere in the system. Depth is conveyed only through a hairline border (`StyleSheet.hairlineWidth`, Soft Tan) separating a surface from the parchment background behind it, plus the Ivory-Surface-vs-Warm-Parchment tonal step. Pressed states use opacity (0.6–0.7), not elevation change.

### Named Rules
**The Flat-By-Default Rule.** No `box-shadow`/`elevation` is used on any component. A component reads as "raised" only through its hairline border and the surface/background tonal contrast — never through a shadow.

## Shapes

Two radius steps beyond the board's own corner: `Radius.md` (14px) for panels, cards, and theme rows; `Radius.lg` (22px) for pill-shaped buttons and chips. The board itself uses the smaller `Radius.sm` (8px) — just enough to soften its corners without looking like a UI card. Progress-bar tracks use a much smaller manual radius (3px) matched to their 6px height. Borders are always `StyleSheet.hairlineWidth` — never a heavier stroke.

## Components

### Buttons
- **Shape:** pill (22px radius), centered label, generous horizontal padding (24px) so the tap target reads as deliberate rather than compact.
- **Primary:** Walnut Brown fill, Cream Ink label — the highest-emphasis action on a screen (submit, next puzzle, retry).
- **Secondary:** transparent fill, 1px Walnut Brown border, Walnut Brown label — used for reversible/secondary actions (replay controls, sign out, "show solution" alternates) so it never competes with the primary action's weight.
- **Pressed / Disabled:** both states share one treatment — 0.6 opacity. No color shift, no scale change.

### Chips
- **Style:** Ivory Surface background, 1px Soft Tan border, Muted Taupe label (unselected) — reads as a quiet, always-visible filter pill.
- **Selected:** Walnut Brown fill and border, Cream Ink label — the same accent/text pairing as the primary button, so "selected" and "primary action" feel like the same kind of emphasis.

### Cards / Panels
- **Corner Style:** 14px radius.
- **Background:** Ivory Surface against the Warm Parchment page background.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** 1px hairline, Soft Tan.
- **Internal Padding:** 16px (`Spacing.md`).

### Stat Tile (Metric)
A bare vertical pair with no container of its own: a Title-weight number over a muted Label caption, laid out in a flex row of up to three per panel. No background, no border — it borrows the parent Panel's surface. One tile per screen may set its number in Walnut Brown instead of Espresso to mark the single actionable figure (see The One Accent Rule) — every other tile stays on the default text color.

### Theme Progress Row
The stats-screen signature: a pressable Panel-shaped row (theme name in Mono, accuracy percentage in muted Label) over a 6px-tall progress track. The track background is Soft Tan; the fill is Moss Green above 60% accuracy and Burnt Terracotta below — the only place in the UI where a numeric threshold directly drives color.

### Chessboard (signature component)
A custom `react-native-svg` board, not an image: each square is its own gradient-filled `<Rect>`, pieces are PNG glyphs (the "ocean" set) positioned in SVG space, and moves animate as a 190ms eased translation of the moving piece rather than an instant position swap. Interaction overlays (selection, legal-move dots/rings, last-move highlight) are translucent rects/circles layered on top — see The Wood Grain Rule. The board is a controlled component: it never plays a move itself, only reports intent and waits for a new `fen`.

## Do's and Don'ts

### Do:
- **Do** keep Walnut Brown to primary actions and selection state — it stays legible as "the one thing to press" precisely because it's rare (The One Accent Rule).
- **Do** build new surfaces from the existing primitives (`Screen`, `AppText`, `Panel`, `Button`, `Chip`, `Toggle`) in `src/components/ui.tsx` rather than one-off styling.
- **Do** use hairline borders + tonal surface steps for any new "raised" element, never a shadow.
- **Do** reuse Moss Green / Burnt Terracotta for any new success/error state rather than introducing a new semantic color.

### Don't:
- **Don't** add a dark-mode variant or branch on system color scheme — `userInterfaceStyle` is deliberately `light`.
- **Don't** add `box-shadow`/`elevation` styling anywhere; depth comes from borders and tone only (The Flat-By-Default Rule).
- **Don't** introduce a custom font family or a second accent color — the palette is deliberately one accent plus two semantic colors.
- **Don't** give the board a color the rest of the UI doesn't already use — new board overlays should reuse an existing token (The Wood Grain Rule).
