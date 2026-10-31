/* UI orchestration. Model work runs in a worker; user text is never HTML. */
(async function () {
  const $ = id => document.getElementById(id);
  let model, payload, record, worker, busy = false;
  const tabs = [...document.querySelectorAll('.tab')];
  function selectPanel() {
    const id = location.hash.slice(1); if(id==='main-content')return; const selected = tabs.find(tab => tab.dataset.panel === id) ?? tabs[0];
    tabs.forEach(tab => { const active = tab === selected; tab.classList.toggle('active', active); if(tab.tagName==='A'){if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}else tab.setAttribute('aria-pressed',active); $(tab.dataset.panel).hidden = !active; });
  }
  window.addEventListener('hashchange',selectPanel); selectPanel();
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('prompt').value = button.dataset.prompt; clearError(); $('prompt').focus(); }));
  $('temperature').addEventListener('input', () => { $('temperature-value').value = $('temperature').value; });
  function clearError() { if($('input-error'))$('input-error').textContent=''; for(const id of ['prompt','seed'])$(id).removeAttribute('aria-invalid'); }
  function inputError(id,text) { const el=$('input-error')??$('run-status'); el.textContent=text; $(id).setAttribute('aria-invalid','true'); const details=$(id).closest('details'); if(details)details.open=true; $(id).focus(); }
  function finish(status) {
    worker?.terminate(); worker=null; busy=false;
    ['prompt','seed','length','temperature'].forEach(id=>$(id).disabled=false);
    document.querySelectorAll('[data-prompt]').forEach(button=>button.disabled=false);
    $('run').disabled=!model; $('stop').hidden=true; $('copy').disabled=!$('output').textContent.trim();
    $('run-status').textContent=status;
  }
  $('stop').addEventListener('click', () => { finish('Stopped. Your partial text is kept.'); $('run').focus(); });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('output').textContent); $('copy').textContent='Copied'; }
    catch { $('run-status').textContent='Select the output text to copy.'; }
  });
  function probabilities(logits) { const max=Math.max(...logits), exp=logits.map(x=>Math.exp(x-max)), sum=exp.reduce((a,b)=>a+b,0); return exp.map(x=>x/sum); }
  function distribution(logits) {
    const top=probabilities(logits).map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p).slice(0,6);
    $('predictions').replaceChildren(...top.map(({p,i})=>{
      const row=document.createElement('div');row.className='prob'; const label=document.createElement('code');label.textContent=model.vocab[i]==='\n'?'↵':model.vocab[i]===' '?'␣':model.vocab[i];
      const track=document.createElement('div');track.className='track';const bar=document.createElement('i');bar.style.width=`${p*100}%`;track.append(bar);
      const value=document.createElement('span');value.textContent=`${(p*100).toFixed(1)}%`;row.append(label,track,value);return row;
    }));
  }
  $('run').addEventListener('click', () => {
    if(busy||!model)return; clearError();
    const prompt=$('prompt').value;
    if(!prompt.trim()){inputError('prompt','Enter a starting prompt or choose an example.');return;}
    try{model.encode(prompt);}catch(error){inputError('prompt',error.message);return;}
    const rawSeed=$('seed').value, seed=Number(rawSeed);
    if(!rawSeed.trim()||!Number.isInteger(seed)||seed<0||seed>4294967295){inputError('seed','Use an integer seed from 0 to 4294967295.');return;}
    if(typeof Worker==='undefined'){$('run-status').textContent='This browser cannot run background workers. Try a current Chrome, Safari or Firefox.';return;}
    const request={payload,prompt,seed,temperature:Number($('temperature').value),length:Number($('length').value)};
    busy=true; $('run').disabled=true; $('stop').hidden=false; $('copy').disabled=true;
    ['prompt','seed','length','temperature'].forEach(id=>$(id).disabled=true);document.querySelectorAll('[data-prompt]').forEach(button=>button.disabled=true);
    $('run-status').textContent='Generating…';$('copy').textContent='Copy text';
    const prefix=document.createElement('span');prefix.className='prompt-text';prefix.textContent=prompt;
    const generated=document.createElement('span');$('output').replaceChildren(prefix,generated);$('predictions').textContent='The next-character probabilities appear when generation completes.';
    const start=performance.now();
    try {
      const active=new Worker('generation-worker.js?runtime=kv1');worker=active;
      active.onmessage=event=>{
        if(worker!==active)return;
        const message=event.data;
        if(message.type==='error'){finish(`Generation stopped: ${message.message}`);return;}
        generated.textContent=message.text;
        const seconds=(performance.now()-start)/1000;
        $('performance').textContent=`${message.count} characters · ${seconds.toFixed(1)}s · seed ${seed}`;
        if(message.type==='done'){distribution(message.logits);finish('Complete');}
      };
      active.onerror=()=>{if(worker===active)finish('The background model stopped. Reload the page and try again.');};
      active.postMessage(request);
    } catch { finish('The background model could not start. Reload the page and try again.'); }
  });
  function chart(rows) {
    const svg = $('loss-chart'), ns='http://www.w3.org/2000/svg';
    const add=(tag,attrs,text)=>{ const el=document.createElementNS(ns,tag); Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v)); if(text!==undefined) el.textContent=text; svg.append(el); return el; };
    svg.replaceChildren();
    const points=rows.map(r=>({step:r.step,train:r.train_loss??r.train,val:r.val_loss??r.val??r.validation_ce}));
    const series=[['train','var(--accent)','Training'],['val','var(--muted)','Validation']].filter(([key])=>points.some(r=>Number.isFinite(r[key])));
    const note=$('curve-note'), legend=document.querySelector('.legend');
    legend.replaceChildren(...series.map(([, ,label])=>{const span=document.createElement('span');span.textContent=label;return span;}));
    if(!series.length){note.hidden=false;note.textContent='No loss history was recorded for this checkpoint.';svg.hidden=true;return;}
    const validationOnly=series.length===1&&series[0][0]==='val';
    document.querySelector('.chart-card h3').textContent=validationOnly?'Validation curve':'Learning curve';
    svg.setAttribute('aria-label',validationOnly?'Recorded validation cross entropy by optimizer step':'Recorded training and validation cross entropy by optimizer step');
    note.hidden=!validationOnly;
    if(validationOnly)note.textContent=record.chart_note??'Training loss was measured only at the selected checkpoint. The curve shows recorded validation checks.';
    const maxStep=Math.max(...points.map(r=>r.step)), low=0, high=Math.ceil(Math.max(...points.flatMap(r=>series.map(([key])=>r[key])).filter(Number.isFinite)));
    const x=s=>50+s/Math.max(1,maxStep)*820, y=v=>235-(v-low)/Math.max(1,high-low)*210;
    for(let i=0;i<=4;i++){const v=low+(high-low)*i/4; add('line',{x1:50,x2:870,y1:y(v),y2:y(v),stroke:'var(--line)','stroke-width':1}); add('text',{x:35,y:y(v)+4,fill:'var(--muted)','font-size':11,'text-anchor':'end'},v.toFixed(1));}
    [0,maxStep/2,maxStep].forEach(s=>add('text',{x:x(s),y:260,fill:'var(--muted)','font-size':11,'text-anchor':'middle'},String(s)));
    for(const [key,color] of series) add('polyline',{points:points.filter(r=>Number.isFinite(r[key])).map(r=>`${x(r.step)},${y(r[key])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.5});
  }
  try {
    const responses = await Promise.all(['model.json','training.json'].map(async path=>{const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`${path}: ${response.status}`);return response;}));
    const bytes=await responses[0].arrayBuffer();
    payload=JSON.parse(new TextDecoder().decode(bytes)); record=await responses[1].json();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==record.model_sha256)throw new Error('Model checksum does not match the run record. Reload the page to fetch a consistent release.');
    model = new ImperialModel(payload);
    const config = payload.config; model.config ??= config; model.vocab ??= payload.vocab;
    const cases = record.parity_cases ?? record.parity ?? [];
    let maxError=0;
    if(!cases.length) throw new Error('The export is missing parity cases.');
    for(const test of cases){const expected=test.expected_final_logits??test.logits;const actual=model.forward(test.token_ids??test.ids);if(actual.length!==expected.length)throw new Error('Parity output shape mismatch.');maxError=Math.max(maxError,...actual.map((x,i)=>Math.abs(x-expected[i])));}
    if(!Number.isFinite(maxError) || maxError>(record.parity_tolerance??0.0001))throw new Error('Browser and Python model outputs disagree.');
    const meta=record.meta??record, history=record.history??record.curves??[], last=history.at(-1)??{};
    $('param-count').textContent=(meta.parameters??meta.parameter_count).toLocaleString(); $('block-count').textContent=config.N_BLOCKS; $('context-count').textContent=config.context_length;
    const lossText=value=>value==null||!Number.isFinite(Number(value))?'Not recorded':Number(value).toFixed(3);
    $('steps').textContent=(record.steps??meta.train_steps??meta.steps).toLocaleString(); $('train-loss').textContent=lossText(meta.train_loss??last.train_loss??last.train); $('val-loss').textContent=lossText(meta.val_loss??last.val_loss??last.val); $('train-time').textContent=`${Number(meta.runtime_seconds).toFixed(1)}s`;
    if($('selected-step'))$('selected-step').textContent=String(record.selected_step??meta.train_steps??record.steps);
    const hasTest=Number.isFinite(record.evaluation?.baseline_test_loss)&&Number.isFinite(record.evaluation?.candidate_test_loss);
    const format=value=>Number(value).toLocaleString();
    $('data-description').textContent=record.data_description??`${record.provenance} ${format(record.corpus_bytes)} characters total. ${format(record.split?.train_characters)} training; ${format(record.split?.val_characters)} validation${hasTest?`; ${format(record.split.test_characters)} test`:''}. ${hasTest?'The fixed earlier character alphabet is retained; whole normalized stories are split and exact duplicates removed.':'Character inventory comes from the original corpus; validation transitions are excluded from optimization.'}`;
    if($('test-metrics'))$('test-metrics').hidden=!hasTest;
    if(hasTest){$('baseline-test-loss').textContent=Number(record.evaluation.baseline_test_loss).toFixed(3);$('test-loss').textContent=Number(record.evaluation.candidate_test_loss).toFixed(3);}
    $('verification').textContent=record.verification_note??`Browser/Python logit parity passed on ${cases.length} contexts (maximum absolute error ${maxError.toExponential(2)}). Training runtime: PyTorch ${record.torch_version}, CPU. ${hasTest?'The checkpoint was selected on validation. A separate test split was evaluated once after selection; fixed sampled context windows may overlap.':'Validation data was used for selection, with no independent test set.'}`;
    $('model-id').textContent=`MODEL SHA-256\n${digest}`; chart(history);
    $('load-status').textContent=`Model verified · ${payload.vocab.length} characters · weights SHA-256 ${digest.slice(0,12)}…`;
    $('run').disabled=false;
  } catch(error) { $('load-status').textContent=`Model unavailable: ${error.message}`; $('load-status').style.color='#b44f36'; }
})();
