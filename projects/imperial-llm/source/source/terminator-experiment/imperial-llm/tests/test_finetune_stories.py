import math

import torch

from scripts import finetune_stories as ft


def test_story_windows_never_cross_boundaries():
    docs = [torch.full((70,), 1), torch.full((90,), 2)]
    x, y = ft.story_batch(docs, torch.Generator().manual_seed(1), 64, 32)
    assert x.shape == y.shape == (32, 64)
    assert torch.equal(x, y)
    assert all(torch.unique(row).numel() == 1 for row in x)


def test_schedule_endpoints():
    assert ft.learning_rate("constant", 0, 2400) == 0.001
    assert ft.learning_rate("constant", 2400, 2400) == 0.001
    assert math.isclose(ft.learning_rate("cosine", 0, 2400), 0.0003)
    assert math.isclose(ft.learning_rate("cosine", 2400, 2400), 0.00003)


def test_promotion_requires_finite_improvement():
    assert ft.metric_gate(1.6, 1.5, 1.7, 1.6)
    assert not ft.metric_gate(1.6, 1.6, 1.7, 1.6)
    assert not ft.metric_gate(1.6, 1.5, 1.7, 1.8)
    for bad in [float("nan"), float("inf"), -1.0]:
        assert not ft.metric_gate(1.6, bad, 1.7, 1.6)
        assert not ft.metric_gate(bad, 1.5, 1.7, 1.6)


def test_weighted_loss_uses_token_counts():
    assert math.isclose(ft.weighted_ce([2.0, 4.0], [3, 1]), 2.5)


def test_recover_stories_rejects_modified_data():
    from scripts.refinement_experiment import NOTICE, recover_stories, sha
    stories = ["one\n\ntwo", "three"]
    hashes = [sha(s.encode()) for s in stories]
    assert recover_stories((NOTICE + "\n\n".join(stories) + "\n").encode(), hashes) == stories
    import pytest
    with pytest.raises(ValueError):
        recover_stories((NOTICE + "changed\n").encode(), hashes)


def test_browser_record_uses_candidate_metrics_without_changing_raw_report():
    from scripts.prepare_story_release import browser_record
    report = {'parameter_count':30643, 'selected_step':1200, 'selected_run':{'runtime_seconds':12},
              'evaluation':{'candidate_val_loss':1.4}, 'dataset':{'license':'CDLA-Sharing-1.0'},
              'fresh_test':{'license':'CDLA-Sharing-1.0'}}
    record = browser_record(report,1.3,{'train_characters':1000,'val_characters':200,'test_characters':300})
    assert record['meta']['train_loss'] == 1.3
    assert record['meta']['val_loss'] == 1.4
    assert record['meta']['parameters'] == 30643
    assert record['corpus_bytes'] == 1500
    assert record['split']['test_characters'] == 300
    assert 'meta' not in report


def test_browser_record_preserves_validation_only_history():
    from scripts.prepare_story_release import browser_record
    report = {'parameter_count':30643, 'selected_step':200,
              'selected_run':{'runtime_seconds':12, 'history':[{'step':0,'validation_ce':1.6},{'step':200,'validation_ce':1.4}]},
              'evaluation':{'candidate_val_loss':1.4}}
    record = browser_record(report,1.3,{'train_characters':1000,'val_characters':200,'test_characters':300})
    assert record['history'] == [{'step':0,'val_loss':1.6},{'step':200,'val_loss':1.4}]
    assert all('train_loss' not in row for row in record['history'])
