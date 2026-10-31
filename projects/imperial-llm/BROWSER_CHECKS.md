# Experimental model 005 browser checks

Local CUA browser checks completed October 30, 2026: 110,387 parameters and SHA e39b99ce8ba9 displayed after verification; generation starts in a worker; Stop preserves partial text and restores controls; unsupported Unicode reports an inline error and focuses Prompt; invalid negative seed reports an inline error and focuses the seed. Training navigation shows 2,400 additional steps, validation CE1.130, regression CE1.138 versus archived1.189, training loss “Not recorded”, and the failed quality screen. The validation curve uses only recorded validation checks.

At a390×844 viewport, document width equals viewport width390 and the training metrics remain readable. Existing visual identity and styles are retained. This covers the tested browser, not assistive technology or physical iOS testing. Node export tests additionally verify deterministic complete generation, input rejection, streaming and long-history cropping.

KV runtime candidate checks: verified model checksum and unchanged64-character output, Stop with preserved partial text and restored controls, and unsupported-character error/focus. Live deployment checks are recorded separately. Versioned runtime URLs prevent mixed old/new assets.
