"""Bounded equal-training-prediction-budget context64 versus128 experiment."""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.compare_model_capacity import data, load_model, setup
from scripts.finetune_stories import evaluate, story_batch, train
from scripts.refinement_experiment import sha
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer

STEPS = {64: 7200, 128: 3600}
PROMPTS = [
    'tom lost his red ball. he looked under the bed and',
    'lily and her dog went to the park. the dog saw',
    'the rabbit hid a carrot under a tree. later,',
    'sam gave mia a blue box. inside the box was',
]
SEEDS = [42, 1729, 2026]


def canonical_config(payload, context):
    return {**payload['config'], 'n_embed': 64, 'context_length': context}


def initialize(config, context):
    """Construct canonical128 first; copy all shared weights after construction."""
    if context not in STEPS:
        raise ValueError('Only context64 and128 are predeclared')
    cfg = {**config, 'n_embed': 64, 'context_length': 128}
    torch.manual_seed(1729)
    canonical = Transformer(**cfg)
    if context == 128:
        return canonical
    short = Transformer(**{**cfg, 'context_length': 64})
    state = canonical.state_dict()
    state['position_embed.weight'] = state['position_embed.weight'][:64].clone()
    state['pos_idxs'] = state['pos_idxs'][:64].clone()
    short.load_state_dict(state)
    return short


def token_budget(context):
    return STEPS[context] * 16 * context


def paired_windows(docs, seed, context):
    """Four within-story128 windows, identical suffix64 targets in both arms.

    Long inputs retain128 tokens; ignored -100 targets prevent the first64
    logits contributing to selection CE. PyTorch cross_entropy uses this
    ignore_index by default. The shared trainer remains unchanged.
    """
    if context not in STEPS:
        raise ValueError('Invalid context')
    rng = torch.Generator().manual_seed(seed)
    windows = []
    for doc in docs:
        x, y = story_batch([doc], rng, 128, 4)
        if context == 64:
            x, y = x[:, -64:], y[:, -64:]
        else:
            y = y.clone()
            y[:, :64] = -100
        windows.append((x, y))
    return windows


def source_hashes():
    paths = ['scripts/compare_story_context.py', 'scripts/finetune_stories.py',
             'scripts/compare_model_capacity.py', 'scripts/refinement_experiment.py',
             'src/models/transformer.py', 'src/models/transformer_block.py', 'src/models/attention.py',
             'src/inference/sampling.py', 'space/inference.js', 'space/generation-worker.js',
             'space/test_inference.cjs', 'space/test_generation.cjs', 'data/context_probes.json']
    return {p: sha((ROOT / p).read_bytes()) for p in paths}


def tensor_hashes(model):
    return {k: sha(v.detach().contiguous().numpy().tobytes()) for k, v in model.state_dict().items()}


def destination(output, context=None):
    output = output.resolve()
    deployed = (ROOT / 'space').resolve()
    if output == deployed or deployed in output.parents:
        raise ValueError('Do not write experiments into deployed assets')
    return output if context is None else output / f'context_{context}'


