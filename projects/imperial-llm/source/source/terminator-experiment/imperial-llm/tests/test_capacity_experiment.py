import torch

from scripts.compare_model_capacity import initialize


def test_capacity_initialization_changes_only_width_and_is_reproducible():
    cfg={'n_head':4,'n_embed':32,'context_length':64,'vocab_size':51,'N_BLOCKS':2}
    small=initialize(cfg,32)
    large=initialize(cfg,64)
    repeat=initialize(cfg,64)
    assert cfg['n_embed']==32
    assert small.context_length==large.context_length==64
    assert sum(p.numel() for p in small.parameters())==30643
    assert sum(p.numel() for p in large.parameters())>30643
    assert all(torch.equal(v,repeat.state_dict()[k]) for k,v in large.state_dict().items())
