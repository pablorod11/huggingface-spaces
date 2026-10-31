"""Matched optimizer-reset refinement; run on the supported Linux runtime."""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

STEPS = 2400
PROMPTS = [
    'anna found a small bird in the rain. she decided to',
    'ben put his toy boat in the pond. the boat began to',
    'mia wanted to share her apple with her friend. she',
    'a little fox could not find his way home. then he',
]
SEEDS = [42, 1729, 2026]


def promotion_gate(baseline_val, candidate_val, baseline_test, candidate_test,
                   quality_passes, parity_passed):
    values = [baseline_val, candidate_val, baseline_test, candidate_test]
    return (all(isinstance(v, (int, float)) and math.isfinite(v) and v >= 0 for v in values)
            and candidate_val < baseline_val and candidate_test < baseline_test
            and quality_passes == 12 and parity_passed is True)


def run(root, output):
    sys.path.insert(0, str(root))
    import torch
    from scripts.compare_model_capacity import data, load_model, setup
    from scripts.compare_story_context import export
    from scripts.finetune_stories import evaluate, fixed_windows, train
    from scripts.refinement_experiment import sha
    from src.checkpoint import load_checkpoint

    setup()
    if output.exists():
        raise ValueError('Preserve existing evidence: choose a new output directory')
    if output == root / 'space' or root / 'space' in output.parents:
        raise ValueError('Experiments cannot overwrite deployed assets')
    baseline_dir = root / 'experiments/wide-budget-extension'
    original = json.loads((baseline_dir / 'selection.json').read_text())
    baseline_sha = sha((baseline_dir / 'checkpoint.pt').read_bytes())
    if original['selected_step'] != 14000 or baseline_sha != original['checkpoint_sha256']:
        raise ValueError('Unexpected baseline identity')
    baseline, checkpoint = load_model(baseline_dir)
    payload, manifest, _, docs = data()
    if payload['vocab'] != checkpoint['vocab']:
        raise ValueError('Training and baseline vocabularies differ')
    for split, key in [('train', 'training_corpus_sha256'), ('val', 'validation_corpus_sha256')]:
        if manifest['splits'][split]['sha256'] != original[key]:
            raise ValueError('Training/validation corpus differs from archived baseline')
    windows = fixed_windows(docs['val'], 3702, 64)
    baseline_val = evaluate(baseline, windows)[0]
    if abs(baseline_val - original['validation_ce']) > 1e-5:
        raise ValueError('Baseline validation replay mismatch')
    output.mkdir(parents=True)
    protocol = {
        'experiment': 'wide14000_optimizer_reset_lr_policy_comparison',
        'steps_per_arm': STEPS, 'seed': 1729, 'validation_seed': 3702,
        'baseline_checkpoint_sha256': baseline_sha,
        'source_script_sha256': sha(Path(__file__).read_bytes()),
        'helper_sha256': {name: sha((root / name).read_bytes()) for name in [
            'scripts/finetune_stories.py', 'scripts/compare_model_capacity.py',
            'scripts/compare_story_context.py', 'scripts/refinement_experiment.py',
            'src/checkpoint.py', 'src/models/transformer.py', 'src/models/attention.py',
            'src/models/transformer_block.py', 'src/models/mlp.py']},
        'corpus': manifest, 'prompts': PROMPTS, 'seeds': SEEDS,
        'decoding': {'temperature': 0.7, 'top_k': 20, 'new_characters': 160},
        'selection': 'Validation CE only, including unchanged step0; never select on test or prose.',
        'quality_gate': 'All12 candidate continuations must have valid words, grammatical sentences and coherent continuation; agent screen only.',
        'test_status': 'Previously observed wide-budget test; regression evidence, not an untouched final test.',
        'runtime': str(torch.__version__),
    }
    (output / 'protocol.json').write_text(json.dumps(protocol, indent=2) + '\n')
    models = {'baseline': baseline}
    records = {}
    # Same starting weights, fresh optimizer and identical RNG reset in both arms.
    for schedule in ['constant', 'cosine']:
        folder = output / schedule
        folder.mkdir()
        model, record = train(baseline, docs['train'], windows, schedule, STEPS, patience=13)
        if record['executed_steps'] != STEPS:
            raise ValueError('Incomplete predeclared budget')
        torch.save({'model_state_dict': model.state_dict(), 'config': checkpoint['config'],
                    'vocab': checkpoint['vocab'], 'seed': 1729}, folder / 'checkpoint.pt')
        restored = load_checkpoint(folder / 'checkpoint.pt')
        if any(not torch.equal(v, restored['model_state_dict'][k]) for k, v in model.state_dict().items()):
            raise ValueError('Restricted checkpoint reload mismatch')
        record.update({
            'config': checkpoint['config'], 'parameter_count': sum(p.numel() for p in model.parameters()),
            'initialization': 'warm_start_step14000_weights_fresh_AdamW_not_exact_resume',
            'initial_checkpoint_sha256': baseline_sha,
            'checkpoint_sha256': sha((folder / 'checkpoint.pt').read_bytes()),
            'optimizer_predictions': STEPS * 16 * 64,
            'optimizer_state_saved': False,
            'exact_resume_supported': False,
        })
        (folder / 'selection.json').write_text(json.dumps(record, indent=2) + '\n')
        models[schedule], records[schedule] = model, record
    selected = min(records, key=lambda name: records[name]['validation_ce'])
    # Freeze all selected identities before reading previously observed test content.
    (output / 'selection.json').write_text(json.dumps({'selected_policy': selected, 'records': records}, indent=2) + '\n')
    folder = root / 'data/wide_budget_story_test'
    test_manifest = json.loads((folder / 'manifest.json').read_text())
    raw = (folder / 'stories.json').read_bytes()
    if sha(raw) != test_manifest['stories_sha256']:
        raise ValueError('Regression corpus checksum mismatch')
    stories = json.loads(raw)
    hashes = [sha(s.encode()) for s in stories]
    memberships = set(manifest['splits']['train']['story_hashes']) | set(manifest['splits']['val']['story_hashes'])
    if hashes != test_manifest['story_hashes'] or len(set(hashes)) != 128 or set(hashes) & memberships:
        raise ValueError('Regression test membership mismatch')
    stoi = {c: i for i, c in enumerate(payload['vocab'])}
    encoded = [torch.tensor([stoi[c] for c in s]) for s in stories]
    test_windows = fixed_windows(encoded, 3706, 64)
    metrics = {name: {'val': evaluate(model, windows)[0], 'test': evaluate(model, test_windows)[0]}
               for name, model in models.items()}
    for name, record in records.items():
        export(models[name], checkpoint, record, payload, output / name, metrics[name], manifest, test_manifest)
        # export's historical field calls this a fresh test; correct that provenance.
        path = output / name / 'training.json'
        training = json.loads(path.read_text())
        training['regression_test'] = training.pop('fresh_test')
        training.update({'test_status': protocol['test_status'], 'promotion': False})
        path.write_text(json.dumps(training, indent=2) + '\n')
    samples = []
    for prompt in PROMPTS:
        for seed in SEEDS:
            row = {'prompt': prompt, 'seed': seed}
            for name, model in models.items():
                torch.manual_seed(seed)
                generated = model.generate(torch.tensor([[stoi[c] for c in prompt]]), 160, temperature=0.7, top_k=20)
                row[name] = ''.join(payload['vocab'][int(i)] for i in generated[0])
            samples.append(row)
    (output / 'samples.json').write_text(json.dumps(samples, indent=2) + '\n')
    report = {'metrics': metrics, 'selected_policy': selected,
              'relative_regression_test_ce_reduction': 1 - metrics[selected]['test'] / metrics['baseline']['test'],
              'quality_review': 'Pending manual review of all12 selected continuations.',
              'promotion': False, 'limitations': [protocol['test_status'],
                  'One training seed; repeated validation; no independent human quality ratings.',
                  'Policies differ in both learning-rate scale and schedule shape.',
                  'Fresh optimizer state; checkpoint lacks optimizer/RNG state for exact continuation.',
                  'Character loss does not establish grammar, coherence or assistant capability.']}
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.root.resolve(), args.output.resolve())
