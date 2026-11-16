---
name: Veyra Security Workbench
description: A precise browser-local security assessment workbench.
colors:
  ink: "#242725"
  ivory: "#f6f4ef"
  cobalt: "#284fc9"
  paper: "#fffefa"
  raised: "#eeece5"
  border: "#d7d8cf"
  muted: "#62665f"
  danger: "#a33333"
typography:
  display:
    fontFamily: Manrope
    fontSize: "clamp(30px, 2.7vw, 42px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  body:
    fontFamily: Manrope
    fontSize: 14px
    lineHeight: 1.7
  label:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 650
rounded:
  panel: 8px
  control: 6px
spacing:
  xs: 8px
  sm: 12px
  md: 20px
  lg: 28px
  xl: 44px
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
---

# Veyra design system

Veyra is the renamed security product. It shares its typography and material palette with Orbis and uses an open typographic wordmark. The product is an operating workbench: readable evidence, restrained surfaces, and clear actions determine the composition.

## Colors

| Role | Value |
| --- | --- |
| Page / warm ivory | #f6f4ef |
| Primary ink / graphite | #242725 |
| Accent / cobalt | #284fc9 |
| Paper surface | #fffefa |
| Secondary surface | #eeece5 |
| Navigation surface | #eeeee7 |
| Hairline | #d7d8cf |
| Secondary ink | #62665f |
| Accent background | #edf0fc |
| Error ink | #a33333 |
| Panel radius | 8px |
| Control radius | 6px |

Self-hosted Manrope variable font (200–800) is the primary face. Body copy is 13–14px, supporting text 11–12px, page headings 30–42px. Weights 500–700 communicate hierarchy. Monospace is reserved for source input. Numerals use tabular alignment. Heading tracking is between -0.025em and -0.035em.

The user rejected the first literal concentric-circle symbols. The final live identity reads “veyra” as outlined lettering with “Security workbench” below. The print lockup uses the same letter outlines. The compact favicon is an angular, open V with a cobalt terminal. Circle inspiration belongs to balanced proportions and rounded type counters; there are no enclosing rings, targets, shields or decorative security insignia.

## Layout

A 244px warm-gray navigation rail anchors the desktop frame. The content area has 44px gutters, a quiet utility header, and an explicit local-storage notice. Editorial guidance is followed by the assessment register. Guidance and optional tools use native disclosure. Panels have 1px boundaries without decorative shadows; dialogs and transient notices have restrained elevation.

Primary actions use graphite; cobalt marks selected navigation, working tabs, linked assessment names, and key counts. Secondary actions have paper surfaces and graphite text. Errors use red text and do not depend on color alone. Hover, focus, disabled, busy, empty, error, and populated states use the same light material system.

At 800px, headings and actions stack. At 700px, navigation becomes a compact top frame, tables become labeled records, form columns collapse, and all inputs use 16px text to prevent mobile zoom. Controls retain 44px mobile targets. Long names and evidence wrap; tab rows and perspective strips can scroll locally.

Motion is limited to brief 100–140ms button feedback; reduced-motion disables transitions and press scaling. Selection, caret, scrollbar, and native color scheme are themed. Focus uses a 2px cobalt outline with offset.

Printed reports use white paper, graphite type, outlined Veyra wordmark branding, deliberate type hierarchy, and preserved report content. Interactive chrome is hidden. CSP remains unchanged: every shipped asset is local.


## Protocol context

The optional study inset keeps a native disclosure and labelled protocol selector. Above 1100px, a reading column contains the summary, boundaries, questions and learning references; a narrower column groups unsaved workbook draft actions. A single hairline separates the columns. At intermediate widths the groups stack and actions use two columns; below 600px, controls form one full-width column. The 23px topic heading follows the existing section-heading scale. Visible action text is also its accessible name. Prompt drafts open at the start of Expected result. Existing storage and save behavior remain unchanged.
