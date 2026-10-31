"""Frozen grammar-pair scoring controls without loading trained models."""
import importlib.util
from pathlib import Path

import pytest
import torch

spec = importlib.util.spec_from_file_location('syntax_scorer', Path(__file__).with_name('score_syntax_pairs.py'))
scorer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scorer)


class KnownModel:
    def __init__(self):
        self.seen = []

    def eval(self):
        return self

    def __call__(self, ids):
        self.seen.append(ids.clone())
        logits = torch.tensor([[[0., 1., 2.], [2., 1., 0.], [1., 0., 2.]]])
        assert ids.shape[1] == 3
        return logits, None


def test_scores_shifted_targets_sums_every_next_character_without_last_character_input():
    model = KnownModel()
    score = scorer.sentence_logprob(model, [0, 2, 1, 2])
    expected = torch.log_softmax(torch.tensor([[0., 1., 2.], [2., 1., 0.], [1., 0., 2.]]), -1)
    assert score == pytest.approx(float(expected[0, 2] + expected[1, 1] + expected[2, 2]))
    assert model.seen[0].tolist() == [[0, 2, 1]]


def pair(good='ab', bad='ac'):
    return {'id': 'one', 'category': 'agreement', 'grammatical': good, 'ungrammatical': bad,
            'rationale': 'test', 'equal_length': True}


def test_pair_validation_rejects_mismatched_length_and_vocabulary():
    scorer.validate_pairs({'pairs': [pair()]}, list('abc'))
    with pytest.raises(ValueError, match='length'):
        scorer.validate_pairs({'pairs': [pair('ab', 'acc')]}, list('abc'))
    with pytest.raises(ValueError, match='vocab'):
        scorer.validate_pairs({'pairs': [pair('ab', 'az')]}, list('abc'))


def test_pair_validation_requires_shared_initial_character_unique_ids_and_sentences():
    with pytest.raises(ValueError, match='initial'):
        scorer.validate_pairs({'pairs': [pair('ab', 'bc')]}, list('abc'))
    with pytest.raises(ValueError, match='Duplicate'):
        scorer.validate_pairs({'pairs': [pair(), pair()]}, list('abc'))
    with pytest.raises(ValueError, match='Duplicate'):
        scorer.validate_pairs({'pairs': [pair('ab', 'ab')]}, list('abc'))


def test_ties_receive_half_credit():
    assert scorer.preference(1.0, 1.0) == ('tie', 0.5)
    assert scorer.preference(2.0, 1.0) == ('grammatical', 1.0)
    assert scorer.preference(1.0, 2.0) == ('ungrammatical', 0.0)
