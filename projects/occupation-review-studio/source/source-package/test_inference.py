"""Corruption, routing, and independent sklearn export parity checks."""
import copy
import csv
import importlib.util
from pathlib import Path
import unittest
from inference import Classifier, route_confidence, validate_model
ROOT = Path(__file__).parent

class InferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.classifier = Classifier(ROOT / 'model/model.json')
        cls.artifact = cls.classifier.model

    def test_invalid_text_and_unknown_vocabulary(self):
        for value in ('', '   ', None, True, 123, 'a' * 10001):
            with self.subTest(value=str(value)[:20]), self.assertRaises(ValueError):
                self.classifier.predict(value)
        result = self.classifier.predict('zzzznonwordzzzz qqqqnonwordqqqq')
        self.assertEqual(result['known_features'], 0)
        self.assertEqual(result['route'], 'ESCALATE')
        self.assertAlmostEqual(sum(result['probabilities'].values()), 1)

    def test_threshold_boundaries_and_malformed_confidence(self):
        thresholds = {'auto_accept': .8, 'escalate': .5}
        for score, expected in ((.499999, 'ESCALATE'), (.5, 'HUMAN_REVIEW'), (.799999, 'HUMAN_REVIEW'), (.8, 'AUTO_ACCEPT'), (1, 'AUTO_ACCEPT')):
            self.assertEqual(route_confidence(score, thresholds), expected)
        self.assertEqual(route_confidence(1, thresholds, False), 'ESCALATE')
        self.assertEqual(route_confidence(1, {'auto_accept': None, 'escalate': .5}), 'HUMAN_REVIEW')
        for value in (float('nan'), float('inf'), -.1, 1.1, None, True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                route_confidence(value, thresholds)

    def test_corrupt_artifacts_fail_before_prediction(self):
        cases = [('format_version', True), ('classes', ['A'] * 5), ('idf', [float('nan')]),
                 ('coefficients', []), ('intercept', [0]), ('vocabulary', {'bad': -1}),
                 ('vectorizer', {}), ('thresholds', {'auto_accept': .4, 'escalate': .5}),
                 ('thresholds', {'auto_accept': True, 'escalate': .5}), ('model_version', '')]
        for field, value in cases:
            model = copy.deepcopy(self.artifact)
            model[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_model(model)
        with self.assertRaises(ValueError):
            validate_model({})

    def test_model_repository_standalone_default_loader(self):
        spec = importlib.util.spec_from_file_location('published_inference', ROOT / 'model/inference.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.Classifier().predict('software developer'), self.classifier.predict('software developer'))

    def test_sklearn_parity_on_frozen_heldout_and_token_edges(self):
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        model = self.artifact
        vectorizer = TfidfVectorizer(vocabulary=model['vocabulary'], ngram_range=(1, 2), sublinear_tf=True)
        vectorizer.fit(['temporary fit establishes sklearn runtime attributes'])
        vectorizer._tfidf.idf_ = np.asarray(model['idf'])
        classifier = LogisticRegression()
        classifier.classes_ = np.asarray(model['classes'])
        classifier.coef_ = np.asarray(model['coefficients'])
        classifier.intercept_ = np.asarray(model['intercept'])
        classifier.n_features_in_ = len(model['vocabulary'])
        texts = ['C++ developer: systems, SYSTEMS!', 'éducation teacher', 'a I x', 'zzzznonwordzzzz', 'trade ' * 100]
        for name in ('validation', 'test'):
            with (ROOT / 'data' / f'{name}.csv').open() as handle:
                texts.extend(row['text'] for row in csv.DictReader(handle))
        reference = classifier.predict_proba(vectorizer.transform(texts))
        actual = np.asarray([[self.classifier.predict(text)['probabilities'][label] for label in model['classes']] for text in texts])
        np.testing.assert_allclose(actual, reference, rtol=0, atol=1e-10)

if __name__ == '__main__':
    unittest.main(verbosity=2)
