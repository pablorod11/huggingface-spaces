"""Continue the compact model on licensed stories; select on validation, test once."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import time
from pathlib import Path

import requests
import torch

ROOT = Path(__file__).resolve().parents[1]
DATA_NOTICE = 'NOTICE: Modified TinyStories sample; see README.md and manifest.json for source and CDLA-Sharing-1.0 terms.\n\n'
sys.path.insert(0, str(ROOT))
from scripts.prepare_tiny_data import download, split_stories
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    torch.set_num_threads(1)
    torch.manual_seed(1729)
    torch.use_deterministic_algorithms(True)
    initial = ROOT / 'models/story-initial'
    if not initial.exists():
        initial = ROOT / 'space'
    baseline_payload = json.loads((initial / 'model.json').read_text())
    baseline_checkpoint = load_checkpoint(initial / 'checkpoint.pt', map_location=None)
    cfg, vocab = baseline_payload['config'], baseline_payload['vocab']
    baseline_hash = sha((initial / 'model.json').read_bytes())
    stoi = {c: i for i, c in enumerate(vocab)}
    # Keep the existing alphabet so baseline/candidate next-character losses are comparable.
    def normalize(text: str) -> str:
        text = text.replace('\r\n', '\n').replace('’', "'").replace('“', ' ').replace('”', ' ')
        return ''.join(c if c in stoi else c.lower() if c.lower() in stoi else ' ' for c in text).strip()

    data_dir = ROOT / 'data/story_corpus'
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = data_dir / 'manifest.json'
    if not manifest_path.exists():
        info = requests.get('https://huggingface.co/api/datasets/roneneldan/TinyStories', timeout=30)
        info.raise_for_status()
        revision = info.json()['sha']
        sources = {}
        docs = {}
        seen = set()
        for split, budget in [('train', 1_000_000), ('valid', 300_000)]:
            url = f'https://huggingface.co/datasets/roneneldan/TinyStories/resolve/{revision}/TinyStoriesV2-GPT4-{split}.txt'
            raw_path = download(url, data_dir / f'raw-{split}.txt', budget)
            raw = raw_path.read_bytes()
            sources[split] = {'url': url, 'downloaded_bytes': len(raw), 'prefix_sha256': sha(raw)}
            unique = []
            for story in split_stories(raw.decode('utf-8', errors='replace')):
                normalized = normalize(story)
                key = sha(normalized.encode())
                if len(normalized) > 128 and key not in seen:
                    unique.append(normalized)
                    seen.add(key)
            docs[split] = unique
        assert len(docs['train']) >= 512 and len(docs['valid']) >= 128
        groups = {'train': docs['train'][:512], 'val': docs['valid'][:64], 'test': docs['valid'][64:128]}
        manifest = {'dataset': 'roneneldan/TinyStories, V2 GPT-4', 'revision': revision,
                    'license': 'CDLA-Sharing-1.0', 'license_url': 'https://cdla.dev/sharing-1-0/',
                    'authors': 'Ronen Eldan and Yuanzhi Li', 'sources': sources,
                    'normalization': 'Curly apostrophes become ASCII; unsupported capitals become lowercase; other unsupported characters become spaces. Fixed model-002 alphabet retained.',
                    'split_method': '512 whole stories from official training prefix; first 64 unique official validation stories for selection, next 64 sealed for test. Exact normalized duplicates removed across all splits; near duplicates not assessed.',
                    'splits': {}}
        for name, stories in groups.items():
            body = '\n\n'.join(stories) + '\n'
            (data_dir / f'{name}.txt').write_text(DATA_NOTICE + body)
            manifest['splits'][name] = {'stories': len(stories), 'characters': len(body), 'sha256': sha((DATA_NOTICE + body).encode()), 'content_sha256': sha(body.encode()),
                                       'story_hashes': [sha(story.encode()) for story in stories]}
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    manifest = json.loads(manifest_path.read_text())
    splits = {}
    for name, details in manifest['splits'].items():
        raw = (data_dir / f'{name}.txt').read_bytes()
        assert sha(raw) == details['sha256']
        body = raw.decode().removeprefix(DATA_NOTICE)
        assert sha(body.encode()) == details.get('content_sha256', details['sha256'])
        splits[name] = torch.tensor([stoi[c] for c in body], dtype=torch.long)
    hashes = [set(manifest['splits'][name]['story_hashes']) for name in ['train', 'val', 'test']]
    assert not (hashes[0] & hashes[1] or hashes[0] & hashes[2] or hashes[1] & hashes[2])
    for source in ['model.json', 'training.json', 'checkpoint.pt']:
        backup = ROOT / 'models/story-baseline' / source
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes((initial / source).read_bytes())
    baseline = Transformer(**cfg)
    baseline.load_state_dict(baseline_checkpoint['model_state_dict'])
    model = copy.deepcopy(baseline)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
    rng = torch.Generator().manual_seed(1729)
    def batch(data, generator):
        context = cfg['context_length']
        starts = torch.randint(len(data) - context, (16,), generator=generator)
        return (torch.stack([data[i:i+context] for i in starts]), torch.stack([data[i+1:i+context+1] for i in starts]))
    def windows(name):
        generator = torch.Generator().manual_seed({'train': 2701, 'val': 2702, 'test': 2703}[name])
        return [batch(splits[name], generator) for _ in range(16)]
    train_windows, val_windows = windows('train'), windows('val')
    def loss(candidate, batches):
        candidate.eval()
        with torch.no_grad():
            return sum(float(candidate(x, y)[1]) for x, y in batches) / len(batches)
    baseline_val = loss(baseline, val_windows)
    history, best, best_step, best_val = [], None, 0, float('inf')
    started = time.perf_counter()
    steps = 2400
    for step in range(steps + 1):
        if step % 200 == 0:
            train_loss, val_loss = loss(model, train_windows), loss(model, val_windows)
            history.append({'step': step, 'train_loss': train_loss, 'val_loss': val_loss})
            print(history[-1], flush=True)
            if val_loss < best_val:
                best, best_step, best_val = copy.deepcopy(model.state_dict()), step, val_loss
        if step == steps:
            break
        model.train(); optimizer.zero_grad(set_to_none=True)
        _, train_loss = model(*batch(splits['train'], rng))
        train_loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); optimizer.step()
    model.load_state_dict(best); model.eval()
    assert best_val < baseline_val, 'No validation improvement: installed model retained.'
    # The selected state is fixed BEFORE any test batches are materialized/evaluated.
    test_windows = windows('test')
    baseline_test, selected_test = loss(baseline, test_windows), loss(model, test_windows)
    elapsed = time.perf_counter() - started
    parity = []
    with torch.no_grad():
        for prompt in ['The ', 'A little ', 'The village held a lantern walk at the end of autumn. Children cut']:
            ids = [stoi[c] for c in prompt][-64:]
            parity.append({'ids': ids, 'logits': model(torch.tensor([ids]))[0][0, -1].tolist()})
    payload = {'schema_version': 1, 'architecture': 'upstream-classic-transformer', 'config': cfg,
               'vocab': vocab, 'weights': {k: v.tolist() for k, v in model.state_dict().items()}}
    model_bytes = json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()
    record = {'schema_version': 1, 'seed': 1729, 'steps': steps, 'selected_step': best_step,
              'runtime_seconds': elapsed, 'batch_size': 16, 'learning_rate': 0.001,
              'optimizer': 'AdamW; gradient clipping 1.0', 'torch_version': torch.__version__, 'device': 'cpu',
              'parameter_count': sum(p.numel() for p in model.parameters()), 'model_sha256': sha(model_bytes),
              'corpus_bytes': sum(v['characters'] for v in manifest['splits'].values()),
              'provenance': 'TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li; CDLA-Sharing-1.0. Normalized to the fixed model-002 alphabet; no externally pretrained weights.',
              'dataset': manifest, 'initialization_model_sha256': baseline_hash,
              'split': {'method': manifest['split_method'], 'train_characters': len(splits['train']),
                        'val_characters': len(splits['val']), 'test_characters': len(splits['test'])},
              'evaluation': {'baseline_val_loss': baseline_val, 'candidate_val_loss': best_val,
                             'baseline_test_loss': baseline_test, 'candidate_test_loss': selected_test,
                             'test_method': '16 fixed batches ×16 windows ×64 characters, seed2703; sampled windows may overlap. Test evaluated once after validation selection; never used for gradients or checkpoint selection.',
                             'selection': 'Minimum fixed-window validation loss every200 steps across2400 continued-training steps. Vocab and architecture unchanged.'},
              'history': history, 'parity': parity, 'parity_tolerance': 0.0001,
              'meta': {'train_steps': best_step, 'train_loss': loss(model, train_windows), 'val_loss': best_val,
                       'parameters': sum(p.numel() for p in model.parameters()), 'runtime_seconds': elapsed}}
    output = ROOT / 'models/story-candidate'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'model.json').write_bytes(model_bytes)
    (output / 'training.json').write_text(json.dumps(record, indent=2) + '\n')
    torch.save({'model_state_dict': model.state_dict(), 'config': cfg, 'vocab': vocab, 'seed': 1729}, output / 'checkpoint.pt')
    restored = Transformer(**cfg)
    restored.load_state_dict(load_checkpoint(output / 'checkpoint.pt', map_location=None)['model_state_dict'])
    restored.eval()
    with torch.no_grad():
        for case in parity:
            assert torch.equal(restored(torch.tensor([case['ids']]))[0][0,-1], torch.tensor(case['logits']))
    print(json.dumps({'baseline_val': baseline_val, 'selected_val': best_val, 'baseline_test': baseline_test, 'selected_test': selected_test,
                      'selected_step': best_step, 'runtime_seconds': elapsed, 'candidate_path': str(output)}), flush=True)


if __name__ == '__main__':
    main()
