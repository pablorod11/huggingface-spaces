"""Controls for the matched prediction-budget context experiment."""
import torch
import torch.nn.functional as F

from scripts.compare_story_context import initialize, paired_windows, token_budget
from scripts.finetune_stories import evaluate


def test_paired_windows_score_identical_positions_without_crossing_stories():
    docs = [torch.arange(240), torch.arange(1000, 1280)]
    short = paired_windows(docs, 3704, 64)
    long = paired_windows(docs, 3704, 128)
    for doc, (xs, ys), (xl, yl) in zip(docs, short, long):
        assert xs.shape == ys.shape == (4, 64)
        assert xl.shape == yl.shape == (4, 128)
        assert torch.equal(xs, xl[:, -64:])
        assert torch.equal(ys, yl[:, -64:])
        assert torch.all(yl[:, :64] == -100)
        assert torch.equal(ys, xs + 1)
        assert xl.min() >= doc.min() and xl.max() < doc.max()
    repeated = paired_windows(docs, 3704, 128)
    assert all(torch.equal(a[0], b[0]) for a, b in zip(long, repeated))


def test_initialization_shares_all_parameters_and_position_prefix():
    cfg = dict(n_head=4, n_embed=32, context_length=64, vocab_size=51, N_BLOCKS=1)
    short, long = initialize(cfg, 64), initialize(cfg, 128)
    assert short.token_embed.weight.shape[1] == long.token_embed.weight.shape[1] == 64
    for name, value in short.state_dict().items():
        expected = long.state_dict()[name]
        if name in ('position_embed.weight', 'pos_idxs'):
            expected = expected[:64]
        assert torch.equal(value, expected), name


def test_equal_training_prediction_budget():
    assert token_budget(64) == token_budget(128) == 7_372_800


def test_masked_validation_is_explicit_suffix_cross_entropy():
    cfg = dict(n_head=4, n_embed=64, context_length=128, vocab_size=51, N_BLOCKS=1)
    model = initialize(cfg, 128)
    windows = paired_windows([torch.arange(200) % 51], 3704, 128)
    x, y = windows[0]
    with torch.no_grad():
        logits = model(x)[0][:, -64:]
        expected = F.cross_entropy(logits.reshape(-1, 51), y[:, -64:].reshape(-1)).item()
    assert abs(evaluate(model, windows)[0] - expected) < 1e-6


def test_causal_attention_cannot_see_future_tokens():
    cfg = dict(n_head=4, n_embed=64, context_length=128, vocab_size=51, N_BLOCKS=1)
    model = initialize(cfg, 128).eval()
    original = (torch.arange(128) % 51).unsqueeze(0)
    changed = original.clone()
    changed[:, 97:] = (changed[:, 97:] + 13) % 51
    with torch.no_grad():
        before = model(original)[0]
        after = model(changed)[0]
    assert torch.equal(before[:, :97], after[:, :97])
    assert not torch.equal(before[:, 97:], after[:, 97:])
