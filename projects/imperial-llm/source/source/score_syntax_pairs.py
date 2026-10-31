"""Frozen equal-length grammar-pair diagnostic for three existing checkpoints."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import torch

WORKSPACE = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = WORKSPACE / 'work/wide-budget-experiment/imperial-llm'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def validate_pairs(payload, vocab):
    pairs = payload.get('pairs')
    if not isinstance(pairs, list) or not pairs:
        raise ValueError('A nonempty pairs list is required')
    ids, sentences = set(), set()
    for row in pairs:
        if not isinstance(row, dict):
            raise TypeError('Each pair must be an object')
        for key in ['id', 'category', 'grammatical', 'ungrammatical', 'rationale']:
            if not isinstance(row.get(key), str) or not row[key].strip():
                raise ValueError('Nonempty string required: ' + key)
        good, bad = row['grammatical'], row['ungrammatical']
        if row.get('equal_length') is not True or len(good) != len(bad) or not 2 <= len(good) <= 64:
            raise ValueError('Equal sentence length2..64 required')
        if good[0] != bad[0]:
            raise ValueError('Pair must share its initial character')
        if (set(good) | set(bad)) - set(vocab):
            raise ValueError('Sentence contains characters outside exact model vocab')
        if row['id'] in ids or good in sentences or bad in sentences or good == bad:
            raise ValueError('Duplicate ID or sentence')
        ids.add(row['id'])
        sentences.update([good, bad])
    return pairs


@torch.no_grad()
def sentence_logprob(model, ids):
    """Score chars1..N-1 given chars0..N-2; no BOS/EOS or final-char input."""
    if len(ids) < 2:
        raise ValueError('At least two characters required')
    model.eval()
    x = torch.tensor([ids[:-1]], dtype=torch.long)
    targets = torch.tensor(ids[1:], dtype=torch.long)
    logits = model(x)[0][0]
    # Float64 log-softmax/reduction gives stable joint-score arithmetic; forward is original dtype.
    log_probs = torch.log_softmax(logits.double(), dim=-1)
    return float(log_probs.gather(1, targets[:, None]).sum())


def preference(good, bad):
    if good > bad:
        return 'grammatical', 1.0
    if good < bad:
        return 'ungrammatical', 0.0
    return 'tie', 0.5


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')


def run(pairs_path, output, source_root, selected_checkpoint=None):
    source_root, pairs_path, output = source_root.resolve(), pairs_path.resolve(), output.resolve()
    if output.exists():
        raise ValueError('Output already exists; choose a fresh directory')
    pair_bytes = pairs_path.read_bytes()
    pair_payload = json.loads(pair_bytes)
    vocab = json.loads((source_root / 'space/model.json').read_text())['vocab']
    if len(vocab) != len(set(vocab)) or any(not isinstance(c, str) or len(c) != 1 for c in vocab):
        raise ValueError('Invalid model vocabulary')
    pairs = validate_pairs(pair_payload, vocab)
    models = {
        'live_004': source_root / 'space/checkpoint.pt',
        'wide_7200': source_root / 'experiments/capacity-comparison/width_64/checkpoint.pt',
        'wide_14000_selected': selected_checkpoint or WORKSPACE / 'outputs/story-wide-budget-extension/checkpoint.pt',
    }
    models = {name: path.resolve() for name, path in models.items()}
    sources = [Path(__file__).resolve(), source_root / 'src/models/transformer.py',
               source_root / 'src/models/transformer_block.py', source_root / 'src/models/attention.py',
               source_root / 'src/models/mlp.py', source_root / 'src/inference/sampling.py']
    checkpoint_hashes = {name: sha(path.read_bytes()) for name, path in models.items()}
    source_hashes = {str(path): sha(path.read_bytes()) for path in sources}
    plan = {
        'created_utc': datetime.now(UTC).isoformat(), 'pairs_path': str(pairs_path),
        'pairs_sha256': sha(pair_bytes), 'pair_count': len(pairs),
        'vocab': vocab, 'vocab_sha256': sha(json.dumps(vocab, ensure_ascii=False, separators=(',', ':')).encode()),
        'checkpoints': {name: {'path': str(path), 'sha256': checkpoint_hashes[name]} for name, path in models.items()},
        'source_sha256': source_hashes, 'freeze_before_checkpoint_load_and_scoring': True,
        'score': 'Joint conditional logP chars1..N-1 given chars0..N-2; first character unscored; no BOS/EOS.',
        'primary': 'logP(grammatical)-logP(ungrammatical),positive means grammatical preference',
        'tie_policy': 'Exact numeric equality gets0.5 credit; no tolerance band.',
        'forward_dtype': 'Original checkpoint tensor dtype; log-softmax and summation float64.',
        'limitations': pair_payload.get('limitations', []) + [
            'Author-crafted diagnostic; no significance or general grammar competence claim.',
            'Equal character counts do not eliminate lexical frequency and template confounds.',
            'Do not train,tune,or select checkpoints with these results.',
        ],
    }
    output.mkdir(parents=True)
    (output / 'frozen_pairs.json').write_bytes(pair_bytes)
    dump(output / 'plan.json', plan)  # Persisted BEFORE importing/constructing/loading any model.
    plan_hash = sha((output / 'plan.json').read_bytes())
    sys.path.insert(0, str(source_root))
    from src.models.transformer import Transformer

    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    stoi = {c: i for i, c in enumerate(vocab)}
    rows = [{**row, 'scored_characters': len(row['grammatical']) - 1, 'models': {}} for row in pairs]
    summaries = {}
    for name, path in models.items():
        if sha(path.read_bytes()) != checkpoint_hashes[name]:
            raise ValueError('Checkpoint changed after freeze: ' + name)
        ckpt = torch.load(path, weights_only=True, map_location='cpu')
        if ckpt['vocab'] != vocab or ckpt['config']['context_length'] < 63:
            raise ValueError('Checkpoint vocabulary/context mismatch: ' + name)
        model = Transformer(**ckpt['config'])
        model.load_state_dict(ckpt['model_state_dict'])
        model.eval()
        categories = defaultdict(list)
        for row in rows:
            good = sentence_logprob(model, [stoi[c] for c in row['grammatical']])
            bad = sentence_logprob(model, [stoi[c] for c in row['ungrammatical']])
            preferred, credit = preference(good, bad)
            n = row['scored_characters']
            scored = {'grammatical_logp': good, 'ungrammatical_logp': bad, 'joint_margin': good - bad,
                      'mean_character_margin': (good - bad) / n, 'preference': preferred, 'credit': credit}
            row['models'][name] = scored
            categories[row['category']].append(scored)

        def summarize(items):
            counts = Counter(row['preference'] for row in items)
            return {'pairs': len(items), 'grammatical': counts['grammatical'],
                    'ungrammatical': counts['ungrammatical'], 'ties': counts['tie'],
                    'credit': sum(row['credit'] for row in items),
                    'preference_rate_with_half_ties': sum(row['credit'] for row in items) / len(items),
                    'mean_joint_margin': sum(row['joint_margin'] for row in items) / len(items),
                    'mean_character_margin': sum(row['mean_character_margin'] for row in items) / len(items)}

        summaries[name] = {'total': summarize([row['models'][name] for row in rows]),
                           'categories': {category: summarize(items) for category, items in categories.items()},
                           'config': ckpt['config']}
        del model
    transitions = Counter()
    for row in rows:
        old, new = row['models']['wide_7200'], row['models']['wide_14000_selected']
        transitions[old['preference'] + '->' + new['preference']] += 1
        row['wide_7200_to_14000_credit_change'] = new['credit'] - old['credit']
        row['wide_7200_to_14000_margin_change'] = new['joint_margin'] - old['joint_margin']
    if (sha(pairs_path.read_bytes()) != plan['pairs_sha256']
            or any(sha(path.read_bytes()) != source_hashes[str(path)] for path in sources)
            or any(sha(path.read_bytes()) != checkpoint_hashes[name] for name, path in models.items())):
        raise ValueError('Frozen inputs changed during scoring')
    dump(output / 'pair_scores.json', {'plan_sha256': plan_hash, 'pairs': rows})
    result = {'plan_sha256': plan_hash, 'summaries': summaries,
              'paired_7200_to_14000': {'transition_counts': dict(transitions),
                                     'net_credit_change': sum(row['wide_7200_to_14000_credit_change'] for row in rows)},
              'significance_claim': False, 'training_or_checkpoint_selection': False,
              'promotion': False, 'limitations': plan['limitations']}
    dump(output / 'summary.json', result)
    print(json.dumps(result, allow_nan=False))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pairs', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--selected-checkpoint', type=Path)
    args = parser.parse_args()
    run(args.pairs, args.output, args.source_root, args.selected_checkpoint)
