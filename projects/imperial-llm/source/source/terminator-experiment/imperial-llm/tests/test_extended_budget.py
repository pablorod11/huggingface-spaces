import pytest
import torch

from scripts.finetune_stories import fixed_windows, train
from src.models.transformer import Transformer


def test_prefix_verification_rejects_different_training_trajectory():
    torch.set_num_threads(1)
    torch.manual_seed(17)
    model=Transformer(n_head=1,n_embed=4,context_length=4,vocab_size=3,N_BLOCKS=1)
    docs=[torch.tensor([0,1,2]*10)]
    windows=fixed_windows(docs,19,4)
    with pytest.raises(RuntimeError,match='Training prefix'):
        train(model,docs,windows,'constant',1,verify_at_step=(1,model.state_dict()))
