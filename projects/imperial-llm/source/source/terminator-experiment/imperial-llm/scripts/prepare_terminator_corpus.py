"""Paired training corpus: replace ? and ! by periods before legacy normalization."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalize(raw, vocab, repaired=False):
    if repaired:
        raw = raw.replace('?', '.').replace('!', '.')
    text = raw.strip().replace('\r\n', '\n').replace('’', "'").replace('“', ' ').replace('”', ' ')
    return ''.join(c if c in vocab else c.lower() if c.lower() in vocab else ' ' for c in text).strip()


def source_records(raw, split, vocab):
    records = []
    for index, text in enumerate(raw.split('<|endoftext|>')[:-1]):
        raw_sha = sha(text.strip().encode())
        legacy, repaired = normalize(text, vocab), normalize(text, vocab, True)
        records.append({'source_id': split+':'+raw_sha, 'source_index': index,
                        'raw_source_sha256': raw_sha, 'legacy': legacy, 'repaired': repaired,
                        'legacy_sha256': sha(legacy.encode()), 'repaired_sha256': sha(repaired.encode()),
                        'question_substitutions': text.count('?'), 'exclamation_substitutions': text.count('!'),
                        'length_delta': len(repaired)-len(legacy)})
    return records


def select_members(records, hashes):
    by_hash = {}
    for record in records:
        by_hash.setdefault(record['legacy_sha256'], record)
    return [by_hash[key] for key in hashes]


def select_test(records, excluded_hashes, excluded_raw_hashes, count=128):
    selected, seen_hashes, seen_raw = [], set(excluded_hashes), set(excluded_raw_hashes)
    for record in records:
        if len(record['legacy']) <= 128 or record['legacy_sha256'] in seen_hashes or record['raw_source_sha256'] in seen_raw:
            continue
        selected.append(record)
        seen_hashes.add(record['legacy_sha256'])
        seen_raw.add(record['raw_source_sha256'])
        if len(selected) == count:
            return selected
    raise ValueError('Insufficient complete fresh source stories')


def prepare(train_prefix, valid_prefix, output):
    from scripts.refinement_experiment import recover_stories

    if output.exists():
        raise FileExistsError('Preserve existing corpus')
    old = ROOT/'data/expanded_story_corpus'
    original = json.loads((old/'manifest.json').read_text())
    previous = json.loads((ROOT/'data/wide_budget_story_test/manifest.json').read_text())
    vocab_list = json.loads((ROOT/'space/model.json').read_text())['vocab']
    vocab = set(vocab_list)
    assert len(vocab_list) == len(vocab) == 51
    raw = {'train': train_prefix.read_bytes(), 'val': valid_prefix.read_bytes()}
    assert sha(raw['train']) == original['train_prefix_sha256']
    assert sha(raw['val']) == original['valid_prefix_sha256']
    records = {'train': source_records(raw['train'].decode(), 'official_train', vocab),
               'val': source_records(raw['val'].decode(), 'official_validation', vocab)}
    selected = {}
    for split in ('train', 'val'):
        legacy_bytes = (old/f'{split}.txt').read_bytes()
        assert sha(legacy_bytes) == original['splits'][split]['sha256']
        docs = recover_stories(legacy_bytes, original['splits'][split]['story_hashes'])
        selected[split] = select_members(records[split], original['splits'][split]['story_hashes'])
        assert [r['legacy'] for r in selected[split]] == docs
    prior = set(previous['prior_evaluation_story_hashes']) | set(previous['story_hashes'])
    assert len(prior) == 960
    training_hashes = set(original['splits']['train']['story_hashes'])
    assert len(training_hashes) == 4096 and len(selected['val']) == 128
    # Resolve prior canonical membership to raw identities wherever cached sources contain it.
    excluded_raw = {r['raw_source_sha256'] for group in records.values() for r in group
                    if r['legacy_sha256'] in prior | training_hashes}
    selected['test'] = select_test(records['val'], prior | training_hashes, excluded_raw)
    ids = {name: {r['source_id'] for r in group} for name, group in selected.items()}
    assert all(len(ids[name]) == len(group) for name, group in selected.items())
    assert not(ids['train'] & ids['val'] or ids['train'] & ids['test'] or ids['val'] & ids['test'])
    all_legacy = {name: {r['legacy_sha256'] for r in group} for name, group in selected.items()}
    assert not(all_legacy['train'] & all_legacy['val'] or all_legacy['test'] & (prior | training_hashes | all_legacy['val']))
    repaired_hashes = {name: {r['repaired_sha256'] for r in group} for name, group in selected.items()}
    assert not (repaired_hashes['train'] & repaired_hashes['val']
                or repaired_hashes['train'] & repaired_hashes['test']
                or repaired_hashes['val'] & repaired_hashes['test'])
    output.mkdir(parents=True)
    manifest = {'schema_version': 1, 'dataset': original['dataset'], 'revision': original['revision'],
                'license': original['license'], 'license_url': original['license_url'],
                'authors': original['authors'], 'source_train_url': original['source_train_url'],
                'source_valid_url': original['source_valid_url'],
                'transformation': 'Treatment only: raw ? and ! become . before unchanged legacy normalization; quotes still become spaces; same51-character vocabulary.',
                'raw_source_hash_definition': 'SHA256 of exact complete source segment after outer whitespace strip, before any other normalization.',
                'source_id_definition': 'official_train or official_validation, colon, raw_source_sha256; source_index is zero-based complete segment index.',
                'train_prefix_sha256': sha(raw['train']), 'valid_prefix_sha256': sha(raw['val']),
                'vocab_sha256': sha(json.dumps(vocab_list, separators=(',', ':')).encode()),
                'prior_evaluation_excluded_count': len(prior), 'training_excluded_count': len(training_hashes),
                'prior_evaluation_story_hashes': sorted(prior),
                'canonical_selection_validation': 'repaired_val.json',
                'test_access': 'Sealed normalized test files; training workers must not read them. Freeze both model selections before final scoring.',
                'near_duplicates': 'Not assessed', 'preparation_script_sha256': sha(Path(__file__).read_bytes()), 'splits': {}}
    for split, group in selected.items():
        details = {'story_count': len(group), 'stories': [], 'question_substitutions': 0,
                   'exclamation_substitutions': 0, 'length_delta': 0}
        for arm in ('legacy', 'repaired'):
            filename = f'{arm}_{split}.json'
            payload = (json.dumps([r[arm] for r in group], indent=2, ensure_ascii=False)+'\n').encode()
            (output/filename).write_bytes(payload)
            details[f'{arm}_file'] = filename
            details[f'{arm}_file_sha256'] = sha(payload)
        for record in group:
            assert normalize(record['legacy'], vocab) == record['legacy']
            assert normalize(record['repaired'], vocab, True) == record['repaired']
            assert set(record['legacy']+record['repaired']) <= vocab
            details['stories'].append({k: v for k, v in record.items() if k not in ('legacy', 'repaired')})
            for key in ('question_substitutions', 'exclamation_substitutions', 'length_delta'):
                details[key] += record[key]
        manifest['splits'][split] = details
    (output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    (output/'README.md').write_text('Paired modified normalized TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li. CDLA-Sharing-1.0: https://cdla.dev/sharing-1-0/ . Pinned revision, source URLs, exact membership and transformations are in manifest.json. Treatment preserves question/exclamation sentence boundaries as periods; quotes remain removed. Test files are sealed until checkpoint freeze. Near duplicates not assessed.\n')
    print(json.dumps({name: {k: v for k, v in details.items() if k != 'stories'} for name, details in manifest['splits'].items()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--train-prefix', type=Path, required=True)
    parser.add_argument('--valid-prefix', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'data/terminator_corpus')
    args = parser.parse_args()
    prepare(args.train_prefix, args.valid_prefix, args.output)
