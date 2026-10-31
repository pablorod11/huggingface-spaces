"""Replay the archived width64/context64 trajectory, extending7200 to14400 steps."""
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
from scripts.compare_model_capacity import data, initialize, load_model, setup
from scripts.compare_story_context import PROMPTS, SEEDS, destination, export
from scripts.finetune_stories import evaluate, fixed_windows, metric_gate, train
from scripts.refinement_experiment import sha

STEPS = 14400
REFERENCE = ROOT / 'experiments/capacity-comparison/width_64'


def token_budget():
    return STEPS * 16 * 64


def source_hashes():
    paths = ['scripts/extend_wide_budget.py', 'scripts/finetune_stories.py',
             'scripts/compare_model_capacity.py', 'scripts/compare_story_context.py',
             'scripts/refinement_experiment.py', 'src/models/transformer.py',
             'src/models/transformer_block.py', 'src/models/attention.py', 'src/models/mlp.py',
             'src/inference/sampling.py', 'space/inference.js', 'space/generation-worker.js',
             'space/test_inference.cjs', 'space/test_generation.cjs', 'data/context_probes.json']
    return {p: sha((ROOT / p).read_bytes()) for p in paths}


def diagnostic_windows(docs):
    """128 fixed unique training stories, four fixed64-character windows each."""
    indices = torch.randperm(len(docs), generator=torch.Generator().manual_seed(4700))[:128].tolist()
    return indices, fixed_windows([docs[i] for i in indices], 4701, 64)


def reference(payload, manifest):
    record = json.loads((REFERENCE / 'selection.json').read_text())
    if (record['selected_step'] != 7200 or record['executed_steps'] != 7200
            or record['config'] != {**payload['config'], 'n_embed': 64, 'context_length': 64}
            or record['training_corpus_sha256'] != manifest['splits']['train']['sha256']
            or record['validation_corpus_sha256'] != manifest['splits']['val']['sha256']):
        raise ValueError('Unexpected archived7200 trajectory')
    for name, key in [('initial.pt', 'initial_checkpoint_sha256'), ('checkpoint.pt', 'checkpoint_sha256')]:
        if sha((REFERENCE / name).read_bytes()) != record[key]:
            raise ValueError('Archived checksum mismatch: ' + name)
    model, checkpoint = load_model(REFERENCE)
    initial = load_checkpoint(REFERENCE / 'initial.pt', map_location=None)
    recreated = initialize(payload['config'], 64)
    if initial['config'] != checkpoint['config']:
        raise ValueError('Archived initialization configuration mismatch')
    if initial['model_state_dict'].keys() != recreated.state_dict().keys() or any(
            not torch.equal(v, initial['model_state_dict'][k]) for k, v in recreated.state_dict().items()):
        raise ValueError('Initialization does not exactly replay archived width64')
    return recreated, model, checkpoint, record


