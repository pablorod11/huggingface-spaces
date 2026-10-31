"""Matched-token from-scratch width experiment; workers never read the final test."""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

import torch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.finetune_stories import evaluate, fixed_windows, metric_gate, train
from scripts.refinement_experiment import recover_stories, sha
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer


def initialize(config,width):
    if width not in (32,64):
        raise ValueError('The bounded experiment compares width32 and64')
    torch.manual_seed(1729)
    return Transformer(**{**config,'n_embed':width})


def data():
    folder=ROOT/'data/expanded_story_corpus'
    manifest=json.loads((folder/'manifest.json').read_text())
    groups={}
    for name in ('train','val'):
        raw=(folder/f'{name}.txt').read_bytes()
        if sha(raw)!=manifest['splits'][name]['sha256']:
            raise ValueError('Corpus checksum mismatch')
        groups[name]=recover_stories(raw,manifest['splits'][name]['story_hashes'])
    previous=json.loads((ROOT/'data/budget_story_test/manifest.json').read_text())
    prior=set(previous['prior_evaluation_story_hashes'])|set(previous['story_hashes'])
    assert len(prior)==576
    assert not prior & set(manifest['splits']['train']['story_hashes'])
    assert not set(groups['train'])&set(groups['val'])
    assert len(groups['train'])==4096 and len(groups['val'])==128
    payload=json.loads((ROOT/'space/model.json').read_text())
    stoi={c:i for i,c in enumerate(payload['vocab'])}
    encoded={name:[torch.tensor([stoi[c] for c in s],dtype=torch.long) for s in stories] for name,stories in groups.items()}
    return payload,manifest,prior,encoded


def setup():
    torch.set_num_threads(1);torch.use_deterministic_algorithms(True)


def fit(width,output):
    setup()
    if output.resolve()==(ROOT/'space').resolve() or (ROOT/'space').resolve() in output.resolve().parents:
        raise ValueError('Do not write experiments into deployed assets')
    dest=output/f'width_{width}'
    if dest.exists():
        raise ValueError('Preserve existing training outputs')
    payload,manifest,prior,docs=data()
    model=initialize(payload['config'],width)
    cfg={**payload['config'],'n_embed':width}
    dest.mkdir(parents=True)
    torch.save({'model_state_dict':model.state_dict(),'config':cfg,'vocab':payload['vocab'],'seed':1729},dest/'initial.pt')
    windows=fixed_windows(docs['val'],3702,cfg['context_length'])
    print(json.dumps({'width':width,'parameters':sum(p.numel() for p in model.parameters()),'initialization':'random_from_scratch'}),flush=True)
    selected,record=train(model,docs['train'],windows,'constant',7200,patience=37)
    assert record['executed_steps']==7200
    torch.save({'model_state_dict':selected.state_dict(),'config':cfg,'vocab':payload['vocab'],'seed':1729},dest/'checkpoint.pt')
    record.update({'width':width,'config':cfg,'parameter_count':sum(p.numel() for p in selected.parameters()),
                   'initialization':'random_from_scratch','initialization_seed':1729,
                   'initial_checkpoint_sha256':sha((dest/'initial.pt').read_bytes()),
                   'checkpoint_sha256':sha((dest/'checkpoint.pt').read_bytes()),
                   'training_stories':4096,'optimizer_character_predictions':7200*16*64,
                   'training_corpus_sha256':manifest['splits']['train']['sha256'],
                   'validation_corpus_sha256':manifest['splits']['val']['sha256'],
                   'torch_version':torch.__version__,'device':'cpu','threads':1,
                   'final_test_read':False,'worker_script_sha256':sha(Path(__file__).read_bytes())})
    (dest/'selection.json').write_text(json.dumps(record,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'width':width,'selected_step':record['selected_step'],'validation_ce':record['validation_ce'],'runtime_seconds':record['runtime_seconds']}),flush=True)


def load_model(folder):
    ckpt=load_checkpoint(folder/'checkpoint.pt', map_location=None)
    model=Transformer(**ckpt['config']);model.load_state_dict(ckpt['model_state_dict']);model.eval()
    return model,ckpt


