"""Train the upstream classic Transformer and export a small browser demonstration."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer


def main() -> None:
    torch.set_num_threads(1)
    torch.manual_seed(1729)
    torch.use_deterministic_algorithms(True)
    raw = (ROOT / 'data/space_corpus.txt').read_bytes()
    text = raw.decode('utf-8')
    vocab = sorted(set(text))
    stoi = {char: index for index, char in enumerate(vocab)}
    # Whole paragraphs stay on one side of the contiguous boundary.
    boundary = text.rfind('\n\n', 0, int(len(text) * 0.85)) + 2
    splits = {name: torch.tensor([stoi[c] for c in body], dtype=torch.long)
              for name, body in [('train', text[:boundary]), ('val', text[boundary:])]}
    cfg = dict(n_head=4, n_embed=32, context_length=64, vocab_size=len(vocab), N_BLOCKS=2)
    model = Transformer(**cfg)
    optim = torch.optim.AdamW(model.parameters(), lr=0.002)
    rng = torch.Generator().manual_seed(1729)
    eval_rng = torch.Generator().manual_seed(2701)

    def batch(data: torch.Tensor, generator: torch.Generator):
        starts = torch.randint(len(data) - 64, (16,), generator=generator)
        return torch.stack([data[i:i+64] for i in starts]), torch.stack([data[i+1:i+65] for i in starts])

    # Fixed windows make checkpoint selection and baseline comparison comparable.
    fixed_batches = {name: [batch(data, eval_rng) for _ in range(12)]
                     for name, data in splits.items()}

    def evaluate(candidate):
        candidate.eval()
        with torch.no_grad():
            return {name: sum(float(candidate(x, y)[1]) for x, y in batches) / len(batches)
                    for name, batches in fixed_batches.items()}

    baseline = Transformer(**cfg)
    baseline.load_state_dict(load_checkpoint(ROOT / 'space/checkpoint.pt', map_location=None)['model_state_dict'])
    baseline_losses = evaluate(baseline)
    baseline_metadata = json.loads((ROOT / 'space/training.json').read_text())
    baseline_steps = baseline_metadata['meta']['train_steps']
    baseline_hash = hashlib.sha256((ROOT / 'space/model.json').read_bytes()).hexdigest()
    print({'baseline_fixed_windows': baseline_losses}, flush=True)
    curves = []
    best_loss = float('inf')
    best_state = None
    best_step = 0
    total_steps = 3200
    started = time.perf_counter()
    for step in range(total_steps + 1):
        if step % 200 == 0:
            losses = evaluate(model)
            row = {'step': step, **losses}
            if losses['val'] < best_loss:
                best_loss, best_step = losses['val'], step
                best_state = copy.deepcopy(model.state_dict())
            curves.append(row)
            print(row, flush=True)
            model.train()
        if step == total_steps:
            break
        optim.zero_grad(set_to_none=True)
        _, loss = model(*batch(splits['train'], rng))
        loss.backward()
        optim.step()
    elapsed = time.perf_counter() - started
    assert best_state is not None
    promoted = best_loss < baseline_losses['val']
    if not promoted:
        raise RuntimeError('Candidate did not improve fixed-window validation; baseline artifacts retained.')
    model.load_state_dict(best_state)
    selected_losses = evaluate(model)
    cases = []
    with torch.no_grad():
        for prompt in ['The ', 'A little ', 'The village held a lantern walk at the end of autumn. Children cut']:
            ids = [stoi[c] for c in prompt][-64:]
            logits, _ = model(torch.tensor([ids]))
            cases.append({'prompt': prompt, 'ids': ids, 'logits': logits[0, -1].tolist()})
    state = model.state_dict()
    output = ROOT / 'space'
    output.mkdir(exist_ok=True)
    payload = {'schema_version': 1, 'architecture': 'upstream-classic-transformer',
               'config': cfg, 'vocab': vocab, 'weights': {key: value.tolist() for key, value in state.items()}}
    model_bytes = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()
    (output / 'model.json').write_bytes(model_bytes)
    torch.save({'model_state_dict': state, 'config': cfg, 'vocab': vocab, 'seed': 1729}, output / 'checkpoint.pt')
    metadata = {'schema_version': 1, 'seed': 1729, 'steps': total_steps, 'batch_size': 16,
                'learning_rate': 0.002, 'optimizer': 'torch.optim.AdamW (defaults except lr)',
                'device': 'cpu', 'threads': 1, 'runtime_seconds': elapsed,
                'torch_version': torch.__version__, 'python_version': sys.version,
                'upstream_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                'architecture_source': 'src.models.transformer.Transformer',
                'parameter_count': sum(p.numel() for p in model.parameters()),
                'corpus_sha256': hashlib.sha256(raw).hexdigest(), 'corpus_bytes': len(raw),
                'model_sha256': hashlib.sha256(model_bytes).hexdigest(),
                'provenance': 'Original prose authored for this demonstration by Codex; no external dataset or pretrained weights.',
                'split': {'method': 'contiguous paragraph boundary, first approximately 85 percent train',
                          'boundary_character': boundary, 'train_characters': len(splits['train']), 'val_characters': len(splits['val']),
                          'vocabulary': 'Character inventory from full corpus; no validation transitions used in optimization.'},
                'quality': 'Educational character model trained on one tiny corpus. Output may be repetitive or nonsensical; not a conversational assistant.',
                'history': [{'step': r['step'], 'train_loss': r['train'], 'val_loss': r['val']} for r in curves], 'parity': cases, 'parity_tolerance': 0.0001}
    metadata['selected_step'] = best_step
    metadata['evaluation'] = {
        'method': '12 fixed batches of 16 contiguous 64-character windows per split; seed 2701; identical windows at every evaluation',
        'baseline_model_sha256': baseline_hash, 'baseline_steps': baseline_steps,
        'baseline_train_loss': baseline_losses['train'], 'baseline_val_loss': baseline_losses['val'],
        'candidate_train_loss': selected_losses['train'], 'candidate_val_loss': selected_losses['val'],
        'selection': 'Minimum validation loss among checkpoints every 200 steps through 3200; no independent test set',
        'relative_validation_ce_reduction': 1 - selected_losses['val'] / baseline_losses['val']}
    metadata['curves'] = curves
    metadata['parity_cases'] = [{'token_ids': r['ids'], 'expected_final_logits': r['logits']} for r in cases]
    metadata['meta'] = {'train_steps': best_step, 'train_loss': selected_losses['train'], 'val_loss': selected_losses['val'], 'parameters': metadata['parameter_count'], 'runtime_seconds': elapsed}
    (output / 'training.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
    restored = Transformer(**cfg)
    restored.load_state_dict(load_checkpoint(output / 'checkpoint.pt', map_location=None)['model_state_dict'])
    restored.eval()
    with torch.no_grad():
        for case in cases:
            got = restored(torch.tensor([case['ids']]))[0][0, -1]
            assert torch.equal(got, torch.tensor(case['logits']))
    print(f'Exported {metadata["parameter_count"]:,} parameters; {elapsed:.1f}s; checkpoint parity passed.', flush=True)


if __name__ == '__main__':
    main()
