"""Train a reproducible baseline; choose routing only on validation; export JSON."""
import argparse
import csv
import hashlib
import importlib.metadata
import json
import platform
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, log_loss

from inference import OccupationClassifier, TOKEN_PATTERN
from prepare_data import normalized


def read_split(path):
    with path.open(newline='') as handle:
        rows = list(csv.DictReader(handle))
    if not rows or not {'text', 'label', 'group'}.issubset(rows[0]):
        raise ValueError(f'{path}: require nonempty text,label,group CSV')
    if any(not all(isinstance(row.get(key), str) and row[key].strip() for key in ('text', 'label', 'group')) for row in rows):
        raise ValueError(f'{path}: missing required value')
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=Path(__file__).parent / 'data')
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'model')
    parser.add_argument('--min-accepted', type=int, default=20)
    parser.add_argument('--target-precision', type=float, default=.95)
    args = parser.parse_args()
    if args.min_accepted < 1 or not 0 < args.target_precision <= 1:
        parser.error('Require min-accepted >= 1 and 0 < target-precision <= 1')
    splits = {name: read_split(args.data / f'{name}.csv') for name in ('train', 'validation', 'test')}
    for left, right in (('train', 'validation'), ('train', 'test'), ('validation', 'test')):
        for key in ('group', 'text'):
            if {normalized(r[key]) if key == 'text' else r[key] for r in splits[left]} & {normalized(r[key]) if key == 'text' else r[key] for r in splits[right]}:
                raise ValueError(f'{key} leakage between {left} and {right}')
    classes = sorted({r['label'] for r in splits['train']})
    if len(classes) != 5 or any({r['label'] for r in rows} != set(classes) for rows in splits.values()):
        raise ValueError('Each split must contain the same five categories')
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True,
                                 token_pattern=TOKEN_PATTERN, max_features=20000)
    texts = {name: [r['text'] for r in rows] for name, rows in splits.items()}
    labels = {name: [r['label'] for r in rows] for name, rows in splits.items()}
    train_features = vectorizer.fit_transform(texts['train'])
    classifier = LogisticRegression(C=4.0, max_iter=2000, random_state=42)
    with warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        classifier.fit(train_features, labels['train'])
    predictions = {}
    metrics = {}
    for name in ('validation', 'test'):
        probs = classifier.predict_proba(vectorizer.transform(texts[name]))
        predicted = classifier.classes_[probs.argmax(axis=1)]
        predictions[name] = (probs, predicted)
        report = classification_report(labels[name], predicted, labels=classifier.classes_, output_dict=True, zero_division=0)
        metrics[name] = {'count': len(predicted), 'accuracy': accuracy_score(labels[name], predicted),
                         'macro_f1': report['macro avg']['f1-score'], 'classification_report': report,
                         'confusion_matrix': confusion_matrix(labels[name], predicted, labels=classifier.classes_).tolist(),
                         'log_loss': log_loss(labels[name], probs, labels=classifier.classes_)}
    probs, predicted = predictions['validation']
    confidence = probs.max(axis=1)
    validation_known = vectorizer.transform(texts['validation']).getnnz(axis=1) > 0
    sweep = []
    for threshold in [round(i / 100, 2) for i in range(50, 100)]:
        accepted = (confidence >= threshold) & validation_known
        count = int(accepted.sum())
        precision = float(np.mean(predicted[accepted] == np.asarray(labels['validation'])[accepted])) if count else None
        sweep.append({'threshold': threshold, 'accepted_count': count,
                      'coverage': count / len(predicted), 'accepted_accuracy': precision})
    eligible = [row for row in sweep if row['accepted_count'] >= args.min_accepted and row['accepted_accuracy'] >= args.target_precision]
    auto = eligible[0]['threshold'] if eligible else None
    thresholds = {'auto_accept': auto, 'escalate': .5}
    for name, (probs, predicted) in predictions.items():
        confidence = probs.max(axis=1)
        known = vectorizer.transform(texts[name]).getnnz(axis=1) > 0
        accepted = (confidence >= auto) & known if auto is not None else np.zeros(len(confidence), dtype=bool)
        metrics[name]['routing'] = {'auto_accept_count': int(accepted.sum()),
            'auto_accept_coverage': float(accepted.mean()),
            'auto_accept_accuracy': float(np.mean(predicted[accepted] == np.asarray(labels[name])[accepted])) if accepted.any() else None,
            'escalate_count': int(((confidence < .5) | ~known).sum())}
    args.output.mkdir(parents=True, exist_ok=True)
    hashes = {name: hashlib.sha256((args.data / f'{name}.csv').read_bytes()).hexdigest() for name in splits}
    model = {'format_version': 1, 'classes': classifier.classes_.tolist(),
             'thresholds': thresholds, 'vocabulary': vectorizer.vocabulary_, 'idf': vectorizer.idf_.tolist(),
             'coefficients': classifier.coef_.tolist(), 'intercept': classifier.intercept_.tolist(),
             'vectorizer': {'token_pattern': TOKEN_PATTERN, 'ngram_range': [1, 2], 'lowercase': True,
                            'sublinear_tf': True, 'norm': 'l2'}}
    # NumPy integers in a vocabulary are normalized to plain JSON numbers.
    model['vocabulary'] = {word: int(index) for word, index in model['vocabulary'].items()}
    identity = {'model': model, 'data_hashes': hashes, 'seed': 42, 'C': 4.0, 'max_iter': 2000,
                'min_accepted': args.min_accepted, 'target_precision': args.target_precision}
    version = 'onet31-tfidf-' + hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:12]
    model['model_version'] = version
    model_path = args.output / 'model.json'
    model_path.write_text(json.dumps(model, sort_keys=True))
    loaded = OccupationClassifier(model_path)
    samples = texts['validation'] + texts['test'] + ['UNKNOWNZZZ qqqxxxx', 'C++ engineer: SOFTWARE systems!', 'éducation teacher']
    reference = classifier.predict_proba(vectorizer.transform(samples))
    maximum_error = max(abs(loaded.predict(text)['probabilities'][label] - float(reference[i, j]))
                        for i, text in enumerate(samples) for j, label in enumerate(classifier.classes_))
    if maximum_error > 1e-10:
        raise AssertionError(f'JSON inference parity failed: {maximum_error}')
    metrics['export_parity'] = {'samples': len(samples), 'maximum_probability_error': maximum_error, 'tolerance': 1e-10}
    metrics['classes'] = classifier.classes_.tolist()
    metrics['threshold_selection'] = {'split': 'validation', 'minimum_accepted_count': args.min_accepted,
        'target_empirical_accuracy': args.target_precision, 'selected': thresholds, 'sweep': sweep,
        'limitation': 'Empirical validation accuracy is not a future accuracy guarantee; probabilities are not calibrated.'}
    (args.output / 'metrics.json').write_text(json.dumps(metrics, indent=2))
    metadata = {'model_version': version, 'trained_at_utc': datetime.now(timezone.utc).isoformat(), 'seed': 42,
                'python': platform.python_version(), 'dependencies': {name: importlib.metadata.version(name) for name in ('numpy', 'scipy', 'scikit-learn')},
                'dataset_sha256': hashes, 'split_counts': {name: len(rows) for name, rows in splits.items()},
                'split_group_counts': {name: len({r['group'] for r in rows}) for name, rows in splits.items()},
                'parameters': {'C': 4.0, 'max_iter': 2000, 'max_features': 20000, 'ngram_range': [1, 2]},
                'threshold_selection_split': 'validation', 'probabilities_calibrated': False,
                'inference_format': 'safe-json-v1; Python standard library; word unigrams+bigrams, sublinear TF, L2, multinomial softmax',
                'model_sha256': hashlib.sha256(model_path.read_bytes()).hexdigest()}
    (args.output / 'training_metadata.json').write_text(json.dumps(metadata, indent=2))
    print(json.dumps({'model_version': version, 'test_macro_f1': metrics['test']['macro_f1'], 'thresholds': thresholds, 'parity_max_error': maximum_error}, indent=2))


if __name__ == '__main__':
    main()
