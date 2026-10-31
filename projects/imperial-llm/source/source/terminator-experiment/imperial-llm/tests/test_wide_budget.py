"""Diagnostics must not perturb the replayed training trajectory."""
import pytest
import torch

from scripts.extend_wide_budget import token_budget
from scripts.finetune_stories import fixed_windows, train
from src.models.transformer import Transformer


def test_extended_budget():
    assert token_budget() == 14_745_600


def test_diagnostic_evaluation_preserves_rng_and_exact_prefix():
    torch.set_num_threads(1)
    torch.manual_seed(1729)
    model = Transformer(n_head=2, n_embed=8, context_length=4, vocab_size=7, N_BLOCKS=1)
    docs = [torch.arange(40) % 7, torch.arange(40).flip(0) % 7]
    windows = fixed_windows(docs, 4701, 4)
    reference, plain = train(model, docs, windows, 'constant', 5)
    plain_rng = torch.get_rng_state().clone()
    diagnosed, record = train(model, docs, windows, 'constant', 5,
                             verify_at_step=(5, reference.state_dict()), diagnostic_windows=windows)
    assert record['verified_prefix_step'] == 5
    assert torch.equal(plain_rng, torch.get_rng_state())
    assert all(torch.equal(v, diagnosed.state_dict()[k]) for k, v in reference.state_dict().items())
    assert [r['validation_ce'] for r in plain['history']] == [r['validation_ce'] for r in record['history']]
    assert all('training_ce' in row for row in record['history'])


def test_prefix_mismatch_is_rejected():
    torch.manual_seed(1729)
    model = Transformer(n_head=2, n_embed=8, context_length=4, vocab_size=7, N_BLOCKS=1)
    docs = [torch.arange(40) % 7]
    windows = fixed_windows(docs, 4701, 4)
    with pytest.raises(RuntimeError, match='prefix differs'):
        train(model, docs, windows, 'constant', 1, verify_at_step=(1, model.state_dict()),
              diagnostic_windows=windows)