def fit(context, output):
    setup()
    dest = destination(output, context)
    if dest.exists():
        raise ValueError('Preserve existing training outputs')
    payload, manifest, _, docs = data()  # This helper never reads the new final test.
    model = initialize(payload['config'], context)
    cfg = {**payload['config'], 'n_embed': 64, 'context_length': context}
    identity = tensor_hashes(model)
    canonical = initialize(payload['config'], 128)
    canonical_identity = tensor_hashes(canonical)
    for name, tensor in model.state_dict().items():
        reference = canonical.state_dict()[name]
        if name in ('position_embed.weight', 'pos_idxs'):
            reference = reference[:context]
        if not torch.equal(tensor, reference):
            raise ValueError('Paired initialization mismatch: ' + name)
    dest.mkdir(parents=True)
    torch.save({'model_state_dict': model.state_dict(), 'config': cfg,
                'vocab': payload['vocab'], 'seed': 1729}, dest / 'initial.pt')
    windows = paired_windows(docs['val'], 3704, context)
    selected, record = train(model, docs['train'], windows, 'constant', STEPS[context], patience=37)
    if record['executed_steps'] != STEPS[context]:
        raise ValueError('Training failed to exhaust the predeclared budget')
    torch.save({'model_state_dict': selected.state_dict(), 'config': cfg,
                'vocab': payload['vocab'], 'seed': 1729}, dest / 'checkpoint.pt')
    record.update({
        'context': context, 'width': 64, 'config': cfg,
        'parameter_count': sum(p.numel() for p in selected.parameters()),
        'initialization': 'canonical_context128_seed1729_shared_tensors_and_position_prefix',
        'initialization_seed': 1729, 'initial_tensor_sha256': identity,
        'canonical128_tensor_sha256': canonical_identity, 'shared_initialization_verified': True,
        'initial_checkpoint_sha256': sha((dest / 'initial.pt').read_bytes()),
        'checkpoint_sha256': sha((dest / 'checkpoint.pt').read_bytes()),
        'training_stories': 4096, 'validation_stories': 128,
        'optimizer_character_predictions': token_budget(context),
        'planned_optimizer_steps': STEPS[context], 'learning_rate': 0.001,
        'budget_method': 'Equal training predictions, not equal FLOPs, optimizer updates, or runtime.',
        'training_corpus_sha256': manifest['splits']['train']['sha256'],
        'validation_corpus_sha256': manifest['splits']['val']['sha256'],
        'validation_window_seed': 3704, 'validation_scored_predictions': 128 * 4 * 64,
        'torch_version': torch.__version__, 'device': 'cpu', 'threads': 1,
        'source_sha256': source_hashes(), 'final_test_read': False,
        'generation_prompts': PROMPTS, 'generation_seeds': SEEDS,
    })
    (dest / 'selection.json').write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: record[k] for k in ['context', 'selected_step', 'executed_steps',
                                           'validation_ce', 'runtime_seconds']}), flush=True)


def export(model, checkpoint, record, payload, dest, metrics, manifest, test_manifest):
    cfg = checkpoint['config']
    exported = {**payload, 'config': cfg, 'weights': {k: v.tolist() for k, v in model.state_dict().items()}}
    model_bytes = json.dumps(exported, separators=(',', ':'), ensure_ascii=False).encode()
    (dest / 'model.json').write_bytes(model_bytes)
    restored, _ = load_model(dest)
    stoi = {c: i for i, c in enumerate(payload['vocab'])}
    parity = []
    with torch.no_grad():
        for prompt in ['The ', 'A little ', 'The village held a lantern walk at the end of autumn. Children cut paper lanterns. ' * 2]:
            ids = [stoi[c] for c in prompt][-cfg['context_length']:]
            x = torch.tensor([ids])
            logits = model(x)[0][0, -1]
            if not torch.equal(logits, restored(x)[0][0, -1]):
                raise ValueError('Checkpoint reload mismatch')
            parity.append({'ids': ids, 'logits': logits.tolist()})
    training = {
        'model_sha256': sha(model_bytes), 'checkpoint_sha256': record['checkpoint_sha256'],
        'parameter_count': record['parameter_count'], 'initialization_model_sha256': None,
        'initialization': record['initialization'], 'initial_checkpoint_sha256': record['initial_checkpoint_sha256'],
        'seed': 1729, 'torch_version': torch.__version__, 'device': 'cpu',
        'steps': record['executed_steps'], 'selected_step': record['selected_step'],
        'selected_run': record,
        'history': [{'step': r['step'], 'val_loss': r['validation_ce']} for r in record['history']],
        'dataset': manifest, 'fresh_test': test_manifest, 'parity': parity, 'parity_tolerance': 0.0001,
        'evaluation': metrics, 'promotion': False, 'quality_review': 'Pending; loss is not a coherence score.',
    }
    (dest / 'training.json').write_text(json.dumps(training, indent=2, allow_nan=False) + '\n')
    for name in ['inference.js', 'generation-worker.js', 'test_inference.cjs', 'test_generation.cjs']:
        text = (ROOT / 'space' / name).read_text()
        if name == 'test_inference.cjs':
            old = 'Array(65).fill(0)'
            if old not in text:
                raise ValueError('Review changed upstream bounds test')
            text = text.replace(old, 'Array(data.config.context_length+1).fill(0)')
        if name == 'test_generation.cjs':
            text += """
// Exercise history beyond both candidate context windows with supported vocabulary.
const cropSize=payload.config.context_length;
const safeToken=payload.vocab.find(c=>c.trim().length>0);
assert.ok(safeToken);
const longPrompt=safeToken.repeat(Math.max(129,cropSize+17));
assert.ok(longPrompt.length>128 && longPrompt.length<=300);
const longRequest={...request,prompt:longPrompt,length:64};
const longFirst=generate(longRequest,()=>{});
const longRepeat=generate(longRequest,()=>{});
const suffixOnly=generate({...longRequest,prompt:longPrompt.slice(-cropSize)},()=>{});
assert.equal(longFirst.text,longRepeat.text,'long history must be reproducible');
assert.equal(longFirst.text,suffixOnly.text,'worker must crop history to actual context');
assert.deepEqual(longFirst.logits,suffixOnly.logits);
assert.equal([...longFirst.text].length,64);
assert.ok(longFirst.logits.every(Number.isFinite));
console.log('PASS: long-history deterministic generation and context cropping.');
"""
        (dest / name).write_text(text)


def finish(output, include_live=False):
    setup()
    output = destination(output)
    if any((output / name).exists() for name in
           ['evaluation.json', 'samples.json', 'long_context_samples.json', 'per_story.csv']):
        raise ValueError('Preserve existing evaluation outputs')
    payload, manifest, prior, docs = data()
    # Prior capacity test is metadata only; fresh story contents remain unread until selection freezes.
    previous = json.loads((ROOT / 'data/capacity_story_test/manifest.json').read_text())
    prior |= set(previous['story_hashes'])
    if len(prior) != 704:
        raise ValueError('Unexpected prior evaluation membership')
    records = {}
    initial_states = {}
    models = {}
    checkpoints = {}
    for context in STEPS:
        folder = output / f'context_{context}'
        record = json.loads((folder / 'selection.json').read_text())
        if any((folder / name).exists() for name in ['model.json', 'training.json']):
            raise ValueError('Preserve existing exported outputs')
        for key, expected in [('training_corpus_sha256', manifest['splits']['train']['sha256']),
                              ('validation_corpus_sha256', manifest['splits']['val']['sha256']),
                              ('source_sha256', source_hashes()), ('executed_steps', STEPS[context]),
                              ('optimizer_character_predictions', token_budget(context))]:
            if record[key] != expected:
                raise ValueError('Selection integrity mismatch: ' + key)
        for name, key in [('checkpoint.pt', 'checkpoint_sha256'), ('initial.pt', 'initial_checkpoint_sha256')]:
            if sha((folder / name).read_bytes()) != record[key]:
                raise ValueError('Checkpoint SHA mismatch')
        initial = load_checkpoint(folder / 'initial.pt', map_location=None)
        initial_states[context] = initial['model_state_dict']
        canonical = initialize(payload['config'], context)
        if (initial['config'] != canonical_config(payload, context)
                or record['initial_tensor_sha256'] != tensor_hashes(canonical)
                or any(not torch.equal(v, canonical.state_dict()[k])
                       for k, v in initial_states[context].items())):
            raise ValueError('Initial checkpoint is not the predeclared paired initialization')
        model, checkpoint = load_model(folder)
        if checkpoint['config'] != {**payload['config'], 'n_embed': 64, 'context_length': context}:
            raise ValueError('Unexpected model configuration')
        val = evaluate(model, paired_windows(docs['val'], 3704, context))[0]
        if abs(val - record['validation_ce']) > 1e-12:
            raise ValueError('Validation replay mismatch')
        records[context], models[f'context_{context}'], checkpoints[context] = record, model, checkpoint
    for name, value in initial_states[64].items():
        other = initial_states[128][name]
        if name in ('position_embed.weight', 'pos_idxs'):
            other = other[:64]
        if not torch.equal(value, other):
            raise ValueError('Initial shared tensor mismatch: ' + name)
    preferred = min(records, key=lambda c: records[c]['validation_ce'])
    frozen_hashes = {str(c): sha((output / f'context_{c}/selection.json').read_bytes()) for c in STEPS}
    if include_live:
        models['live_004'], _ = load_model(ROOT / 'space')
    # Final-test contents are first opened after both validation selections are frozen.
    folder = ROOT / 'data/context_story_test'
    test_manifest = json.loads((folder / 'manifest.json').read_text())
    raw = (folder / 'stories.json').read_bytes()
    if sha(raw) != test_manifest['stories_sha256']:
        raise ValueError('Final test checksum mismatch')
    stories = json.loads(raw)
    hashes = [sha(s.encode()) for s in stories]
    if (len(stories) != 128 or len(set(hashes)) != 128 or hashes != test_manifest['story_hashes']
            or set(hashes) & (prior | set(manifest['splits']['train']['story_hashes']))
            or set(test_manifest['prior_evaluation_story_hashes']) != prior):
        raise ValueError('Final test membership mismatch')
    stoi = {c: i for i, c in enumerate(payload['vocab'])}
    test_docs = [torch.tensor([stoi[c] for c in story], dtype=torch.long) for story in stories]
    metrics, per_story = {}, {}
    for name, model in models.items():
        context = model.context_length
        test_ce, per_story[name] = evaluate(model, paired_windows(test_docs, 3705, context))
        metrics[name] = {'val': evaluate(model, paired_windows(docs['val'], 3704, context))[0],
                         'test': test_ce, 'parameters': sum(p.numel() for p in model.parameters())}
    with (output / 'per_story.csv').open('w') as handle:
        writer = csv.writer(handle)
        writer.writerow(['story_sha256', *models])
        writer.writerows([h, *[per_story[name][i] for name in models]] for i, h in enumerate(hashes))
    samples = []
    for prompt in PROMPTS:
        for seed in SEEDS:
            row = {'prompt': prompt, 'seed': seed, 'temperature': 0.7, 'new_characters': 160}
            for name, model in models.items():
                torch.manual_seed(seed)
                ids = model.generate(torch.tensor([[stoi[c] for c in prompt]]), 160, temperature=0.7)
                row[name] = ''.join(payload['vocab'][int(i)] for i in ids[0])
                if len(row[name]) != len(prompt) + 160:
                    raise ValueError('Generation length mismatch')
            samples.append(row)
    (output / 'samples.json').write_text(json.dumps(samples, indent=2) + '\n')
    probes = json.loads((ROOT / 'data/context_probes.json').read_text())
    long_samples = []
    for probe in probes['probes']:
        prompt = probe['prompt']
        row = {'id': probe['id'], 'pair_id': probe['pair_id'], 'prompt': prompt,
               'seed': 42, 'temperature': 0.7, 'new_characters': 160}
        for name, model in models.items():
            torch.manual_seed(42)
            ids = model.generate(torch.tensor([[stoi[c] for c in prompt]]), 160, temperature=0.7)
            row[name] = ''.join(payload['vocab'][int(i)] for i in ids[0])
            if len(row[name]) != len(prompt) + 160:
                raise ValueError('Long generation length mismatch')
        long_samples.append(row)
    (output / 'long_context_samples.json').write_text(json.dumps(long_samples, indent=2) + '\n')
    for context, record in records.items():
        export(models[f'context_{context}'], checkpoints[context], record, payload,
               output / f'context_{context}', metrics[f'context_{context}'], manifest, test_manifest)
    report = {
        'experiment': 'equal_training_prediction_budget_context64_vs128_width64',
        'metrics': metrics, 'training_records': records, 'validation_preferred_context': preferred,
        'selection_record_hashes_before_test': frozen_hashes, 'dataset': manifest, 'fresh_test': test_manifest,
        'source_sha256': source_hashes(), 'promotion': False,
        'test_method': 'Four paired128-input windows per story; both models score identical suffix64 targets. '
                       'Short model receives suffix64 input. 128 stories,32768 predictions/model,seed3705.',
        'relative_test_ce_reduction_128_vs64': 1 - metrics['context_128']['test'] / metrics['context_64']['test'],
        'limitations': [
            'One training/initialization seed; no significance claim.',
            'Equal training predictions is not equal FLOPs or runtime:128 uses more attention computation.',
            'Context128 has half as many optimizer updates and4096 additional positional parameters.',
            'Scored history lengths are1..64 versus65..128; learned positions reset in short inputs.',
            'Validation was reused by prior experiments; exact duplicate exclusion does not assess near duplicates.',
            'Live004,if included,has different training history and width and is a benchmark only.',
            'Unblinded generated text and lower CE do not establish coherence or assistant capability.',
        ],
    }
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'metrics': metrics, 'validation_preferred_context': preferred}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--context', type=int, choices=[64, 128])
    mode.add_argument('--evaluate', action='store_true')
    parser.add_argument('--include-live', action='store_true', help='Optional live004 benchmark during final evaluation')
    args = parser.parse_args()
    if args.include_live and not args.evaluate:
        parser.error('--include-live requires --evaluate')
    if args.evaluate:
        finish(args.output, args.include_live)
    else:
        fit(args.context, args.output)