def fit(output):
    setup()
    output = destination(output)
    if output.exists():
        raise ValueError('Preserve existing training outputs; choose a new directory')
    payload, manifest, _, docs = data()
    initial, _, checkpoint, ref = reference(payload, manifest)
    windows = fixed_windows(docs['val'], 3702, 64)
    indices, training_windows = diagnostic_windows(docs['train'])
    output.mkdir(parents=True)
    # Preserve the exact archived initialization bytes, not a reserialization.
    (output / 'initial.pt').write_bytes((REFERENCE / 'initial.pt').read_bytes())
    selected, record = train(initial, docs['train'], windows, 'constant', STEPS, patience=73,
                             verify_at_step=(7200, checkpoint['model_state_dict']),
                             diagnostic_windows=training_windows)
    if record['executed_steps'] != STEPS or record['verified_prefix_step'] != 7200:
        raise ValueError('Predeclared full budget/prefix was not executed')
    torch.save({'model_state_dict': selected.state_dict(), 'config': checkpoint['config'],
                'vocab': payload['vocab'], 'seed': 1729}, output / 'checkpoint.pt')
    record.update({
        'config': checkpoint['config'], 'width': 64, 'context': 64,
        'parameter_count': sum(p.numel() for p in selected.parameters()),
        'initialization': 'exact_replay_archived_capacity_width64_seed1729', 'initialization_seed': 1729,
        'initial_checkpoint_sha256': sha((output / 'initial.pt').read_bytes()),
        'checkpoint_sha256': sha((output / 'checkpoint.pt').read_bytes()),
        'reference_7200_checkpoint_sha256': ref['checkpoint_sha256'],
        'reference_7200_selection_sha256': sha((REFERENCE / 'selection.json').read_bytes()),
        'reference_7200_initial_sha256': ref['initial_checkpoint_sha256'],
        'training_corpus_sha256': manifest['splits']['train']['sha256'],
        'validation_corpus_sha256': manifest['splits']['val']['sha256'],
        'training_stories': 4096, 'validation_stories': 128,
        'optimizer_character_predictions': token_budget(), 'planned_optimizer_steps': STEPS,
        'learning_rate': 0.001, 'validation_window_seed': 3702,
        'diagnostic_training_story_indices': indices,
        'diagnostic_training_story_hashes': [manifest['splits']['train']['story_hashes'][i] for i in indices],
        'diagnostic_story_seed': 4700, 'diagnostic_window_seed': 4701,
        'diagnostic_method': '128 unique training stories,four64-character windows each; CE is diagnostic only.',
        'checkpoint_selection': 'Minimum validation CE only; training diagnostic never selects checkpoints.',
        'source_sha256': source_hashes(), 'torch_version': torch.__version__, 'device': 'cpu', 'threads': 1,
        'final_test_read': False, 'generation_prompts': PROMPTS, 'generation_seeds': SEEDS,
        'generation_sampling': {'temperature': 0.7, 'top_k': 20, 'new_characters': 160,
                                'rng': 'PyTorch multinomial; browser PRNG differs'},
    })
    (output / 'selection.json').write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: record[k] for k in ['selected_step', 'executed_steps', 'verified_prefix_step',
                                           'validation_ce', 'runtime_seconds']}), flush=True)


