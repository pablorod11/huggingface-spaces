# Model004 release

The upload-ready `space/` folder contains the selected story-fine-tuned weights, updated model card, reproducible source, browser interface and release evidence. It targets https://huggingface.co/spaces/PabloRod11/imperial-llm . The live Space has not been changed: no Hugging Face authentication is configured in this workspace.

The candidate has 6.20% lower sampled fresh-test cross-entropy than model 003, with lower loss on 62/64 stories. Coherence improvement is unverified. No additional training or final-test rescoring was performed for this release. The page now shows only the recorded validation curve; selected-checkpoint training CE is a separate metric. Release weights retain SHA-256 `986699bbf0668f6d1aa5da67c373fe53770f7ce5e9efb3e337b5c0d7a42fe376`.

## Publish after authentication

Use an account with write access to PabloRod11/imperial-llm. Authenticate locally; never paste a token into this chat. Hugging Face's official CLI documentation covers installation, browser login and folder upload: https://huggingface.co/docs/huggingface_hub/guides/cli . If `hf` is not installed, install `huggingface_hub` in a virtual environment.

From the extracted release folder:

```sh
hf auth login
hf auth whoami
hf upload PabloRod11/imperial-llm ./space . --repo-type space --commit-message "Release model004: story continuation and validation record"
```

Review the destination and current revision before upload. The last read-only check found main at `d82cd96378ef7088905dcc5de8976a731607709e`; if someone has changed it, reconcile their changes first. Upload only `space/`, which is the flat static-Space root. No deletions, billing changes or hardware changes are needed.

After upload, wait for the static Space rebuild, load the public page, verify the displayed model digest starts with `986699bbf066`, and exercise generation, stop and the training record. Local checks do not establish a successful remote deployment.

## Rollback

The source archive preserves the exact previous release model/checkpoint/training record in models/story-baseline003. The prior live revision is also identified above. Prefer reverting the release commit in Hugging Face version history so the previous page and weights return together; do not mix old weights with a new training record.

## Included evidence

Read `space/RELEASE_CHECKS.json` for release checks, limitations and unchanged weights. `space/source.zip` includes source, licensed normalized corpus, exact baseline, training record, paired results and logs. The full upstream Python suite remains incomplete with documented failures on the legacy runtime; optional screenshot-baseline tests remain skipped. These are separate from the focused and browser release checks.
