"""Load the safe JSON baseline. Inference needs only Python's standard library."""
import json
import math
from pathlib import Path
import re
from collections import Counter

TOKEN_PATTERN = r"(?u)\b\w\w+\b"


def route_confidence(confidence, thresholds, known_features=True):
    """Model routing policy; absence of known text always requires escalation."""
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError('Confidence must be a finite probability')
    auto = thresholds['auto_accept']
    return ('ESCALATE' if not known_features or confidence < thresholds['escalate']
            else 'AUTO_ACCEPT' if auto is not None and confidence >= auto else 'HUMAN_REVIEW')


def validate_model(model):
    """Fail at load time rather than emit plausible predictions from corrupt data."""
    try:
        if type(model['format_version']) is not int or model['format_version'] != 1:
            raise ValueError('Unsupported model format')
        expected = {'token_pattern': TOKEN_PATTERN, 'ngram_range': [1, 2],
                    'lowercase': True, 'sublinear_tf': True, 'norm': 'l2'}
        if model['vectorizer'] != expected:
            raise ValueError('Unsupported vectorizer configuration')
        classes, vocabulary = model['classes'], model['vocabulary']
        if not isinstance(classes, list) or len(classes) != 5 or any(not isinstance(c, str) or not c for c in classes) or len(set(classes)) != 5:
            raise ValueError('Expected five unique classes')
        if not isinstance(model['model_version'], str) or not model['model_version'].strip():
            raise ValueError('Missing model version')
        if not isinstance(vocabulary, dict) or not vocabulary or any(not isinstance(k, str) or type(v) is not int for k, v in vocabulary.items()) or set(vocabulary.values()) != set(range(len(vocabulary))):
            raise ValueError('Invalid vocabulary indices')
        width = len(vocabulary)
        def numbers(values, size):
            return isinstance(values, list) and len(values) == size and all(type(v) in (int, float) and math.isfinite(v) for v in values)
        if not numbers(model['idf'], width) or any(v <= 0 for v in model['idf']):
            raise ValueError('Invalid IDF values')
        if not numbers(model['intercept'], 5) or not isinstance(model['coefficients'], list) or len(model['coefficients']) != 5 or any(not numbers(row, width) for row in model['coefficients']):
            raise ValueError('Invalid classifier dimensions or weights')
        thresholds = model['thresholds']
        if not isinstance(thresholds, dict) or set(thresholds) != {'auto_accept', 'escalate'}:
            raise ValueError('Invalid threshold configuration')
        for value in thresholds.values():
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1):
                raise ValueError('Invalid routing threshold')
        if thresholds['escalate'] is None or (thresholds['auto_accept'] is not None and thresholds['auto_accept'] < thresholds['escalate']):
            raise ValueError('Inconsistent routing thresholds')
    except (KeyError, TypeError) as exc:
        raise ValueError('Incomplete or malformed model artifact') from exc


class OccupationClassifier:
    def __init__(self, path=None):
        directory = Path(__file__).parent
        self.path = Path(path) if path is not None else (directory / 'model.json' if (directory / 'model.json').exists() else directory / 'model' / 'model.json')
        self.model = json.loads(self.path.read_text())
        validate_model(self.model)
        self.classes = self.model['classes']
        self.thresholds = self.model['thresholds']

    def predict(self, text):
        if not isinstance(text, str) or not text.strip():
            raise ValueError('Enter a nonempty job title or description.')
        if len(text) > 10000:
            raise ValueError('Text must be at most 10,000 characters.')
        tokens = re.findall(TOKEN_PATTERN, text.lower())
        terms = tokens + [' '.join(pair) for pair in zip(tokens, tokens[1:])]
        counts = Counter(terms)
        vocabulary = self.model['vocabulary']
        features = {vocabulary[t]: (1 + math.log(n)) * self.model['idf'][vocabulary[t]]
                    for t, n in counts.items() if t in vocabulary}
        norm = math.sqrt(sum(value * value for value in features.values()))
        if norm:
            features = {index: value / norm for index, value in features.items()}
        logits = [bias + sum(weights[index] * value for index, value in features.items())
                  for bias, weights in zip(self.model['intercept'], self.model['coefficients'])]
        maximum = max(logits)
        exp = [math.exp(value - maximum) for value in logits]
        probabilities = [value / sum(exp) for value in exp]
        winner = max(range(len(probabilities)), key=probabilities.__getitem__)
        confidence = probabilities[winner]
        route = route_confidence(confidence, self.thresholds, bool(features))
        return {'label': self.classes[winner], 'prediction': self.classes[winner], 'confidence': confidence, 'route': route,
                'probabilities': dict(zip(self.classes, probabilities)),
                'known_features': len(features), 'model_version': self.model['model_version']}


Classifier = OccupationClassifier


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('text')
    parser.add_argument('--model', type=Path)
    args = parser.parse_args()
    print(json.dumps(OccupationClassifier(args.model).predict(args.text), indent=2))