def finish(output):
    setup()
    payload,manifest,prior,docs=data()
    windows=fixed_windows(docs['val'],3702,64)
    records={width:json.loads((output/f'width_{width}/selection.json').read_text()) for width in (32,64)}
    models={};checkpoints={}
    for width,record in records.items():
        folder=output/f'width_{width}'
        assert record['training_corpus_sha256']==manifest['splits']['train']['sha256']
        assert record['validation_corpus_sha256']==manifest['splits']['val']['sha256']
        assert record['worker_script_sha256']==sha(Path(__file__).read_bytes())
        assert sha((folder/'checkpoint.pt').read_bytes())==record['checkpoint_sha256']
        assert sha((folder/'initial.pt').read_bytes())==record['initial_checkpoint_sha256']
        assert record['executed_steps']==7200 and record['optimizer_character_predictions']==7372800
        models[f'width_{width}'],checkpoints[width]=load_model(folder)
        assert abs(evaluate(models[f'width_{width}'],windows)[0]-record['validation_ce'])<1e-12
    # Additional trained32-wide models are benchmarks, not matched controls.
    models['live_004'],_=load_model(ROOT/'space')
    previous=ROOT/'experiments/budget-extension/extended_7200'
    previous_record=json.loads((previous/'training.json').read_text())
    assert sha((previous/'checkpoint.pt').read_bytes())==previous_record['checkpoint_sha256']
    models['continued_w32'],_=load_model(previous)
    preferred=min(records,key=lambda w:records[w]['validation_ce'])
    frozen_hashes={str(w):sha((output/f'width_{w}/selection.json').read_bytes()) for w in records}
    # The final-test stories are first read only after both selected model states are fixed.
    folder=ROOT/'data/capacity_story_test'
    test_manifest=json.loads((folder/'manifest.json').read_text())
    raw=(folder/'stories.json').read_bytes();assert sha(raw)==test_manifest['stories_sha256']
    stories=json.loads(raw);hashes=[sha(s.encode()) for s in stories]
    assert len(stories)==len(set(hashes))==128 and hashes==test_manifest['story_hashes']
    assert not set(hashes)&(prior|set(manifest['splits']['train']['story_hashes']))
    assert set(test_manifest['prior_evaluation_story_hashes'])==prior
    stoi={c:i for i,c in enumerate(payload['vocab'])}
    test_windows=fixed_windows([torch.tensor([stoi[c] for c in s],dtype=torch.long) for s in stories],3703,64)
    metrics={};per_story={}
    for name,model in models.items():
        test_ce,per_story[name]=evaluate(model,test_windows)
        metrics[name]={'val':evaluate(model,windows)[0],'test':test_ce,'parameters':sum(p.numel() for p in model.parameters())}
    gate=all(metric_gate(metrics[name]['val'],metrics['width_64']['val'],metrics[name]['test'],metrics['width_64']['test']) for name in ['width_32','live_004','continued_w32'])
    with (output/'per_story.csv').open('w') as handle:
        writer=csv.writer(handle);writer.writerow(['story_sha256',*models])
        writer.writerows([h,*[per_story[name][i] for name in models]] for i,h in enumerate(hashes))
    prompts=['tom lost his red ball. he looked under the bed and','lily and her dog went to the park. the dog saw',
             'the rabbit hid a carrot under a tree. later,','sam gave mia a blue box. inside the box was']
    samples=[]
    for prompt in prompts:
        for seed in [42,1729,2026]:
            row={'prompt':prompt,'seed':seed,'temperature':0.7,'new_characters':160}
            for name,model in models.items():
                torch.manual_seed(seed)
                ids=model.generate(torch.tensor([[stoi[c] for c in prompt]]),160,temperature=0.7)
                row[name]=''.join(payload['vocab'][int(i)] for i in ids[0])
                assert len(row[name])==len(prompt)+160
            samples.append(row)
    (output/'samples.json').write_text(json.dumps(samples,indent=2)+'\n')
    for width,record in records.items():
        model=models[f'width_{width}'];dest=output/f'width_{width}';cfg=checkpoints[width]['config']
        exported={**payload,'config':cfg,'weights':{k:v.tolist() for k,v in model.state_dict().items()}}
        model_bytes=json.dumps(exported,separators=(',',':'),ensure_ascii=False).encode();(dest/'model.json').write_bytes(model_bytes)
        restored,_=load_model(dest);parity=[]
        with torch.no_grad():
            for prompt in ['The ','A little ','The village held a lantern walk at the end of autumn. Children cut']:
                ids=[stoi[c] for c in prompt][-64:];x=torch.tensor([ids]);logits=model(x)[0][0,-1]
                assert torch.equal(logits,restored(x)[0][0,-1])
                parity.append({'ids':ids,'logits':logits.tolist()})
        training={'model_sha256':sha(model_bytes),'checkpoint_sha256':record['checkpoint_sha256'],
                  'parameter_count':record['parameter_count'],'initialization_model_sha256':None,
                  'initialization':'random_from_scratch','initial_checkpoint_sha256':record['initial_checkpoint_sha256'],
                  'seed':1729,'torch_version':torch.__version__,'device':'cpu','steps':7200,'selected_step':record['selected_step'],
                  'selected_run':record,'history':[{'step':r['step'],'val_loss':r['validation_ce']} for r in record['history']],
                  'dataset':manifest,'fresh_test':test_manifest,'parity':parity,'parity_tolerance':0.0001,
                  'evaluation':{'baseline_val_loss':metrics['live_004']['val'],'candidate_val_loss':metrics[f'width_{width}']['val'],
                                'baseline_test_loss':metrics['live_004']['test'],'candidate_test_loss':metrics[f'width_{width}']['test']},
                  'promotion':False,'quality_review':'Pending; loss is not a coherence score.'}
        (dest/'training.json').write_text(json.dumps(training,indent=2,allow_nan=False)+'\n')
        for name in ['inference.js','generation-worker.js','test_inference.cjs','test_generation.cjs']:
            shutil.copyfile(ROOT/'space'/name,dest/name)
    report={'experiment':'matched_token_scratch_width32_vs64','metrics':metrics,'training_records':records,
            'selection_record_hashes_before_test':frozen_hashes,'validation_preferred_width':preferred,
            'wide_loss_gate_passed':gate,'relative_test_ce_reduction_wide_vs_matched_small':1-metrics['width_64']['test']/metrics['width_32']['test'],
            'relative_test_ce_reduction_wide_vs_live':1-metrics['width_64']['test']/metrics['live_004']['test'],
            'relative_test_ce_reduction_wide_vs_continued_small':1-metrics['width_64']['test']/metrics['continued_w32']['test'],
            'dataset':manifest,'fresh_test':test_manifest,'script_sha256':sha(Path(__file__).read_bytes()),
            'test_method':'Four seeded64-character windows per story,128 new stories,32768 character predictions per model; windows may overlap. Scored only after both validation selections.',
            'promotion':False,'limitations':['One training/initialization seed; no statistical significance claim.',
            'Matched token budget is not matched FLOPs or runtime; wider model uses more computation.',
            'Previously trained small models have different histories and are benchmarks,not capacity controls.',
            'Reused validation already informed earlier experiments; new final test is exact-disjoint,near duplicates not assessed.',
            'Generated-text inspection is unblinded and qualitative; lower loss is not proof of coherence.']}
    (output/'evaluation.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k in ['metrics','validation_preferred_width','wide_loss_gate_passed','relative_test_ce_reduction_wide_vs_matched_small','relative_test_ce_reduction_wide_vs_live','relative_test_ce_reduction_wide_vs_continued_small']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True)
    mode=p.add_mutually_exclusive_group(required=True);mode.add_argument('--width',type=int,choices=[32,64]);mode.add_argument('--evaluate',action='store_true')
    args=p.parse_args()
    if args.evaluate:
        finish(args.output)
    else:
        fit(args.width,args.output)
