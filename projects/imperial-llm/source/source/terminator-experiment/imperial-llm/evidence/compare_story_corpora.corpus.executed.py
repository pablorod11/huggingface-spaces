"""Compare old and expanded corpora with identical model initialization and token budget."""
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
from src.models.transformer import Transformer


def loss_gate(baseline,control,expanded):
    return (metric_gate(baseline['val'],expanded['val'],baseline['test'],expanded['test'])
            and metric_gate(control['val'],expanded['val'],control['test'],expanded['test']))


def run(output):
    if output.exists():
        raise ValueError('Preserve previous results: output must be new')
    torch.set_num_threads(1);torch.use_deterministic_algorithms(True);torch.manual_seed(1729)
    baseline_dir=ROOT/'space'
    payload=json.loads((baseline_dir/'model.json').read_text());cfg=payload['config'];vocab=payload['vocab']
    baseline_hash=sha((baseline_dir/'model.json').read_bytes())
    assert baseline_hash=='986699bbf0668f6d1aa5da67c373fe53770f7ce5e9efb3e337b5c0d7a42fe376'
    baseline=Transformer(**cfg)
    baseline.load_state_dict(torch.load(baseline_dir/'checkpoint.pt',weights_only=True)['model_state_dict']);baseline.eval()
    assert all(torch.equal(v,torch.tensor(payload['weights'][k],dtype=v.dtype)) for k,v in baseline.state_dict().items())
    stoi={c:i for i,c in enumerate(vocab)}
    encode=lambda stories:[torch.tensor([stoi[c] for c in s],dtype=torch.long) for s in stories]
    def load(name,split):
        folder=ROOT/'data'/name;manifest=json.loads((folder/'manifest.json').read_text())
        raw=(folder/f'{split}.txt').read_bytes();detail=manifest['splits'][split]
        if sha(raw)!=detail['sha256']:
            raise ValueError('Corpus checksum mismatch')
        return recover_stories(raw,detail['story_hashes']),manifest
    old,_=load('story_corpus','train')
    expanded,manifest=load('expanded_story_corpus','train')
    validation,_=load('expanded_story_corpus','val')
    assert len(old)==512 and len(expanded)==4096 and len(validation)==128
    assert set(old)<=set(expanded) and not set(expanded)&set(validation)
    prior=set(manifest['prior_evaluation_story_hashes'])
    assert not prior & {sha(s.encode()) for s in expanded+validation}
    val_windows=fixed_windows(encode(validation),3702,cfg['context_length'])
    baseline_val=evaluate(baseline,val_windows)[0]
    output.mkdir(parents=True)
    shutil.copytree(baseline_dir,output/'baseline',ignore=shutil.ignore_patterns('source.zip'))
    arms={};records={}
    for name,stories in [('control_512',old),('expanded_4096',expanded)]:
        print('ARM '+name,flush=True)
        # Patience exceeds all12 scheduled checks: exactly equal optimizer-token budgets.
        arms[name],records[name]=train(baseline,encode(stories),val_windows,'constant',2400,patience=13)
        assert records[name]['executed_steps']==2400
        records[name]['training_stories']=len(stories)
        records[name]['optimizer_character_predictions']=2400*16*cfg['context_length']
    # All checkpoints and the validation-preferred arm are fixed before any final-test read.
    preferred=min(records,key=lambda k:records[k]['validation_ce'])
    folder=ROOT/'data/expanded_story_test'
    test_manifest=json.loads((folder/'manifest.json').read_text())
    test_raw=(folder/'stories.json').read_bytes();assert sha(test_raw)==test_manifest['stories_sha256']
    test=json.loads(test_raw);test_hashes=[sha(s.encode()) for s in test]
    assert len(test)==128 and test_hashes==test_manifest['story_hashes'] and len(set(test_hashes))==128
    assert not set(test_hashes)&(prior|{sha(s.encode()) for s in expanded+validation})
    test_windows=fixed_windows(encode(test),3703,cfg['context_length'])
    all_models={'baseline_004':baseline,**arms};metrics={};story_losses={}
    for name,model in all_models.items():
        score,story_losses[name]=evaluate(model,test_windows)
        metrics[name]={'val':baseline_val if name=='baseline_004' else records[name]['validation_ce'],'test':score}
    objective_gate=loss_gate(metrics['baseline_004'],metrics['control_512'],metrics['expanded_4096'])
    with (output/'per_story.csv').open('w') as handle:
        writer=csv.writer(handle);writer.writerow(['story_sha256',*all_models])
        writer.writerows([h,*[story_losses[k][i] for k in all_models]] for i,h in enumerate(test_hashes))
    samples=[]
    prompts=['tom lost his red ball. he looked under the bed and','lily and her dog went to the park. the dog saw',
             'the rabbit hid a carrot under a tree. later,','sam gave mia a blue box. inside the box was']
    for prompt in prompts:
        for seed in [42,1729,2026]:
            row={'prompt':prompt,'seed':seed,'temperature':0.7,'new_characters':160}
            for name,model in all_models.items():
                torch.manual_seed(seed)
                ids=model.generate(torch.tensor([[stoi[c] for c in prompt]]),160,temperature=0.7)
                row[name]=''.join(vocab[int(i)] for i in ids[0])
                assert len(row[name])==len(prompt)+160
            samples.append(row)
    (output/'samples.json').write_text(json.dumps(samples,indent=2)+'\n')
    for name,model in arms.items():
        dest=output/name;dest.mkdir()
        exported={**payload,'weights':{k:v.tolist() for k,v in model.state_dict().items()}}
        raw=json.dumps(exported,separators=(',',':'),ensure_ascii=False).encode();(dest/'model.json').write_bytes(raw)
        torch.save({'model_state_dict':model.state_dict(),'config':cfg,'vocab':vocab,'seed':1729},dest/'checkpoint.pt')
        restored=Transformer(**cfg);restored.load_state_dict(torch.load(dest/'checkpoint.pt',weights_only=True)['model_state_dict']);restored.eval()
        parity=[]
        with torch.no_grad():
            for prompt in ['The ','A little ','The village held a lantern walk at the end of autumn. Children cut']:
                ids=[stoi[c] for c in prompt][-64:];x=torch.tensor([ids]);logits=model(x)[0][0,-1]
                assert torch.equal(logits,restored(x)[0][0,-1])
                parity.append({'ids':ids,'logits':logits.tolist()})
        record={'model_sha256':sha(raw),'checkpoint_sha256':sha((dest/'checkpoint.pt').read_bytes()),
                'parameter_count':sum(p.numel() for p in model.parameters()),'initialization_model_sha256':baseline_hash,
                'torch_version':torch.__version__,'device':'cpu','seed':1729,'steps':2400,'selected_step':records[name]['selected_step'],
                'selected_run':records[name],'history':[{'step':r['step'],'val_loss':r['validation_ce']} for r in records[name]['history']],
                'parity':parity,'parity_tolerance':0.0001,'dataset':manifest,'fresh_test':test_manifest,
                'evaluation':{'baseline_val_loss':baseline_val,'candidate_val_loss':metrics[name]['val'],
                              'baseline_test_loss':metrics['baseline_004']['test'],'candidate_test_loss':metrics[name]['test']},
                'promotion':False,'qualitative_review':'Pending; lower loss alone is insufficient.'}
        (dest/'training.json').write_text(json.dumps(record,indent=2,allow_nan=False)+'\n')
        for file in ['inference.js','generation-worker.js','test_inference.cjs','test_generation.cjs']:
            shutil.copyfile(baseline_dir/file,dest/file)
    report={'initialization_model_sha256':baseline_hash,'source_space_revision':'85bbaa46eb8f51c088ea58cb9983f8f97de8bde8',
            'script_sha256':sha(Path(__file__).read_bytes()),'torch_version':torch.__version__,'seed':1729,
            'parameter_count':30643,'context_length':64,'training_records':records,'validation_preferred_arm':preferred,
            'metrics':metrics,'expanded_loss_gate_passed':objective_gate,
            'relative_test_ce_reduction_expanded_vs_baseline':1-metrics['expanded_4096']['test']/metrics['baseline_004']['test'],
            'relative_test_ce_reduction_expanded_vs_control':1-metrics['expanded_4096']['test']/metrics['control_512']['test'],
            'dataset':manifest,'fresh_test':test_manifest,
            'test_method':'Four seeded64-character windows per story;128 new stories,32768 character predictions per model. Windows may overlap. All3 models scored only after validation selection.',
            'promotion':False,'limitations':['Single training seed; no statistical significance claim.','Exact duplicates excluded; near duplicates not assessed.',
            'Same-domain sampled character CE is not a coherence score.','Generation review is unblinded and qualitative.','No live weights or original final-test scores were changed.']}
    (output/'evaluation.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k in ['metrics','validation_preferred_arm','expanded_loss_gate_passed','relative_test_ce_reduction_expanded_vs_baseline','relative_test_ce_reduction_expanded_vs_control']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True)
    run(p.parse_args().output)
