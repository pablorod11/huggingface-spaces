# Digits classifier model card

An educational portfolio demonstration of distributed image classification, checkpoint recovery and inference. Not intended for production OCR or consequential decisions.

## Data and selection

Source: scikit-learn's bundled `load_digits`, 1,797 grayscale 8×8 digit images and ten classes. Pixels are divided by 16. A stratified 60/20/20 split uses seed 42 for train/rest and seed 43 for validation/test: 1,078 training, 359 validation and 360 test images. See [official dataset documentation](https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_digits.html).

The 64→64→10 MLP uses ReLU and Adam at learning rate 0.01. Each epoch observes validation cross entropy; minimum validation loss selects the inference weights. The latest checkpoint also retains current weights and optimizer state for recovery. Test labels are used only for the final evaluation of the selected weights, after training/selection completes. Public inference exports `selected_state_dict`, not the final epoch's current training weights.

DDP uses CPU Gloo, fixed seed and deterministic algorithms. The default global batch size is held constant across worker counts. Training samples are padded to a complete global batch; padding and optimizer step count are recorded in checkpoint metadata.

## Evaluation and evidence

Final metrics include test accuracy, cross entropy, macro F1, a confusion matrix, per-class support/precision/recall/F1 and a Wilson 95% interval for accuracy. The interval describes sampling uncertainty on this test partition, not deployment generalization. After repeated experiment inspection, this test partition ceases to be an untouched model-development holdout; use a new external evaluation for later tuning.

Inspect `metrics.json` for an individual run and `evidence/verification.json` for the environment and verified checks. Previous 80/20 validation-only metrics do not describe this split-version-2 methodology. Do not reuse their accuracy figures for the upgraded model. Local legacy PyTorch evidence does not establish supported Linux/PyTorch ≥2.6 execution.

## Limits

The tiny low-resolution benchmark does not represent arbitrary handwriting, photographs or production OCR. Demo samples are selected from the test partition. Probabilities are uncalibrated softmax scores. Training and serving are single-host demos; checkpoints require a trusted operator. Model identity is the SHA-256 of the complete checkpoint, which contains the selected inference tensors as well as recovery state.
