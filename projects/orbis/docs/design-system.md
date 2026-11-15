# Ledgerline dashboard design

This is an operating workspace for infrastructure and business decisions. Refinements preserve the native JavaScript/CSS stack, fixed global scope, explicit synthetic/source context, and inspectable analytical evidence.

## Hierarchy

Each tab presents its title and source window, four existing KPI summaries, then expanded cohort alerts and detailed analytical panels. No warning is collapsed or removed to make room for metrics. Desktop alerts use two columns with cohort identity, observed evidence and an Inspect action. Counts retain View all access to each full list.

## Visual language

- Ink: `#223c43`; secondary text: `#5e7277`; teal interaction: `#087f8c`.
- White analytical surfaces on `#f5f7f7`; alerts nearwhite `#fffdfa` with a warm one-pixel boundary.
- Severity uses existing labeled good/warning/critical badges, not color alone.
- Existing local system sans stack; no font download. Desktop KPI label/value/note sizes are 13/32/12px. Panel headings are 16px; secondary copy stays readable without competing with measurements.
- Tabular numerals, right-aligned quantitative columns, left-aligned cohort/provider labels. Drill actions share the existing text-link treatment. Tables keep horizontal scrolling rather than compressing evidence into unreadable columns.
- Visible focus, selection and caret colors use the teal palette. Existing reduced-motion support remains; no decorative animation was added.

## Responsive behavior

Below 700px, dashboard audience is a native select and Filters exposes the scope controls. The persistent summary lists every dimension. The Period select uses 16px text and a 44px minimum height. Expanded filters are height bounded and scroll internally; fixed popups reposition on resize and filter-container scroll and remain inside the viewport on short screens. Escape closes disclosures and returns focus. Coarse-pointer rules enlarge compact interaction targets without widening desktop data tables.

The native save-view dialog retains its modal/focus behavior with proper content insets. Dialog and popup scrolling stays contained. Empty/recovery paths, analytical disclaimers, bookmarks, exports and companion controls retain their existing semantics.

## Verification scope

The v2.3 pass was inspected at desktop, tablet, phone and short-landscape sizes in the available browser. Physical iOS/Android, additional browser engines and screen-reader devices were not tested. The mechanical detector reported one intentional pre-existing tab underline; it is a selection marker on square navigation tabs, not a rounded-card accent. Runtime checks, rather than the detector alone, establish the verified behavior.


## Complete-flow polish in v2.4

KPI strips use two columns through 1000px, and medium-width global filters wrap so Reset stays visible. Vendor IDs, owners and agreement references wrap within bounded columns. Focus indicators stay inside tabs and scroll regions; investigation titles and actions can wrap together.

Charts use solid CPU, dashed memory and dotted storage lines with matching legend samples. Null-only plots explicitly abstain while keeping inspectors and tables; observed zero remains plotted. Table regions have accessible names and keyboard scrolling; chart column headers remain visible while scrolling.

Workspace navigation and main-form rerenders restore useful focus. Pending source/companion operations announce progress, disable repeat initiators and end with terminal feedback. Disconnect invalidates pending source results. Failed replacement connections preserve working connections. Profile/bookmark mutations commit only after local persistence succeeds. Row actions include their target names. Long errors wrap inside their surfaces.

Print rules release table overflow and height constraints and wrap all columns. A captured-DOM print-CSS proof at A4 width was checked; native printer pagination remains untested. No new font, dependency, model endpoint or background service is used.


## Focused design refinement in v2.4.1

The alert heading stacks its context beneath the title. Alert actions wrap within their allotted width. The spend bridge has a neutral inset, stronger endpoints and clear space between its caveat and provider table. Toolbar export uses an outlined treatment; phone toolbar controls form two equal columns.

Forecast limitations appear above the plot, including the existing uncalibrated-band qualification even when a model reason is present. Drill and filter-removal actions restore useful focus after replacing analysis content. Escape closes the active global filter first, or the current disclosure, preserving unrelated open details and native modal cancellation. Calculations, source contracts and no-cost operation are unchanged.
