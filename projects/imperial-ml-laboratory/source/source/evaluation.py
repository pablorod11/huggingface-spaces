"""Evaluate a selected classifier once on the untouched test partition."""
import math
import torch


def evaluate(model, features, labels):
    model.eval()
    with torch.inference_mode():
        logits = model(features)
        loss = torch.nn.functional.cross_entropy(logits, labels).item()
        predictions = logits.argmax(1)
    confusion = torch.bincount(labels * 10 + predictions, minlength=100).reshape(10, 10)
    per_class = []
    for digit in range(10):
        correct = int(confusion[digit, digit])
        support = int(confusion[digit].sum())
        predicted = int(confusion[:, digit].sum())
        precision = correct / predicted if predicted else 0.0
        recall = correct / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class.append({'digit': digit, 'support': support, 'precision': precision,
                          'recall': recall, 'f1': f1})
    correct = int(confusion.diag().sum())
    n = len(labels)
    accuracy = correct / n
    # Wilson 95% interval describes sample uncertainty, not deployment generalization.
    z = 1.959963984540054
    denominator = 1 + z*z/n
    center = (accuracy + z*z/(2*n)) / denominator
    half = z * math.sqrt(accuracy*(1-accuracy)/n + z*z/(4*n*n)) / denominator
    return {'samples': n, 'loss': loss, 'accuracy': accuracy,
            'accuracy_wilson95': [center-half, center+half],
            'macro_f1': sum(row['f1'] for row in per_class)/10,
            'confusion_matrix': confusion.tolist(), 'per_class': per_class,
            'split': 'test', 'selection': 'minimum validation cross entropy'}
