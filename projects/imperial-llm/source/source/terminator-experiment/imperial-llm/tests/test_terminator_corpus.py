from collections import Counter

from scripts.prepare_terminator_corpus import normalize, source_records


def test_only_policy_change():
    vocab = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .'\n")
    raw = '“Hi?” she said! 12'
    assert normalize(raw, vocab, True) == normalize(raw.replace('?', '.').replace('!', '.'), vocab)
    assert normalize(raw, vocab, True).count('.') == 2
    assert Counter(normalize(raw, vocab, True))['"'] == 0


def test_identity_and_idempotence():
    vocab = set('abc .')
    records = source_records('abc!<|endoftext|>abc?<|endoftext|>unfinished', 'official_validation', vocab)
    assert len(records) == 2
    assert records[0]['legacy'] == records[1]['legacy']
    assert records[0]['source_id'] != records[1]['source_id']
    assert records[0]['repaired'] == records[1]['repaired']
    assert all(normalize(r['repaired'], vocab, True) == r['repaired'] for r in records)


def test_test_exclusion_uses_legacy_and_raw_identity():
    from scripts.prepare_terminator_corpus import select_test

    records = [
        {'legacy': 'a'*129, 'legacy_sha256': 'prior', 'raw_source_sha256': 'one'},
        {'legacy': 'b'*129, 'legacy_sha256': 'novel', 'raw_source_sha256': 'raw_seen'},
        {'legacy': 'c'*129, 'legacy_sha256': 'fresh', 'raw_source_sha256': 'three'},
    ]
    assert select_test(records, {'prior'}, {'raw_seen'}, 1) == [records[2]]
