"""Predeclared entity-recall diagnostic; never reads training or story-test data."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[2]
sys.path.insert(0, str(ROOT))
from scripts.compare_model_capacity import load_model


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evaluate(candidate, probes_path, output):
    if output.exists():
        raise FileExistsError(f'Preserve existing diagnostic: {output}')
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    assert sha(probes_path) == sha(ROOT/'data/context_probes.json'), 'Probe declaration changed'
    probes = json.loads(probes_path.read_text())
    cases = probes['probes']
    assert len(cases) == 8
    result = {'diagnostic': 'predeclared first-character entity recall',
              'claim_limit': 'Both models see only64 characters. Hidden entity cues are absent from both inputs; counterbalanced pairs force4/8 accuracy and cannot test far recall or general coherence.',
              'probe_source': str(probes_path.resolve()), 'probe_sha256': sha(probes_path),
              'evaluator_sha256': sha(Path(__file__)),
              'loader_source_sha256': sha(ROOT / 'scripts/compare_model_capacity.py'),
              'model_source_sha256': {name: sha(ROOT/'src/models'/name)
                                      for name in ('transformer.py', 'transformer_block.py', 'attention.py', 'mlp.py')},
              'torch_version': torch.__version__, 'device': 'cpu', 'models': {}}
    context = 64
    for label, folder in [('reference_7200', ROOT/'experiments/capacity-comparison/width_64'),
                          ('candidate_14400', candidate)]:
        selection_path = folder / 'selection.json'
        selection = json.loads(selection_path.read_text())
        frozen = {str(selection_path): sha(selection_path), str(probes_path): sha(probes_path)}
        for name, expected in selection.get('source_sha256', {}).items():
            source = ROOT/name
            assert sha(source) == expected, 'Frozen training source changed: '+name
            frozen[str(source)] = expected
        if label == 'candidate_14400':
            assert selection['executed_steps'] == 14400
        else:
            assert selection['selected_step'] == selection['executed_steps'] == 7200
        checkpoint_path = folder / 'checkpoint.pt'
        checkpoint_sha = sha(checkpoint_path)
        assert checkpoint_sha == selection['checkpoint_sha256'], 'Selected checkpoint hash mismatch'
        model, checkpoint = load_model(folder)
        assert checkpoint['config']['context_length'] == context
        vocab = checkpoint['vocab']
        stoi = {c: i for i, c in enumerate(vocab)}
        rows, pair_logits = [], {}
        with torch.no_grad():
            for case in cases:
                prompt = case['prompt']
                assert 64 < len(prompt) <= 128
                assert prompt[case['cue_start']:case['cue_end_exclusive']] == case['answer']
                assert case['cue_end_exclusive'] <= len(prompt) - 64
                assert case['short_input'] == prompt[-64:]
                choices = case['choices']
                assert len(choices) == 2 and len({c[0] for c in choices}) == 2
                assert case['answer'] in choices
                for text in (prompt, case['answer'], *choices):
                    assert not set(text) - set(vocab), 'Unsupported probe character'
                visible = prompt[-context:]
                ids = torch.tensor([[stoi[c] for c in visible]], dtype=torch.long)
                logits, _ = model(ids)
                last = logits[0, -1].detach().clone()
                scores = [float(last[stoi[c[0]]]) for c in choices]
                delta = scores[0] - scores[1]
                predicted = choices[0] if delta > 0 else choices[1] if delta < 0 else None
                correct = .5 if predicted is None else float(predicted == case['answer'])
                answer_idx = choices.index(case['answer'])
                rows.append({'id': case['id'], 'pair_id': case['pair_id'], 'prompt': prompt,
                             'visible_input': visible, 'choices': choices, 'answer': case['answer'],
                             'candidate_first_character_logits': dict(zip(choices, scores)),
                             'all_next_character_logits': dict(zip(vocab, map(float, last))),
                             'answer_minus_alternative_logit': scores[answer_idx] - scores[1-answer_idx],
                             'predicted_choice': predicted, 'correct': correct})
                pair_logits.setdefault(case['pair_id'], []).append((case, last))
        pairs = []
        for pair_id, members in pair_logits.items():
            assert len(members) == 2
            (a, la), (b, lb) = members
            assert a['short_input'] == b['short_input'] and a['choices'] == b['choices']
            assert a['answer'] != b['answer']
            if context == 64:
                assert torch.equal(la, lb), 'Identical short suffix produced unequal logits'
            pair_rows = [r for r in rows if r['pair_id'] == pair_id]
            pairs.append({'pair_id': pair_id,
                          'both_correct': all(r['correct'] == 1 for r in pair_rows),
                          'max_absolute_full_logit_change': float((la-lb).abs().max()),
                          'choice_margin_change': (pair_rows[0]['candidate_first_character_logits'][a['choices'][0]] - pair_rows[0]['candidate_first_character_logits'][a['choices'][1]]) - (pair_rows[1]['candidate_first_character_logits'][a['choices'][0]] - pair_rows[1]['candidate_first_character_logits'][a['choices'][1]])})
        assert sum(r['correct'] for r in rows) == 4, 'Counterbalanced short score must be4/8'
        assert all(sha(Path(path)) == expected for path, expected in frozen.items())
        assert sha(checkpoint_path) == checkpoint_sha
        result['models'][label] = {
            'checkpoint_source': str(checkpoint_path.resolve()), 'checkpoint_sha256': checkpoint_sha,
            'selection_sha256': sha(selection_path), 'selection_checkpoint_hash_verified': True,
            'vocabulary_sha256': hashlib.sha256(json.dumps(vocab, separators=(',', ':')).encode()).hexdigest(),
            'config': checkpoint['config'], 'selected_step': selection.get('selected_step'),
            'accuracy': sum(r['correct'] for r in rows)/len(rows),
            'pair_both_correct_count': sum(p['both_correct'] for p in pairs),
            'pair_count': len(pairs), 'cases': rows, 'pairs': pairs,
            'far_recall_evidence': False, 'structural_expected_correct': 4,
            'short_identical_suffix_logits_verified': context == 64}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x') as handle:
        json.dump(result, handle, indent=2, allow_nan=False)
        handle.write('\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--probes', type=Path, default=ROOT/'data/context_probes.json')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = evaluate(args.candidate, args.probes, args.output)
    print(json.dumps({name: {'accuracy': row['accuracy'], 'pair_both_correct_count': row['pair_both_correct_count']}
                      for name, row in report['models'].items()}))
