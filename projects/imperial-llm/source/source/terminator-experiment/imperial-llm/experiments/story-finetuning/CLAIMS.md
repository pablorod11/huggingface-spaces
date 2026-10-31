# Checked claims

Definitions: baseline = byte-preserved deployed model003; candidate = constant-rate run at validation-selected step2400. CE = mean next-character negative log probability, nats/character, over identical fixed windows.

Facts from evaluation.json: baseline test CE=1.6156829353421926; candidate test CE=1.5154386833310127; test stories=64; four windows/story; context=64.

Arithmetic:64×4×64=16,384 predicted characters. Relative reduction=(baselineCE−candidateCE)/baselineCE=0.062044507507, or 6.204451%. These claims are valid within this recorded evaluation and its sampling assumptions.

Checkpoint/JSON identity and reload parity were checked in the executed trainer. Python/JavaScript final-logit parity uses three contexts with tolerance0.0001. SHA-256 binds the published experiment record to candidate model bytes. Exact disjointness is checked from story hashes; this does not prove absence of near duplicates.

UNVERIFIED: better story coherence, instruction following, mathematical reasoning, safety, universal hardware savings, statistical significance or performance outside this sample. The Euclidean capacity checker is not applicable to model training, so no claim here is described as machine-verified by that checker.
