# Portfolio walkthrough

1. Open the local laboratory. Explain the public digits dataset, disjoint training, validation and final test splits and two-process DDP scope.
2. Select two workers and 12 epochs. Enable the worker interruption and launch training.
3. Inspect epoch losses and accuracy. The group restarts after epoch two; the resumed job records restart_count=1.
4. Promote the completed candidate. Explain the checkpoint digest and persisted active-model pointer.
5. Classify a held-out image. Compare its dataset label, predicted class and probability distribution.
6. Show the measured benchmark: one-worker median wall time 13.17s versus two-worker 13.78s on this development host. Epoch compute medians are 0.97s and 0.59s. Explain startup overhead and the varying global batch caveat.
7. Show verification evidence: recovery weights and non-timing learning metrics exactly match uninterrupted training. State the Linux runtime and multi-node validation limits.

The delivered 20-second MP4 is a screenshot walkthrough assembled from four actual verified browser states (launch, recovery, promotion, prediction). It is not a real-time screen recording.

## Suggested portfolio description

Built a distributed image-classification laboratory with PyTorch DDP and FastAPI, including recoverable model/optimizer checkpoints, explicit model promotion, versioned predictions and a responsive operator interface. Verified exact worker-recovery equivalence and measured end-to-end overhead in one-versus-two-worker runs.
