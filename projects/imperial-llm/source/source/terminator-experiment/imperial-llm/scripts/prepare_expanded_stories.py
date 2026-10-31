"""Prepare a pinned, licensed corpus expansion without overwriting earlier data."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.refinement_experiment import NOTICE, recover_stories, sha


def select_stories(raw, vocab, excluded, count):
    seen=set(excluded)
    selected=[]
    for text in raw.split('<|endoftext|>')[:-1]:
        text=text.strip().replace('\r\n','\n').replace('’',"'").replace('“',' ').replace('”',' ')
        text=''.join(c if c in vocab else c.lower() if c.lower() in vocab else ' ' for c in text).strip()
        if len(text)>128 and text not in seen:
            selected.append(text);seen.add(text)
        if len(selected)==count:
            return selected
    raise ValueError(f'Insufficient complete unique stories: {len(selected)}/{count}')


def main(train_prefix, valid_prefix):
    old=ROOT/'data/story_corpus'
    manifest=json.loads((old/'manifest.json').read_text())
    groups={}
    for name,details in manifest['splits'].items():
        data=(old/f'{name}.txt').read_bytes()
        if sha(data)!=details['sha256']:
            raise ValueError('Prior corpus checksum mismatch')
        groups[name]=recover_stories(data,details['story_hashes'])
    old_fresh=ROOT/'data/fresh_story_test'
    old_fresh_manifest=json.loads((old_fresh/'manifest.json').read_text())
    old_fresh_bytes=(old_fresh/'stories.json').read_bytes()
    if sha(old_fresh_bytes)!=old_fresh_manifest['stories_sha256']:
        raise ValueError('Prior final test checksum mismatch')
    prior_evaluation=set(groups['val']+groups['test']+json.loads(old_fresh_bytes))
    vocab=json.loads((ROOT/'space/model.json').read_text())['vocab']
    training=select_stories(train_prefix.read_text(),vocab,prior_evaluation,4096)
    assert set(groups['train'])<=set(training), 'Expansion must retain all512 prior training stories'
    fresh=select_stories(valid_prefix.read_text(),vocab,set(training)|prior_evaluation,256)
    val,test=fresh[:128],fresh[128:]
    assert not(set(training)&set(val) or set(training)&set(test) or set(val)&set(test))
    out=ROOT/'data/expanded_story_corpus';sealed=ROOT/'data/expanded_story_test'
    if out.exists() or sealed.exists():
        raise ValueError('Expanded dataset exists; preserve it instead of overwriting')
    out.mkdir();sealed.mkdir()
    provenance={'dataset':manifest['dataset'],'revision':manifest['revision'],'license':manifest['license'],
                'license_url':manifest['license_url'],'authors':manifest['authors'],
                'source_train_url':f'https://huggingface.co/datasets/roneneldan/TinyStories/resolve/{manifest["revision"]}/TinyStoriesV2-GPT4-train.txt',
                'source_valid_url':f'https://huggingface.co/datasets/roneneldan/TinyStories/resolve/{manifest["revision"]}/TinyStoriesV2-GPT4-valid.txt',
                'train_prefix_bytes':train_prefix.stat().st_size,'train_prefix_sha256':sha(train_prefix.read_bytes()),
                'valid_prefix_bytes':valid_prefix.stat().st_size,'valid_prefix_sha256':sha(valid_prefix.read_bytes()),
                'normalization':manifest['normalization'],
                'prior_evaluation_story_hashes':sorted(sha(s.encode()) for s in prior_evaluation),
                'split_method':'First4096 complete normalized unique training stories excluding all prior evaluation stories; retains prior512 training stories. First256 new unique official-validation stories excluding all current training and prior evaluation:128 validation,128 sealed final test. Near duplicates not assessed.',
                'splits':{}}
    for name,stories in [('train',training),('val',val)]:
        body='\n\n'.join(stories)+'\n';data=(NOTICE+body).encode()
        (out/f'{name}.txt').write_bytes(data)
        provenance['splits'][name]={'stories':len(stories),'characters':len(body),'sha256':sha(data),
                                    'story_hashes':[sha(s.encode()) for s in stories]}
    (out/'manifest.json').write_text(json.dumps(provenance,indent=2)+'\n')
    (sealed/'stories.json').write_text(json.dumps(test,indent=2)+'\n')
    test_manifest={k:v for k,v in provenance.items() if k!='splits'}
    test_manifest.update({'stories_sha256':sha((sealed/'stories.json').read_bytes()),'story_hashes':[sha(s.encode()) for s in test]})
    (sealed/'manifest.json').write_text(json.dumps(test_manifest,indent=2)+'\n')
    notice='Modified normalized TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li. Revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64; data license CDLA-Sharing-1.0, https://cdla.dev/sharing-1-0/ . Source URLs, prefix hashes, normalization and exact split membership are in manifest.json. Near duplicates not assessed. Prior192 evaluation stories excluded from training, selection and final test. Original512 training stories retained in expansion.\n'
    (out/'README.md').write_text(notice)
    (sealed/'README.md').write_text(notice+'This final test is scored only after validation selection; it must not inform gradients or tuning.\n')
    print(json.dumps({'train_stories':4096,'control_stories':512,'validation_stories':128,'final_test_stories':128,'prior_evaluation_excluded':len(prior_evaluation)}))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--train-prefix',type=Path,required=True);p.add_argument('--valid-prefix',type=Path,required=True)
    args=p.parse_args();main(args.train_prefix,args.valid_prefix)
