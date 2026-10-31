"""Controls for the isolated sentence-terminator policy comparison."""
import pytest
import torch

from scripts.compare_model_capacity import initialize
from scripts.compare_terminator_policy import canonical_validation, initialize_arm, token_budget
from scripts.finetune_stories import fixed_windows, train


def config():
    return dict(n_head=2, n_embed=32, context_length=64, vocab_size=7, N_BLOCKS=1)


def test_both_arms_exactly_share_archived_initialization():
    state = initialize(config(), 64).state_dict()
    legacy = initialize_arm(config(), 'legacy', state)
    repaired = initialize_arm(config(), 'repaired', state)
    assert all(torch.equal(v, repaired.state_dict()[k]) and torch.equal(v, state[k])
               for k, v in legacy.state_dict().items())
    damaged = {k: v.clone() for k, v in state.items()}
    damaged['lm_head.bias'][0] += 1
    with pytest.raises(ValueError, match='initialization'):
        initialize_arm(config(), 'legacy', damaged)


def test_canonical_validation_uses_repaired_targets_for_both_arms():
    docs = {'legacy': {'val': [torch.zeros(180, dtype=torch.long)]},
            'repaired': {'val': [torch.ones(180, dtype=torch.long)]}}
    windows = canonical_validation(docs)
    assert len(windows) == 1
    assert windows[0][0].shape == windows[0][1].shape == (4, 64)
    assert torch.all(windows[0][0] == 1) and torch.all(windows[0][1] == 1)


def test_equal_training_prediction_budget():
    assert token_budget() == 7_372_800


def test_different_validation_windows_do_not_change_raw_training_trajectory():
    torch.set_num_threads(1)
    model = initialize(config(), 64)
    docs = [torch.arange(160) % 7]
    a = fixed_windows(docs, 3802, 64)
    b = fixed_windows([torch.arange(160).flip(0) % 7], 3802, 64)
    reference, record = train(model, docs, a, 'constant', 1)
    assert record['selected_step'] == 1
    _, replay = train(model, docs, b, 'constant', 1,
                      verify_at_step=(1, reference.state_dict()))
    assert replay['verified_prefix_step'] == 1
