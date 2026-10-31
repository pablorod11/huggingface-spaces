"""Bounded story fine-tuning from deployed model003; test only after validation selection."""
from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import sys
import time
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.refinement_experiment import recover_stories, sha
from src.checkpoint import load_checkpoint
from src.models.transformer import Transformer


def story_batch(docs, generator, context=64, size=16):
    """Uniform story/window sampling; never synthesize transitions between stories."""
    if not docs or any(len(d) <= context for d in docs):
        raise ValueError('Every story must exceed the context length')
    xs, ys = [], []
    for choice in torch.randint(len(docs), (size,), generator=generator):
        doc = docs[int(choice)]
        start = int(torch.randint(len(doc)-context, (1,), generator=generator))
        xs.append(doc[start:start+context]); ys.append(doc[start+1:start+context+1])
    return torch.stack(xs), torch.stack(ys)


def learning_rate(schedule, step, steps):
    if schedule == 'constant':
        return 0.001
    if schedule != 'cosine' or steps <= 0 or not 0 <= step <= steps:
        raise ValueError('Invalid schedule or step')
    return 0.00003 + 0.5 * (0.0003-0.00003) * (1+math.cos(math.pi*step/steps))


def metric_gate(baseline_val, candidate_val, baseline_test, candidate_test):
    values = (baseline_val, candidate_val, baseline_test, candidate_test)
    return (all(math.isfinite(v) and v >= 0 for v in values)
            and candidate_val < baseline_val and candidate_test < baseline_test)


def weighted_ce(losses, counts):
    if len(losses) != len(counts) or not counts or any(n <= 0 for n in counts):
        raise ValueError('Positive matching token counts required')
    if any(not math.isfinite(v) or v < 0 for v in losses):
        raise ValueError('Invalid cross entropy')
    return sum(v*n for v,n in zip(losses,counts))/sum(counts)


def fixed_windows(docs, seed, context):
    """Four fixed windows per story; overlapping windows are possible."""
    rng = torch.Generator().manual_seed(seed)
    return [story_batch([doc], rng, context, 4) for doc in docs]


@torch.no_grad()
def evaluate(model, windows):
    model.eval()
    losses = [float(model(x,y)[1]) for x,y in windows]
    return weighted_ce(losses, [y.numel() for x,y in windows]), losses


def train(baseline, docs, windows, schedule, steps, patience=3, verify_at_step=None, diagnostic_windows=None):
    model = copy.deepcopy(baseline)
    rng = torch.Generator().manual_seed(1729)
    torch.manual_seed(1729)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate(schedule,0,steps))
    best_val = evaluate(model, windows)[0]
    best, selected, stale = copy.deepcopy(model.state_dict()), 0, 0
    history = [{'step':0, 'validation_ce':best_val}]

    def log_diagnostic(row):
        if diagnostic_windows is not None:
            previous_mode = model.training
            try:
                with torch.random.fork_rng(devices=[]):
                    row['training_ce'] = evaluate(model, diagnostic_windows)[0]
            finally:
                model.train(previous_mode)

    log_diagnostic(history[0])
    verified_prefix_step = None
    started = time.perf_counter()
    for step in range(1, steps+1):
        lr = learning_rate(schedule, step-1, steps)
        for group in optimizer.param_groups:
            group['lr'] = lr
        model.train(); optimizer.zero_grad(set_to_none=True)
        _, loss = model(*story_batch(docs,rng,baseline.context_length))
        if not torch.isfinite(loss):
            raise ValueError('Nonfinite training loss')
        loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); optimizer.step()
        if verify_at_step is not None and step == verify_at_step[0]:
            expected = verify_at_step[1]
            actual = model.state_dict()
            if actual.keys() != expected.keys() or any(not torch.equal(v, expected[k]) for k,v in actual.items()):
                raise RuntimeError('Training prefix differs from the previous reference checkpoint')
            verified_prefix_step = step
            print(json.dumps({'verified_prefix_step':step}),flush=True)
        if step % 200 == 0 or step == steps:
            value = evaluate(model,windows)[0]
            history.append({'step':step,'validation_ce':value,'learning_rate':lr})
            log_diagnostic(history[-1])
            print(json.dumps({'schedule':schedule,**history[-1]}),flush=True)
            if value < best_val:
                best_val, best, selected, stale = value, copy.deepcopy(model.state_dict()), step, 0
            else:
                stale += 1
            if stale >= patience:
                break
    if verify_at_step is not None and verified_prefix_step is None:
        raise RuntimeError('Training prefix verification step was not reached')
    model.load_state_dict(best); model.eval()
    return model, {'schedule':schedule,'max_steps':steps,'executed_steps':step,
                   'selected_step':selected,'validation_ce':best_val,'history':history,
                   'runtime_seconds':time.perf_counter()-started,
                   'optimizer':'AdamW, default betas and weight_decay0.01; clip1.0',
                   'batch_size':16,'verified_prefix_step':verified_prefix_step,'patience_validation_checks':patience,'validation_every_steps':200}


