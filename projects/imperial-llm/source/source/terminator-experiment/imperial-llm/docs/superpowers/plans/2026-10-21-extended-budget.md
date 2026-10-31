# Extended optimization budget experiment

User-approved next step: retain4096 training stories, architecture, LR0.001, batch16, seed1729 and128-story validation; increase maximum steps from2400 to7200. No automatic deployment.

- [x] Reserve128 additional final-test stories excluding all448 earlier evaluation stories and4096 training stories; preserve prior datasets.
- [x] Add a failing test for rejection of a changed training prefix; implement exact state verification at step2400 against the archived expanded candidate.
- [x] Replay training from model004 for7200 steps with unchanged AdamW and draws, disable early stopping, verify prefix at2400, select minimum validation CE across scheduled checks.
- [x] Only after selection, score baseline004, archived2400-step reference and new selected candidate on identical new final-test windows. No post-test tuning.
- [x] Inspect all36 paired fixed-prompt/seed generations, verify serialization, JS numerical parity and worker generation; package reproducible evidence and preserve live004 unless quality supports a later release.

Reference optimizer state was not saved, so replay from original model004 is necessary; verify raw step2400 state exactly matches to rule out changed trajectory. Report executed and selected steps separately. One training seed and sampled same-domain test; no significance claims.

Result:raw2400 prefix verified exactly; executed7200, selected7000. New testCE1.368748,9.09% below live004 and5.30% below reference. Quality remains unreliable; no publication.
