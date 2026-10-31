"""Prepare a local browser-check copy without changing the baseline Space."""
from __future__ import annotations

import argparse
import copy
import json
import shutil
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.finetune_stories import evaluate, fixed_windows
from scripts.refinement_experiment import recover_stories
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer


def browser_record(report, train_loss, split_chars):
    record = copy.deepcopy(report)
    record['meta'] = {'parameters':report['parameter_count'], 'train_steps':report['selected_step'],
                      'train_loss':train_loss, 'val_loss':report['evaluation']['candidate_val_loss'],
                      'runtime_seconds':report['selected_run']['runtime_seconds']}
    record['split'] = dict(split_chars)
    record['corpus_bytes'] = sum(split_chars.values())
    record['provenance'] = ('Continued full-parameter training from Imperial model 003 on modified TinyStories V2 GPT-4 '
                            'by Ronen Eldan and Yuanzhi Li, CDLA-Sharing-1.0; fixed vocabulary. '
                            'Fresh final test excludes exact matches to all packaged splits.')
    # Only validation was recorded over time; never fabricate training curve points.
    record['history'] = [{'step':row['step'], 'val_loss':row['validation_ce']}
                         for row in report['selected_run'].get('history', [])]
    return record


def run(run_dir, output):
    if output.exists():
        raise ValueError('Preview output already exists')
    report = json.loads((run_dir/'evaluation.json').read_text())
    payload = json.loads((run_dir/'candidate/model.json').read_text())
    torch.set_num_threads(1)
    model = Transformer(**payload['config'])
    model.load_state_dict(load_checkpoint(run_dir/'candidate/checkpoint.pt', map_location=None)['model_state_dict'])
    manifest = report['dataset']
    data = ROOT/'data/story_corpus'
    train = recover_stories((data/'train.txt').read_bytes(),manifest['splits']['train']['story_hashes'])
    stoi = {c:i for i,c in enumerate(payload['vocab'])}
    docs = [torch.tensor([stoi[c] for c in s]) for s in train]
    train_loss = evaluate(model,fixed_windows(docs,2701,payload['config']['context_length']))[0]
    fresh = json.loads((ROOT/'data/fresh_story_test/stories.json').read_text())
    counts = {f'{name}_characters':manifest['splits'][name]['characters'] for name in ('train','val')}
    counts['test_characters'] = sum(map(len,fresh))
    record = browser_record(report,train_loss,counts)
    (run_dir/'candidate/training.json').write_text(json.dumps(record,indent=2,allow_nan=False)+'\n')
    shutil.copytree(ROOT/'space',output)
    for name in ('model.json','checkpoint.pt','training.json'):
        shutil.copyfile(run_dir/'candidate'/name,output/name)
    print(json.dumps({'preview':str(output),'training_ce':train_loss,'test_rescored':False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    run(args.run,args.output)