def run(output, steps=2400, baseline_dir=None):
    if steps < 1 or steps > 2400:
        raise ValueError('Bounded steps must be1..2400')
    if output.exists():
        raise ValueError('Output exists: use a new directory to preserve previous results')
    deployed = baseline_dir if baseline_dir is not None else ROOT/'space'
    if output.resolve() == deployed.resolve() or deployed.resolve() in output.resolve().parents:
        raise ValueError('Cannot overwrite deployed Space')
    torch.set_num_threads(1); torch.use_deterministic_algorithms(True); torch.manual_seed(1729)
    raw = (deployed/'model.json').read_bytes()
    payload = json.loads(raw); cfg, vocab = payload['config'], payload['vocab']
    record = json.loads((deployed/'training.json').read_text())
    if sha(raw) != record['model_sha256']:
        raise ValueError('Baseline checksum mismatch')
    ckpt = load_checkpoint(deployed/'checkpoint.pt',map_location='cpu')
    baseline = Transformer(**cfg); baseline.load_state_dict(ckpt['model_state_dict']); baseline.eval()
    for key,value in baseline.state_dict().items():
        if not torch.equal(value,torch.tensor(payload['weights'][key],dtype=value.dtype)):
            raise ValueError('Baseline checkpoint/JSON mismatch: '+key)
    stoi = {c:i for i,c in enumerate(vocab)}
    encode = lambda stories: [torch.tensor([stoi[c] for c in s],dtype=torch.long) for s in stories]
    corpus = ROOT/'data/story_corpus'
    manifest = json.loads((corpus/'manifest.json').read_text())
    groups = {}
    for name in ('train','val'):
        data = (corpus/f'{name}.txt').read_bytes()
        if sha(data) != manifest['splits'][name]['sha256']:
            raise ValueError('Corpus checksum mismatch: '+name)
        groups[name] = recover_stories(data,manifest['splits'][name]['story_hashes'])
    memberships = [set(s['story_hashes']) for s in manifest['splits'].values()]
    for i,a in enumerate(memberships):
        if any(a & b for b in memberships[i+1:]):
            raise ValueError('Packaged split overlap')
    output.mkdir(parents=True)
    backup = output/'baseline'; backup.mkdir()
    for name in ('model.json','checkpoint.pt','training.json'):
        (backup/name).write_bytes((deployed/name).read_bytes())
    docs = encode(groups['train'])
    val_windows = fixed_windows(encode(groups['val']),2702,cfg['context_length'])
    baseline_val = evaluate(baseline,val_windows)[0]
    candidates = [train(baseline,docs,val_windows,s,steps) for s in ('constant','cosine')]
    selected, selected_record = min(candidates,key=lambda item:item[1]['validation_ce'])
    # Freeze selection before reading/scoring the fresh test stories. Do not retune after this.
    fresh = ROOT/'data/fresh_story_test'
    fresh_manifest = json.loads((fresh/'manifest.json').read_text())
    test_bytes = (fresh/'stories.json').read_bytes()
    stories = json.loads(test_bytes)
    if sha(test_bytes) != fresh_manifest['stories_sha256']:
        raise ValueError('Fresh test checksum mismatch')
    test_hashes = [sha(s.encode()) for s in stories]
    if (test_hashes != fresh_manifest['story_hashes'] or len(set(test_hashes)) != len(stories)
            or set(test_hashes) & set().union(*memberships)):
        raise ValueError('Fresh test membership or overlap failure')
    windows = fixed_windows(encode(stories),2703,cfg['context_length'])
    baseline_test, before = evaluate(baseline,windows)
    candidate_test, after = evaluate(selected,windows)
    gate = metric_gate(baseline_val,selected_record['validation_ce'],baseline_test,candidate_test)
    candidate = output/'candidate'; candidate.mkdir()
    exported = {**payload,'weights':{k:v.tolist() for k,v in selected.state_dict().items()}}
    model_bytes = json.dumps(exported,separators=(',',':'),ensure_ascii=False).encode()
    (candidate/'model.json').write_bytes(model_bytes)
    torch.save({'model_state_dict':selected.state_dict(),'config':cfg,'vocab':vocab,
                'seed':1729},candidate/'checkpoint.pt')
    restored = Transformer(**cfg)
    restored.load_state_dict(load_checkpoint(candidate/'checkpoint.pt', map_location=None)['model_state_dict']); restored.eval()
    parity = []
    with torch.no_grad():
        for prompt in ['The ','A little ','The village held a lantern walk at the end of autumn. Children cut']:
            ids = [stoi[c] for c in prompt][-cfg['context_length']:]
            x = torch.tensor([ids])
            logits = selected(x)[0][0,-1]
            if not torch.equal(restored(x)[0][0,-1],logits):
                raise ValueError('Checkpoint reload mismatch')
            parity.append({'ids':ids,'logits':logits.tolist()})
    samples = []
    for prompt in ['The little','One day','The sun','A little girl found']:
        outputs = {}
        for name,model in [('baseline',baseline),('candidate',selected)]:
            torch.manual_seed(42)
            generated = model.generate(torch.tensor([[stoi[c] for c in prompt]]),160,temperature=0.7)
            outputs[name] = ''.join(vocab[int(i)] for i in generated[0])
        samples.append({'prompt':prompt,'seed':42,'temperature':0.7,'new_characters':160,**outputs})
    (output/'samples.json').write_text(json.dumps(samples,indent=2)+'\n')
    with (output/'per_story.csv').open('w') as handle:
        writer = csv.writer(handle); writer.writerow(['story_sha256','baseline_ce','candidate_ce','change'])
        writer.writerows((h,b,a,a-b) for h,b,a in zip(test_hashes,before,after))
    evaluation = {'baseline_val_loss':baseline_val,'candidate_val_loss':selected_record['validation_ce'],
                  'baseline_test_loss':baseline_test,'candidate_test_loss':candidate_test,
                  'relative_test_ce_reduction':1-candidate_test/baseline_test,
                  'test_stories':len(stories),'test_char_predictions':sum(y.numel() for x,y in windows),
                  'stories_with_lower_ce':sum(a<b for a,b in zip(after,before)),
                  'worst_story_ce_increase':max(a-b for a,b in zip(after,before)),
                  'method':'4 seeded windows per story, context64, full-window CE; windows may overlap. Equal token counts per story. Final fresh test evaluated after schedule/checkpoint selection.',
                  'metric_gate_passed':gate,'promotion':False}
    report = {'schema_version':1,'initialization_model_sha256':sha(raw),
              'model_sha256':sha(model_bytes),'checkpoint_sha256':sha((candidate/'checkpoint.pt').read_bytes()),
              'experiment_script_sha256':sha(Path(__file__).read_bytes()),
              'source_space_revision':'d82cd96378ef7088905dcc5de8976a731607709e',
              'torch_version':torch.__version__,'device':'cpu','threads':1,'seed':1729,
              'parameter_count':sum(p.numel() for p in selected.parameters()),
              'runs':[r for m,r in candidates],'selected_run':selected_record,
              'steps':selected_record['executed_steps'],'selected_step':selected_record['selected_step'],
              'dataset':manifest,'fresh_test':fresh_manifest,'evaluation':evaluation,
              'parity':parity,'parity_tolerance':0.0001,
              'limitations':['Single training seed; no claim of statistical significance.',
                             'Exact duplicates excluded; near duplicates not assessed.',
                             'Reused validation set already informed model003; fresh test is independent of this selection.',
                             'Lower character CE does not establish story coherence, reasoning or assistant capability.',
                             '64-character context and fixed51-character vocabulary retained.',
                             'Metric gate alone does not authorize publication; browser checks and qualitative review required.']}
    for path in [candidate/'training.json',output/'evaluation.json']:
        path.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps(evaluation),flush=True)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--steps',type=int,default=2400)
    parser.add_argument('--baseline',type=Path,help='Model directory to continue from; defaults to space/')
    args = parser.parse_args()
    run(args.output,args.steps,args.baseline)