def finish(output, include_live=False):
    setup()
    output = destination(output)
    if any((output / name).exists() for name in
           ['evaluation.json', 'per_story.csv', 'samples.json', 'model.json', 'training.json']):
        raise ValueError('Preserve existing evaluation and export outputs')
    payload, manifest, prior, docs = data()
    _, archived, _, ref = reference(payload, manifest)
    record_bytes = (output / 'selection.json').read_bytes()
    record = json.loads(record_bytes)
    for key, expected in [('source_sha256', source_hashes()), ('executed_steps', STEPS),
                          ('verified_prefix_step', 7200), ('optimizer_character_predictions', token_budget()),
                          ('training_corpus_sha256', manifest['splits']['train']['sha256']),
                          ('validation_corpus_sha256', manifest['splits']['val']['sha256']),
                          ('reference_7200_checkpoint_sha256', ref['checkpoint_sha256']),
                          ('reference_7200_initial_sha256', ref['initial_checkpoint_sha256']),
                          ('reference_7200_selection_sha256', sha((REFERENCE / 'selection.json').read_bytes()))]:
        if record[key] != expected:
            raise ValueError('Selection integrity mismatch: ' + key)
    for filename, key in [('initial.pt', 'initial_checkpoint_sha256'), ('checkpoint.pt', 'checkpoint_sha256')]:
        if sha((output / filename).read_bytes()) != record[key]:
            raise ValueError('Checkpoint checksum mismatch')
    candidate, checkpoint = load_model(output)
    if checkpoint['config'] != ref['config']:
        raise ValueError('Candidate configuration differs from reference')
    val_windows = fixed_windows(docs['val'], 3702, 64)
    if abs(evaluate(candidate, val_windows)[0] - record['validation_ce']) > 1e-12:
        raise ValueError('Selected validation CE did not replay')
    if abs(evaluate(archived, val_windows)[0] - ref['validation_ce']) > 1e-12:
        raise ValueError('Archived validation CE did not replay')
    frozen_selection_sha = sha(record_bytes)
    models = {'wide_7200': archived, 'wide_14400': candidate}
    if include_live:
        models['live_004'], _ = load_model(ROOT / 'space')
    for folder in ['capacity_story_test', 'context_story_test']:
        previous = json.loads((ROOT / 'data' / folder / 'manifest.json').read_text())
        prior |= set(previous['story_hashes'])
    if len(prior) != 832:
        raise ValueError('Expected832 prior evaluation stories')
    # First final-test content read occurs after validation selection/checkpoints freeze.
    folder = ROOT / 'data/wide_budget_story_test'
    test_manifest = json.loads((folder / 'manifest.json').read_text())
    raw = (folder / 'stories.json').read_bytes()
    if sha(raw) != test_manifest['stories_sha256']:
        raise ValueError('Fresh test checksum mismatch')
    stories = json.loads(raw)
    hashes = [sha(s.encode()) for s in stories]
    if (len(stories) != 128 or len(set(hashes)) != 128 or hashes != test_manifest['story_hashes']
            or set(hashes) & (prior | set(manifest['splits']['train']['story_hashes']))
            or set(test_manifest['prior_evaluation_story_hashes']) != prior):
        raise ValueError('Fresh test membership mismatch')
    stoi = {c: i for i, c in enumerate(payload['vocab'])}
    test_docs = [torch.tensor([stoi[c] for c in story], dtype=torch.long) for story in stories]
    test_windows = fixed_windows(test_docs, 3706, 64)
    metrics, per_story = {}, {}
    for name, model in models.items():
        test_ce, per_story[name] = evaluate(model, test_windows)
        metrics[name] = {'val': evaluate(model, val_windows)[0], 'test': test_ce,
                         'parameters': sum(p.numel() for p in model.parameters())}
    samples = []
    for prompt in PROMPTS:
        for seed in SEEDS:
            row = {'prompt': prompt, 'seed': seed, 'temperature': 0.7, 'top_k': 20,
                   'new_characters': 160, 'rng': 'PyTorch multinomial'}
            for name, model in models.items():
                torch.manual_seed(seed)
                ids = model.generate(torch.tensor([[stoi[c] for c in prompt]]), 160, temperature=0.7, top_k=20)
                row[name] = ''.join(payload['vocab'][int(i)] for i in ids[0])
                if len(row[name]) != len(prompt) + 160:
                    raise ValueError('Generation length mismatch')
            samples.append(row)
    (output / 'samples.json').write_text(json.dumps(samples, indent=2) + '\n')
    with (output / 'per_story.csv').open('w') as handle:
        writer = csv.writer(handle)
        writer.writerow(['story_sha256', *models])
        writer.writerows([h, *[per_story[name][i] for name in models]] for i, h in enumerate(hashes))
    export(candidate, checkpoint, record, payload, output, metrics['wide_14400'], manifest, test_manifest)
    baseline, extended = metrics['wide_7200'], metrics['wide_14400']
    history_by_step = {row['step']: row['validation_ce'] for row in record['history']}
    late_improvement = 1 - history_by_step[14400] / history_by_step[12000]
    late_status = ('regression' if late_improvement < 0 else
                   'small_improvement' if late_improvement < 0.005 else 'continued_improvement')
    report = {
        'late_validation_diagnostic': {'from_step': 12000, 'to_step': 14400,
                                      'relative_ce_reduction': late_improvement,
                                      'descriptive_threshold': 0.005, 'status': late_status,
                                      'used_for_checkpoint_selection': False},
        'experiment': 'archived_width64_context64_7200_vs14400_steps', 'metrics': metrics,
        'training_record': record, 'selection_sha256_before_test': frozen_selection_sha,
        'reference_selection_sha256': sha((REFERENCE / 'selection.json').read_bytes()),
        'metric_gate_passed': metric_gate(baseline['val'], extended['val'], baseline['test'], extended['test']),
        'relative_test_ce_reduction': 1 - extended['test'] / baseline['test'],
        'dataset': manifest, 'fresh_test': test_manifest, 'source_sha256': source_hashes(),
        'test_method': 'Four fixed64-character within-story windows per story,128 new stories,32768 targets,seed3706.',
        'promotion': False, 'limitations': [
            'Single initialization/training seed; nested trajectory is not an independent replication.',
            'Validation has informed previous experiments; training diagnostic is not independent evaluation.',
            'Exact story disjointness does not rule out near duplicates.',
            'CE improvement does not establish syntax, coherence, reasoning, or assistant quality.',
            'Temperature0.7/top20 matches browser policy; PRNG and tie handling can differ across runtimes.',
            'Live004 is a benchmark with different width/history,not a matched budget control.',
        ],
    }
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'metrics': metrics, 'metric_gate_passed': report['metric_gate_passed']}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--train', action='store_true')
    mode.add_argument('--evaluate', action='store_true')
    parser.add_argument('--include-live', action='store_true')
    args = parser.parse_args()
    if args.include_live and not args.evaluate:
        parser.error('--include-live requires --evaluate')
    if args.train:
        fit(args.output)
    else:
        finish(args.output, args.include_live)
