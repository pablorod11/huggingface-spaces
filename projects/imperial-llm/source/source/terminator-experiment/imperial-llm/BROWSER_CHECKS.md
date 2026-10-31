# Browser release gate

The official [Playwright CLI](https://github.com/microsoft/playwright-cli) is useful for agent exploration; this project uses pinned @playwright/test 1.61.1 for repeatable checks. No global CLI installation is required.

```sh
npm ci
npx playwright install chromium firefox webkit
npm run test:model
npm run test:browser
```

The suite starts a Python static server on 127.0.0.1:4173. Projects cover Chromium, Firefox, WebKit and a 390×844 Chromium phone viewport. Tests use isolated sessions and actual worker computation. They verify:

- One verified model download, ready state and no browser page errors.
- Same-seed generation twice, exact length and timing evidence.
- Real stop, partial text retention and a fresh successful run.
- Empty/unsupported prompts and invalid collapsed seed focus.
- Missing/corrupted model rejection and worker-load failure recovery.
- Keyboard skip navigation, persisted section links and responsive bounds.

Layout and generated-output screenshots are captured. Failed runs retain traces and screenshots. HTML report: `npx playwright show-report`. These are test artifacts, not included in source.zip.

## Visual comparisons

```sh
npm run test:visual:update
# Inspect tests/browser/release.spec.cjs-snapshots/*.png before committing.
npm run test:visual
```

Pixel comparisons are opt-in and require a reviewed matching OS/browser baseline. CI runs functional and layout assertions and captures screenshots on Linux; it does not invent Linux pixel baselines from macOS images. The workflow is provided under .github/workflows/browser.yml. A local pass does not claim a remote GitHub Actions run.

This host uses Playwright's frozen macOS14 WebKit build. Playwright 1.64.1 fails at page creation with an unknown PushAPIEnabled setting; the runner is pinned to the compatible 1.61.1 version (https://github.com/microsoft/playwright/issues/42964). Linux WebKit is configured in CI but must be confirmed by a remote run. Chromium and Firefox use the downloaded Playwright releases.

## Hosted smoke check

Set SPACE_URL to the static application origin to run a smoke check against the published Space, for example `SPACE_URL=https://pablorod11-imperial-llm.static.hf.space npx playwright test --project chromium --grep "same prompt"`. Failure-injection tests are intended for the local server.

The keyboard test uses Apple's documented Option-Tab link-navigation shortcut for macOS WebKit, and Tab elsewhere. It does not change user or browser system preferences: https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac .
