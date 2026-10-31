"""Secondary reused-pair diagnostic for selected legacy/repaired terminator models."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import torch
from score_syntax_pairs import preference, sentence_logprob, validate_pairs

WORKSPACE = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def run(source_root, models_root, pairs_path, output):
    source_root, models_root = source_root.resolve(), models_root.resolve()
    pairs_path, output = pairs_path.resolve(), output.resolve()
    if output.exists():
        raise ValueError('Preserve existing outputs; choose a fresh directory')
    pair_bytes = pairs_path.read_bytes()
    payload = json.loads(pair_bytes)
    vocab = json.loads((source_root / 'space/model.json').read_text())['vocab']
    pairs = validate_pairs(payload, vocab)
    tracked = [Path(__file__).resolve(), Path(__file__).with_name('score_syntax_pairs.py').resolve(), pairs_path]
    tracked += [source_root / name for name in ['src/models/transformer.py', 'src/models/transformer_block.py',
                                               'src/models/attention.py', 'src/models/mlp.py',
                                               'src/inference/sampling.py']]
    selections, checkpoints, model_meta = {}, {}, {}
    for arm in ['legacy', 'repaired']:
        folder = models_root / arm
        selection_path, checkpoint_path = folder / 'selection.json', folder / 'checkpoint.pt'
        selection = json.loads(selection_path.read_bytes())
        if (selection['arm'] != arm or selection['executed_steps'] != 7200
                or selection['config']['n_embed'] != 64 or selection['config']['context_length'] != 64):
            raise ValueError('Unexpected selected arm metadata: ' + arm)
        checkpoint_sha = sha(checkpoint_path.read_bytes())
        if checkpoint_sha != selection['checkpoint_sha256']:
            raise ValueError('Selected checkpoint checksum mismatch: ' + arm)
        tracked.extend([selection_path, checkpoint_path])
        selections[arm], checkpoints[arm] = selection, checkpoint_path
        model_meta[arm] = {'selection_path': str(selection_path), 'checkpoint_path': str(checkpoint_path),
                           'selection_sha256': sha(selection_path.read_bytes()), 'checkpoint_sha256': checkpoint_sha,
                           'executed_steps': selection['executed_steps'], 'selected_step': selection['selected_step'],
                           'config': selection['config']}
    if selections['legacy']['config'] != selections['repaired']['config']:
        raise ValueError('Selected arm configurations differ')
    hashes = {str(path): sha(path.read_bytes()) for path in tracked}
    limits = payload.get('limitations', []) + [
        'Secondary diagnostic on the same28 previously authored and inspected pairs; not an independent benchmark.',
        'No training,tuning,checkpoint selection,significance,or publication decision uses these scores.',
        'Equal-length pairs still have lexical and template confounds; preferences are not general grammar competence.',
    ]
    plan = {'created_utc': datetime.now(UTC).isoformat(), 'pair_count': len(pairs),
            'pairs_sha256': sha(pair_bytes), 'models': model_meta, 'input_sha256': hashes,
            'vocab': vocab, 'vocab_sha256': sha(json.dumps(vocab, ensure_ascii=False, separators=(',', ':')).encode()),
            'freeze_before_checkpoint_load_and_scoring': True,
            'score': 'Reused helper: joint logP chars1..N-1 given chars0..N-2; no BOS/EOS; shared initial char unscored.',
            'primary_diagnostic': 'Positive grammatical-minus-ungrammatical joint margin.',
            'tie_policy': 'Exact equality,half credit.', 'limitations': limits}
    output.mkdir(parents=True)
    (output / 'frozen_pairs.json').write_bytes(pair_bytes)
    dump(output / 'plan.json', plan)
    plan_sha = sha((output / 'plan.json').read_bytes())
    # No checkpoint deserialization or model construction occurs before the plan exists.
    sys.path.insert(0, str(source_root))
    from src.models.transformer import Transformer

    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    stoi = {c: i for i, c in enumerate(vocab)}
    rows = [{**pair, 'scored_characters': len(pair['grammatical']) - 1, 'models': {}} for pair in pairs]
    summaries = {}

    def summarize(scores):
        counts = Counter(score['preference'] for score in scores)
        credit = sum(score['credit'] for score in scores)
        return {'pairs': len(scores), 'grammatical': counts['grammatical'],
                'ungrammatical': counts['ungrammatical'], 'ties': counts['tie'], 'credit': credit,
                'preference_rate_with_half_ties': credit / len(scores),
                'mean_joint_margin': sum(score['joint_margin'] for score in scores) / len(scores),
                'mean_character_margin': sum(score['mean_character_margin'] for score in scores) / len(scores)}

    for arm in ['legacy', 'repaired']:
        if any(sha(path.read_bytes()) != hashes[str(path)] for path in tracked):
            raise ValueError('Frozen input changed before model loading')
        checkpoint = torch.load(checkpoints[arm], map_location='cpu', weights_only=True)
        if checkpoint['vocab'] != vocab or checkpoint['config'] != selections[arm]['config']:
            raise ValueError('Selected checkpoint config/vocab mismatch: ' + arm)
        model = Transformer(**checkpoint['config'])
        model.load_state_dict(checkpoint['model_state_dict'])
        model.eval()
        categories = defaultdict(list)
        for row in rows:
            good = sentence_logprob(model, [stoi[c] for c in row['grammatical']])
            bad = sentence_logprob(model, [stoi[c] for c in row['ungrammatical']])
            preferred, credit = preference(good, bad)
            scored = {'grammatical_logp': good, 'ungrammatical_logp': bad, 'joint_margin': good - bad,
                      'mean_character_margin': (good - bad) / row['scored_characters'],
                      'preference': preferred, 'credit': credit}
            row['models'][arm] = scored
            categories[row['category']].append(scored)
        summaries[arm] = {'selected_step': selections[arm]['selected_step'],
                           'total': summarize([row['models'][arm] for row in rows]),
                           'categories': {category: summarize(scores) for category, scores in categories.items()}}
        del model
    transitions = Counter()
    for row in rows:
        old, new = row['models']['legacy'], row['models']['repaired']
        transitions[old['preference'] + '->' + new['preference']] += 1
        row['legacy_to_repaired_credit_change'] = new['credit'] - old['credit']
        row['legacy_to_repaired_margin_change'] = new['joint_margin'] - old['joint_margin']
    if any(sha(path.read_bytes()) != hashes[str(path)] for path in tracked):
        raise ValueError('Frozen input changed during scoring')
    dump(output / 'pair_scores.json', {'plan_sha256': plan_sha, 'pairs': rows})
    result = {'plan_sha256': plan_sha, 'summaries': summaries,
              'paired_legacy_to_repaired': {'transition_counts': dict(transitions),
                                           'net_credit_change': sum(row['legacy_to_repaired_credit_change'] for row in rows)},
              'secondary_reused_diagnostic': True, 'training_or_checkpoint_selection': False,
              'significance_claim': False, 'promotion': False, 'limitations': limits}
    dump(output / 'summary.json', result)
    print(json.dumps(result, allow_nan=False))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=WORKSPACE / 'work/terminator-experiment/imperial-llm')
    parser.add_argument('--models-root', type=Path, default=WORKSPACE / 'work/terminator-run')
    parser.add_argument('--pairs', type=Path, default=WORKSPACE / 'work/syntax-pairs.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    run(args.source_root, args.models_root, args.pairs, args.output)
