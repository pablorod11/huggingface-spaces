"""Controlled legacy versus repaired sentence-terminator normalization experiment."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.checkpoint import load_checkpoint
from scripts.compare_model_capacity import initialize, load_model, setup
from scripts.compare_story_context import PROMPTS, SEEDS, destination, export
from scripts.finetune_stories import evaluate, fixed_windows, metric_gate, train
from scripts.refinement_experiment import sha

ARMS = ('legacy', 'repaired')
STEPS = 7200
REFERENCE = ROOT / 'experiments/capacity-comparison/width_64'
CORPUS = ROOT / 'data/terminator_corpus'


def token_budget():
    return STEPS * 16 * 64


def initialize_arm(config, arm, reference_state):
    if arm not in ARMS:
        raise ValueError('Unknown treatment arm')
    model = initialize(config, 64)
    state = model.state_dict()
    if state.keys() != reference_state.keys() or any(not torch.equal(v, reference_state[k]) for k, v in state.items()):
        raise ValueError('Exact archived initialization mismatch')
    return model


def canonical_validation(docs):
    return fixed_windows(docs['repaired']['val'], 3802, 64)


def source_hashes():
    names = ['scripts/compare_terminator_policy.py', 'scripts/prepare_terminator_corpus.py',
             'scripts/compare_model_capacity.py',
             'scripts/compare_story_context.py', 'scripts/finetune_stories.py',
             'scripts/refinement_experiment.py', 'src/models/transformer.py',
             'src/models/transformer_block.py', 'src/models/attention.py', 'src/models/mlp.py',
             'src/inference/sampling.py', 'space/inference.js', 'space/generation-worker.js',
             'space/test_inference.cjs', 'space/test_generation.cjs']
    return {name: sha((ROOT / name).read_bytes()) for name in names}


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def load_split(manifest, split, vocab):
    info = manifest['splits'][split]
    count = {'train': 4096, 'val': 128, 'test': 128}[split]
    if info['story_count'] != count or len(info['stories']) != count:
        raise ValueError('Unexpected split size: ' + split)
    source_ids = [row['source_id'] for row in info['stories']]
    if len(set(source_ids)) != count:
        raise ValueError('Duplicate source IDs: ' + split)
    stoi = {c: i for i, c in enumerate(vocab)}
    encoded = {}
    for arm in ARMS:
        # No test contents are opened by worker fit(), which requests only train/val.
        filename = info[f'{arm}_file']
        if filename != f'{arm}_{split}.json':
            raise ValueError('Unexpected split filename')
        raw = (CORPUS / filename).read_bytes()
        if sha(raw) != info[f'{arm}_file_sha256']:
            raise ValueError('Corpus file checksum mismatch')
        stories = json.loads(raw)
        if len(stories) != count or any(not isinstance(s, str) or len(s) <= 64 for s in stories):
            raise ValueError('Each story must exceed context64')
        if [sha(s.encode()) for s in stories] != [row[f'{arm}_sha256'] for row in info['stories']]:
            raise ValueError('Story checksum/order mismatch')
        encoded[arm] = [torch.tensor([stoi[c] for c in story], dtype=torch.long) for story in stories]
    return encoded


def data():
    payload = json.loads((ROOT / 'space/model.json').read_text())
    manifest = json.loads((CORPUS / 'manifest.json').read_text())
    if (manifest['vocab_sha256'] != sha(json.dumps(payload['vocab'], separators=(',', ':'), ensure_ascii=False).encode())
            or manifest['canonical_selection_validation'] != 'repaired_val.json'):
        raise ValueError('Vocabulary or canonical validation policy mismatch')
    if manifest['preparation_script_sha256'] != sha((ROOT / 'scripts/prepare_terminator_corpus.py').read_bytes()):
        raise ValueError('Corpus preparation script provenance mismatch')
    docs = {arm: {} for arm in ARMS}
    for split in ['train', 'val']:
        encoded = load_split(manifest, split, payload['vocab'])
        for arm in ARMS:
            docs[arm][split] = encoded[arm]
    train_ids = {r['source_id'] for r in manifest['splits']['train']['stories']}
    val_ids = {r['source_id'] for r in manifest['splits']['val']['stories']}
    if train_ids & val_ids:
        raise ValueError('Training/validation source overlap')
    previous = json.loads((ROOT / 'data/expanded_story_corpus/manifest.json').read_text())
    if [r['legacy_sha256'] for r in manifest['splits']['train']['stories']] != previous['splits']['train']['story_hashes']:
        raise ValueError('Legacy training representation/order differs from archived trajectory')
    return payload, manifest, docs


def reference(payload):
    record = json.loads((REFERENCE / 'selection.json').read_text())
    cfg = {**payload['config'], 'n_embed': 64}
    if record['config'] != cfg or cfg['context_length'] != 64 or record['selected_step'] != 7200 or record['executed_steps'] != 7200:
        raise ValueError('Unexpected archived capacity reference')
    for name, key in [('initial.pt', 'initial_checkpoint_sha256'), ('checkpoint.pt', 'checkpoint_sha256')]:
        if sha((REFERENCE / name).read_bytes()) != record[key]:
            raise ValueError('Archived checkpoint hash mismatch')
    initial = load_checkpoint(REFERENCE / 'initial.pt', map_location=None)
    raw = load_checkpoint(REFERENCE / 'checkpoint.pt', map_location=None)
    if initial['config'] != cfg or raw['config'] != cfg or initial['vocab'] != payload['vocab'] or raw['vocab'] != payload['vocab']:
        raise ValueError('Archived configuration/vocab mismatch')
    return initial, raw, record


def fit(arm, output):
    setup()
    output = destination(output)
    dest = output / arm
    if dest.exists():
        raise ValueError('Preserve existing arm output')
    payload, manifest, docs = data()
    initial, raw, ref = reference(payload)
    model = initialize_arm(payload['config'], arm, initial['model_state_dict'])
    frozen = {'arm': arm, 'config': initial['config'], 'seed': 1729,
              'manifest_sha256': sha((CORPUS / 'manifest.json').read_bytes()), 'source_sha256': source_hashes(),
              'reference_initial_sha256': ref['initial_checkpoint_sha256'],
              'reference_raw7200_sha256': ref['checkpoint_sha256'],
              'optimizer_character_predictions': token_budget(),
              'canonical_selection_validation': 'repaired_val.json', 'validation_seed': 3802,
              'training_policy': 'Legacy or repaired representation only; all other optimizer settings identical.',
              'training_steps': STEPS, 'batch_size': 16, 'learning_rate': 0.001,
              'dataset': manifest, 'final_test_contents_read': False}
    dest.mkdir(parents=True)
    dump(dest / 'training_plan.json', frozen)
    (dest / 'initial.pt').write_bytes((REFERENCE / 'initial.pt').read_bytes())
    verify = (7200, raw['model_state_dict']) if arm == 'legacy' else None
    selected, record = train(model, docs[arm]['train'], canonical_validation(docs), 'constant', STEPS,
                             patience=37, verify_at_step=verify)
    if record['executed_steps'] != STEPS or (arm == 'legacy' and record['verified_prefix_step'] != STEPS):
        raise ValueError('Budget or legacy raw-trajectory verification failed')
    if frozen['source_sha256'] != source_hashes() or frozen['manifest_sha256'] != sha((CORPUS / 'manifest.json').read_bytes()):
        raise ValueError('Frozen source/manifest changed during training')
    torch.save({'model_state_dict': selected.state_dict(), 'config': initial['config'],
                'vocab': payload['vocab'], 'seed': 1729}, dest / 'checkpoint.pt')
    record.update({
        'arm': arm, 'config': initial['config'], 'parameter_count': sum(p.numel() for p in selected.parameters()),
        'initialization': 'exact_archived_capacity_width64_seed1729', 'initialization_seed': 1729,
        'initial_checkpoint_sha256': ref['initial_checkpoint_sha256'],
        'checkpoint_sha256': sha((dest / 'checkpoint.pt').read_bytes()),
        'reference_raw7200_checkpoint_sha256': ref['checkpoint_sha256'],
        'training_plan_sha256': sha((dest / 'training_plan.json').read_bytes()),
        'manifest_sha256': frozen['manifest_sha256'], 'source_sha256': frozen['source_sha256'],
        'training_file_sha256': manifest['splits']['train'][f'{arm}_file_sha256'],
        'canonical_validation_sha256': manifest['splits']['val']['repaired_file_sha256'],
        'optimizer_character_predictions': token_budget(), 'training_stories': 4096, 'validation_stories': 128,
        'torch_version': torch.__version__, 'device': 'cpu', 'threads': 1, 'final_test_read': False,
        'selection': 'Minimum CE on shared repaired_val seed3802 windows only; no syntax-pair selection.',
        'policy_confound': 'Punctuation substitution changes trimming,character lengths,and sampled offsets; part of data-policy treatment.',
    })
    dump(dest / 'selection.json', record)
    print(json.dumps({k: record[k] for k in ['arm', 'selected_step', 'executed_steps', 'verified_prefix_step',
                                           'validation_ce', 'runtime_seconds']}), flush=True)


def finish(output, include_live=False):
    setup()
    output = destination(output)
    if any((output / name).exists() for name in ['evaluation.json', 'samples.json', 'per_story.csv']):
        raise ValueError('Preserve existing evaluation outputs')
    payload, manifest, docs = data()
    initial, _, ref = reference(payload)
    records, models, checkpoints, frozen_selections = {}, {}, {}, {}
    for arm in ARMS:
        dest = output / arm
        if any((dest / name).exists() for name in ['model.json', 'training.json']):
            raise ValueError('Preserve existing exports')
        record = json.loads((dest / 'selection.json').read_text())
        expected = {'arm': arm, 'config': initial['config'], 'executed_steps': STEPS,
                    'optimizer_character_predictions': token_budget(), 'source_sha256': source_hashes(),
                    'manifest_sha256': sha((CORPUS / 'manifest.json').read_bytes()),
                    'initial_checkpoint_sha256': ref['initial_checkpoint_sha256'],
                    'reference_raw7200_checkpoint_sha256': ref['checkpoint_sha256'],
                    'training_file_sha256': manifest['splits']['train'][f'{arm}_file_sha256'],
                    'canonical_validation_sha256': manifest['splits']['val']['repaired_file_sha256'],
                    'training_plan_sha256': sha((dest / 'training_plan.json').read_bytes())}
        if any(record[k] != value for k, value in expected.items()):
            raise ValueError('Selection metadata mismatch: ' + arm)
        if arm == 'legacy' and record['verified_prefix_step'] != 7200:
            raise ValueError('Legacy raw trajectory was not verified')
        for name, key in [('initial.pt', 'initial_checkpoint_sha256'), ('checkpoint.pt', 'checkpoint_sha256')]:
            if sha((dest / name).read_bytes()) != record[key]:
                raise ValueError('Checkpoint checksum mismatch')
        model, ckpt = load_model(dest)
        if ckpt['config'] != initial['config'] or ckpt['vocab'] != payload['vocab']:
            raise ValueError('Selected model configuration mismatch')
        if abs(evaluate(model, canonical_validation(docs))[0] - record['validation_ce']) > 1e-12:
            raise ValueError('Canonical validation replay mismatch')
        records[arm], models[arm], checkpoints[arm] = record, model, ckpt
        frozen_selections[arm] = sha((dest / 'selection.json').read_bytes())
    if include_live:
        models['live_004'], _ = load_model(ROOT / 'space')
    # Both validation selections are now fixed; only here are sealed test texts read.
    train_val_ids = {r['source_id'] for split in ['train', 'val'] for r in manifest['splits'][split]['stories']}
    test_ids = [r['source_id'] for r in manifest['splits']['test']['stories']]
    if set(test_ids) & train_val_ids:
        raise ValueError('Test source overlaps training/validation')
    previous = json.loads((ROOT / 'data/wide_budget_story_test/manifest.json').read_text())
    prior = set(previous['prior_evaluation_story_hashes']) | set(previous['story_hashes'])
    if len(prior) != 960 or set(manifest['prior_evaluation_story_hashes']) != prior:
        raise ValueError('Prior evaluation membership mismatch')
    train_val_hashes = {r['legacy_sha256'] for split in ['train', 'val']
                        for r in manifest['splits'][split]['stories']}
    test_hashes = {r['legacy_sha256'] for r in manifest['splits']['test']['stories']}
    if len(test_hashes) != 128 or test_hashes & (prior | train_val_hashes):
        raise ValueError('Test legacy representation overlaps prior evaluation or training/validation')
    test_docs = load_split(manifest, 'test', payload['vocab'])
    test_windows = {arm: fixed_windows(test_docs[arm], 3803, 64) for arm in ARMS}
    metrics, losses = {}, {}
    for name, model in models.items():
        metrics[name] = {'canonical_repaired_val': evaluate(model, canonical_validation(docs))[0],
                         'parameters': sum(p.numel() for p in model.parameters())}
        losses[name] = {}
        for representation in ARMS:
            ce, losses[name][representation] = evaluate(model, test_windows[representation])
            metrics[name][f'{representation}_test_ce'] = ce
    with (output / 'per_story.csv').open('w') as handle:
        writer = csv.writer(handle)
        writer.writerow(['source_id', *[f'{name}_{rep}_ce' for name in models for rep in ARMS]])
        writer.writerows([source_id, *[losses[name][rep][i] for name in models for rep in ARMS]]
                         for i, source_id in enumerate(test_ids))
    stoi = {c: i for i, c in enumerate(payload['vocab'])}
    samples = []
    for prompt in PROMPTS:
        for seed in SEEDS:
            row = {'prompt': prompt, 'seed': seed, 'temperature': 0.7, 'top_k': 20,
                   'new_characters': 160, 'rng': 'PyTorch multinomial; browser RNG differs'}
            for name, model in models.items():
                torch.manual_seed(seed)
                ids = model.generate(torch.tensor([[stoi[c] for c in prompt]]), 160, temperature=0.7, top_k=20)
                row[name] = ''.join(payload['vocab'][int(i)] for i in ids[0])
                if len(row[name]) != len(prompt) + 160:
                    raise ValueError('Generation length mismatch')
            samples.append(row)
    dump(output / 'samples.json', samples)
    for arm in ARMS:
        export(models[arm], checkpoints[arm], records[arm], payload, output / arm,
               metrics[arm], manifest, manifest['splits']['test'])
    a, b = metrics['legacy'], metrics['repaired']
    report = {
        'experiment': 'controlled_terminator_normalization_policy', 'metrics': metrics,
        'training_records': records, 'selection_sha256_before_test': frozen_selections,
        'dataset': manifest, 'source_sha256': source_hashes(),
        'primary_representation': 'repaired_test',
        'metric_gate_passed': metric_gate(a['canonical_repaired_val'], b['canonical_repaired_val'],
                                         a['repaired_test_ce'], b['repaired_test_ce']),
        'primary_relative_ce_reduction': 1 - b['repaired_test_ce'] / a['repaired_test_ce'],
        'test_method': 'Both models score identical repaired_test windows seed3803,4x64 targets per128 stories; '
                       'legacy_test is secondary within-representation comparison only.',
        'promotion': False, 'limitations': [
            'Single initialization/training seed; no significance claim.',
            'Punctuation policy changes trimming,lengths,and sampled offsets; these are part of the data-policy treatment.',
            'Source IDs align representations; windows across representations can differ because lengths change.',
            'Do not compare absolute CE across text representations; compare models within each representation.',
            'Training uses no authored syntax pairs; any later syntax-pair score is a diagnostic only.',
            'Validation reuse,exact duplicate exclusion,and teacher-forced CE do not establish general language quality.',
            'Sampling matches browser temperature/top20 policy but PRNG and tie behavior can differ.',
        ],
    }
    dump(output / 'evaluation.json', report)
    print(json.dumps({'metrics': metrics, 'metric_gate_passed': report['metric_gate_passed']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--arm', choices=ARMS)
    mode.add_argument('--evaluate', action='store_true')
    parser.add_argument('--include-live', action='store_true')
    args = parser.parse_args()
    if args.include_live and not args.evaluate:
        parser.error('--include-live requires --evaluate')
    if args.evaluate:
        finish(args.output, args.include_live)
    else:
        fit(args.arm, args.output)
