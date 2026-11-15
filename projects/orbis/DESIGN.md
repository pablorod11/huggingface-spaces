---
name: Orbis
description: A complete view of infrastructure economics and capacity.
colors:
  ink: "#242725"
  ivory: "#f6f4ef"
  cobalt: "#284fc9"
  paper: "#fffefa"
  border: "#dfdfd7"
  muted: "#666b66"
typography:
  display:
    fontFamily: Manrope
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  body:
    fontFamily: Manrope
    fontSize: 14px
    lineHeight: 1.6
rounded:
  panel: 8px
  control: 6px
spacing:
  xs: 8px
  sm: 12px
  md: 20px
  lg: 24px
  xl: 32px
---

# Orbis design system

## Direction
Operate mode: an editorial analytical workspace. The composition connects allocated infrastructure, business outcomes and a complete view of the same scope. The name Orbis replaces Ledgerline in visible branding; technical storage keys and protocol identifiers remain compatible.

The user selected warm ivory, graphite and cobalt. A shared visual family connects Orbis to Veyra through typography, colors, spacing and precision. The user rejected the first literal circular symbols. The final identity is a typography-led wordmark in outlined Manrope, with a cobalt `i` as its small distinguishing signal. The favicon is an `ob` typographic monogram. Perfect-circle inspiration now informs rounded counters, balance and spacing rather than surrounding rings or targets. The sidebar has no orbital illustration.

## Tokens
| Role | Value |
| --- | --- |
| Ground | `#f6f4ef` |
| Surface | `#fffefa` |
| Ink | `#242725` |
| Secondary text | `#666b66` |
| Structural line | `#dfdfd7` |
| Control outline | `#c4c7bd` |
| Accent / main data | `#284fc9` |
| Type | Self-hosted Manrope, variable 200–800; body 14px / 1.6 |
| Page heading | 30px / 600, −0.035em; mobile 26px |
| Section heading | 16px / 650 |
| Metric | 24–34px / 500, tabular numerals |
| Panel / control radius | 8px / 6px |
| Spacing | 4px base; 20–24px panels; 32px desktop canvas gutters |

## Composition and behavior
At widths above 1100px, a 224px navigation rail carries the audience tabs; a quiet typographic footer closes its lower edge. Main content uses the remaining width with 32px gutters. Filters stay above the analytical canvas. The current scope and source always remain visible. Tablet folds the navigation into a horizontal row; phone uses the existing labeled view selector and expandable filters. Touch controls are at least 44px high.

Metrics use a divided typographic band rather than individual icon tiles. White panels contain evidence and charts. Cobalt marks the primary chart series; gray comparisons retain dash/dot patterns. Exceptions preserve semantic severity colors and explicit text. Primary actions use graphite. No gradients, shadows, decorative animation or fabricated data. Focus rings are cobalt; native controls and existing keyboard interactions remain intact.

`src/styles.css` retains the functional component foundations and responsive rules. `src/orbis.css` owns the replacement visual identity and shell. Brand assets and font live in `assets/`. Manrope is sourced from the official Google Fonts repository; its SIL Open Font License is bundled in `assets/fonts/OFL.txt`.

## Verification
Check executive, capacity and vendor views, filters, investigation return, Workspace, save-view dialogs, keyboard focus, mobile overflow and print. Verify the companion serves only explicitly allowlisted public font/brand assets. Existing analytics and state regression suites remain authoritative for behavior.
