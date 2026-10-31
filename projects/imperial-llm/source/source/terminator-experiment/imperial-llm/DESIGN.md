# Imperial LLM design direction

A working scientific notebook for a real character model. The first question is “What does this model predict after my prompt?” Prompt, Generate and continuation take priority over architecture and training evidence.

## Sources & application

- [Taste Skill](https://github.com/Leonxlnx/taste-skill): full skill and app-screen chapter read. App draw selected **Framed sheet**, seed **380598949**, from the two offered devtool styles. Existing palette/type mapped to the roles; no redraws. Warm stone frame and white work sheet provide identity without a marketing hero. Compact horizontal navigation suits three destinations and an embedded Hugging Face Space; no sidebar is needed.
- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines): command checklist used for native links/buttons, labels, skip navigation, errors, focus, hover, touch targets and responsive checks.
- [Awesome Design MD](https://github.com/VoltAgent/awesome-design-md): Claude and Notion design analyses are **community interpretations, not official brand systems**. Borrowed warm editorial restraint, flat document surfaces, readable body scale and sober rectangular controls. No brand marks, proprietary typefaces, purple CTA, navy hero or coral palette copied.

## Tokens

- Stone frame `#f3f2ed`, white sheet `#ffffff`, raised control area `#f7f8f4`.
- Ink `#252a27`, secondary text `#5c625d`, data/focus green `#286c58`.
- Quiet surface border `#e3e5df`; stronger input boundary `#90978e`; error `#a62929`.
- Native system sans for all working text; Georgia only for the product wordmark; monospace only for the checkpoint digest.
- Body 15px, controls 14–16px, secondary explanation 13px, title 24–26px. Controls at least 40px and primary/input/mobile example targets 44px.
- 24px section grid, 16px phone gutters, 6px controls/panels, 16px main sheet. Flat surfaces, no motion, shadows, gradients or font downloads.

## Workbench decisions

Sampling settings stay available in a native disclosure below Generate. This gives the narrow embed its main action early. Real parameters, context and blocks move below the workbench; no invented data. Training metrics distinguish all optimizer steps from the selected checkpoint step. Model notes explain the limits of the small corpus and character vocabulary.

Native hash navigation exposes the current section in the URL. Visible prompt labels, linked field help, inline error region, keyboard focus and a skip link support repeated use. Output is a named region; completion status provides the polite announcement so character streaming does not overwhelm screen readers.

## Verification

Source lint is run separately. Browser screenshot and keyboard verification must use the available CUA browser API; the skill’s standalone browser inspector is not used because this environment requires browser control through CUA. Do not infer a visual pass from source lint alone.

## Source revisions & official systems

- Taste Skill: b9ca2fd8047f4c72d7da90ebc1c1203e57c72cd2.
- Vercel Web Interface Guidelines: 434b7f91364665f2f733b310ec54809bf8f37937.
- Awesome Design MD: 3b605329240ce735b510037cca322f1831fdd7f8.
- [Awesome Design Systems](https://github.com/alexpate/awesome-design-systems) indexes actual public systems; [GitHub Primer](https://primer.style/) is an official reference for accessible, consistent interfaces. Community brand analyses above are inspiration, not official specifications. No component library is imported.

Local CUA checks: desktop screen and 390px phone layout inspected; phone document width equals viewport width (390px), primary button height 45.25px. Invalid prompt focuses the prompt; invalid seed opens its disclosure and focuses the seed. Stop retains partial text and restores controls. Training navigation survives reload via #experiment. These checks cover the tested browser, not full assistive-technology conformance.

Audit refinement (2026-10-19): section anchors now use native hash navigation without click interception, preserving modifier-click behavior. Sampling inputs use16px text at every width to avoid iOS focus zoom. Current Vercel guidelines were fetched again; no visual direction or model weights changed. Physical iOS behavior remains unverified on this host.
