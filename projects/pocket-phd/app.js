'use strict';
const $ = id => document.getElementById(id);
let currentRun = null, investigationController = null, modelController = null, selectedContext = null, removedEvidence = null;
function privateSession(){return Boolean($('private-session')?.checked);}
const array = value => Array.isArray(value) ? value : [];
const printable = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
function element(tag, content, className) { const node = document.createElement(tag); if(content !== undefined) node.textContent = printable(content); if(className) node.className = className; return node; }
const storageKey = 'pocket-phd-static-runs';
function saveRun(run, runs) {
  if(privateSession()){run.storage_warning='Private session: result stays in memory. Export before leaving.';return run;}
  try {
    if(runs===null) throw new Error('Existing notebook could not be read.');
    if(JSON.stringify(savedRuns())!==JSON.stringify(runs)) throw new Error('Notebook changed in another tab.');
    localStorage.setItem(storageKey,JSON.stringify([run,...runs.filter(item=>item.id!==run.id)].slice(0,50)));
  }
  catch {run.storage_warning='This result was not saved: storage is unavailable, full, unreadable, or changed in another tab. Existing notebook data was preserved. Export this result before leaving, then reload to inspect the notebook.';}
  return run;
}
function savedRuns() {
  try {
    const runs=JSON.parse(localStorage.getItem(storageKey) || '[]');
    if(!Array.isArray(runs) || runs.some(run=>!run || typeof run.id!=='string' || typeof run.question!=='string')) throw new Error();
    return runs;
  } catch { throw new Error('Browser notebook storage is unavailable or unreadable. Existing data has been preserved.'); }
}
function parseEvidence(raw) {
  if(typeof raw!=='string' || raw.length>250000) throw new Error('Evidence JSON must contain at most 250,000 characters.');
  if(!raw.trim()) return [];
  const sources=JSON.parse(raw);
  if(!Array.isArray(sources) || sources.length>20) throw new Error('Use a JSON array with at most 20 evidence records.');
  if(sources.some(source=>!source || typeof source!=='object' || Array.isArray(source) || typeof source.title!=='string' || !source.title.trim())) throw new Error('Each source needs a title.');
  return sources;
}
function formatEvidence(sources) {
  const formatted=JSON.stringify(sources,null,2);return formatted.length<=250000?formatted:JSON.stringify(sources);
}
function canUndoEvidenceRemoval() {
  return removedEvidence && $('sources').value===removedEvidence.after && JSON.stringify(selectedContext)===JSON.stringify(removedEvidence.selectionAfter);
}
function removeEvidence(index) {
  if(investigationController)return;
  try {
    const before=$('sources').value,sources=parseEvidence(before);
    if(!Number.isInteger(index) || index<0 || index>=sources.length)return;
    const selectionBefore=selectedContext===null?null:selectedContext.slice();
    const title=sources[index].title;sources.splice(index,1);
    const selectionAfter=selectionBefore===null?null:selectionBefore.filter(id=>Number(id.slice(1))!==index+1).map(id=>`S${Number(id.slice(1))-(Number(id.slice(1))>index+1?1:0)}`);
    const after=formatEvidence(sources);
    removedEvidence={before,after,selectionBefore,selectionAfter};
    $('sources').value=after;selectedContext=selectionAfter;previewEvidence();
    status(`Removed “${title}”. Undo is available until evidence or selection changes.`);
    $('context-preview').querySelector('button')?.focus();
  } catch(error){status(error.message,'error');}
}
function undoEvidenceRemoval() {
  if(investigationController || !canUndoEvidenceRemoval())return;
  $('sources').value=removedEvidence.before;selectedContext=removedEvidence.selectionBefore;removedEvidence=null;
  previewEvidence();status('Evidence restored.');
  $('context-preview').querySelector('button')?.focus();
}
function previewEvidence() {
  const target=$('context-preview');target.replaceChildren();
  try {
    const sources=parseEvidence($('sources').value),preview=window.PocketResearch.contextPreview(sources,selectedContext===null?undefined:selectedContext);
    if(canUndoEvidenceRemoval()){const undo=element('button','Undo removal');undo.type='button';undo.disabled=Boolean(investigationController);undo.onclick=undoEvidenceRemoval;target.append(undo);}
    if(!preview.length){target.append(element('p','No pasted evidence yet. Crossref records, if requested, are added when the investigation starts.','hint'));return;}
    target.append(element('p',`${sources.length} of 20 evidence records · ${preview.filter(source=>source.included).length} of 6 selected for Local AI`,'hint'));
    for(const source of preview){const item=element('article',undefined,'context-record');const label=element('label');const checkbox=element('input');checkbox.type='checkbox';checkbox.checked=source.included;checkbox.disabled=Boolean(investigationController);checkbox.onchange=()=>{const ids=selectedContext===null?preview.filter(item=>item.included).map(item=>item.id):selectedContext.slice();if(checkbox.checked && ids.length>=6){checkbox.checked=false;status('Select at most six sources.','error');return;}selectedContext=checkbox.checked?[...ids,source.id]:ids.filter(id=>id!==source.id);previewEvidence();target.querySelectorAll('input')[Number(source.id.slice(1))-1]?.focus();};label.append(checkbox,element('span',`Use ${source.id} in Local AI`));item.append(label);item.append(element('strong',`${source.id}: ${source.title}`),element('p',source.included?`Included in Local AI context${source.truncated?' · title or excerpt shortened for context':''}`:'Not selected for Local AI context.','hint'));if(source.included)item.append(element('pre',source.excerpt || 'Title only: no excerpt supplied.','context-excerpt'));const remove=element('button','Remove source');remove.type='button';remove.setAttribute('aria-label',`Remove ${source.id}: ${source.title}`);remove.disabled=Boolean(investigationController);remove.onclick=()=>removeEvidence(Number(source.id.slice(1))-1);item.append(remove);target.append(item);}
  } catch(error){target.append(element('p',`Preview unavailable: ${error.message}`,'hint'));}
}
async function request(path, options={}) {
  if(path==='/api/config') return {live_available:Boolean(navigator.gpu),model:'Local WebGPU model — load before running'};
  let runs;
  try {runs=savedRuns();} catch(error) {if(path!=='/api/research') throw error;runs=null;}
  if(path==='/api/research') {
    const input=JSON.parse(options.body);
    if(input.mode==='live' && !window.PocketResearch.ready()) throw new Error('Load the free local AI first.');
    investigationController=new AbortController();$('stop-run').hidden=false;
    const signal=investigationController.signal;const id=crypto.randomUUID(),created_at=new Date().toISOString();
    const evidence=await window.PocketResearch.prepareEvidence(input,{signal});
    signal.throwIfAborted();
    input.sources=evidence.sources;
    if(input.mode==='live') {
      if(!evidence.sources.length) throw new Error('Local AI needs evidence. Enable Crossref retrieval or paste source records with excerpts.');
      const onCheckpoint=checkpoint=>{checkpoint.id=id;checkpoint.created_at=created_at;saveRun(checkpoint,runs);if(!checkpoint.storage_warning)runs=savedRuns();showRun(checkpoint,false);};
      const run=await window.PocketResearch.investigate(input,evidence, message=>status(message,'pending'),signal,{onCheckpoint});
      run.id=id;run.created_at=created_at;
      return saveRun(run,runs);
    }
    if(input.sources.length>20) throw new Error('Use at most 20 evidence records.');
    const response=await fetch('./demo-template.json',{signal});
    if(!response.ok) throw new Error('Demo template could not be loaded.');
    const template=await response.json();signal.throwIfAborted();
    const substitute=value=> typeof value==='string' ? value.replaceAll('POCKET_RESEARCH_TOPIC',input.question.replace(/[ ?.]+$/,'')) : Array.isArray(value) ? value.map(substitute) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,substitute(item)])) : value;
    const run=substitute(template);
    run.question=input.question;run.id=id;run.created_at=created_at;run.status='complete';run.context_ids=input.context_ids===undefined?input.sources.slice(0,6).map((_,index)=>`S${index+1}`):input.context_ids;
    run.sources=input.sources;run.retrieval=evidence.retrieval;
    run.evidence_status=run.sources.length ? 'supplied records only' : 'no evidence';
    if(run.sources.length) {
      run.limitations=run.limitations.filter(item=>!item.startsWith('No evidence was supplied.'));
      run.gaps.forEach(gap=>gap.evidence_status='demo template; no source entailment claimed');
      run.agents[2].output.gaps.forEach(gap=>gap.evidence_status='demo template; no source entailment claimed');
    }
    run.agents[0].output.research_question=input.question;
    const scout=run.agents[1].output;
    scout.synthesis=`${run.sources.length} supplied records are available. This demo counts records and does not interpret or verify findings.`;
    scout.citations=run.sources.map(source=>source.id);
    run.limitations.push(...evidence.limitations,'Method demo uses templates. Select Local AI for model-generated proposals. Notes are stored in this browser.');
    return saveRun(run,runs);
  }
  if(path==='/api/runs') return runs;
  const id=decodeURIComponent(path.split('/').pop());
  const run=runs.find(item=>item.id===id);
  if(!run) throw new Error('Investigation not found in this browser.');
  if(options.method==='DELETE') {if(privateSession())throw new Error('Private session cannot delete saved notebook entries.');localStorage.setItem(storageKey,JSON.stringify(runs.filter(item=>item.id!==id)));return {deleted:true};}
  return run;
}
function status(message, type='') { const node = $('status'); node.hidden = false; node.className = type; node.textContent = message; }
function fields(parent, data, excluded=[]) { const list = element('dl'); Object.entries(data || {}).forEach(([key, value]) => { if(excluded.includes(key) || value === null || value === undefined) return; list.append(element('dt', key.replaceAll('_', ' ')), element('dd', Array.isArray(value) ? value.map(printable).join('\n') : printable(value))); }); parent.append(list); }
function card(data, index, label) { const node=element('article', undefined, 'card'); node.append(element('span', `${label} ${String(index+1).padStart(2,'0')}`, 'tag'), element('h4', data.title || data.name || `${label} ${index+1}`)); return node; }
function renderGaps(run) { const target=$('gaps'); target.replaceChildren(); array(run.gaps).forEach((gap,index)=> { const node=card(gap,index,'Gap'); if(gap.description) node.append(element('p',gap.description)); fields(node,gap,['id','title','description']); target.append(node); }); if(!target.childNodes.length) target.append(element('p','No knowledge gaps returned for this run.','empty')); }
function renderHypotheses(run) { const target=$('hypotheses'); target.replaceChildren(); array(run.hypotheses).forEach((hypothesis,index)=> { const node=card(hypothesis,index,'Hypothesis'); fields(node,hypothesis,['id','title','gap_id']); const plans=array(run.experiments).filter(plan=>plan.hypothesis_id===hypothesis.id); if(plans.length){ const details=element('details'); details.append(element('summary','Explore the test plan')); plans.forEach(plan=>{const section=element('section'); section.append(element('h4',plan.title || 'Experiment'));fields(section,plan,['id','hypothesis_id','title']);details.append(section);});node.append(details);} target.append(node); }); if(!target.childNodes.length) target.append(element('p','No hypotheses returned for this run.','empty')); }
function safeURL(value) { try {const url=new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null;}catch{return null;} }
function renderSources(run) { const target=$('evidence');target.replaceChildren();if(run.retrieval) {const info=element('article',undefined,'notice');info.append(element('h3','Literature search'));fields(info,run.retrieval);target.append(info);}array(run.sources).forEach((source,index)=>{const node=card(source,index,source.id || 'Source');node.classList.add('source-card');node.append(element('p',[source.year,Array.isArray(source.authors)?source.authors.join(', '):source.authors].filter(Boolean).join(' · '),'meta'));if(source.abstract)node.append(element('p',source.abstract));if(run.mode==='live'){const preview=window.PocketResearch.contextPreview(run.sources,run.context_ids)[index];node.append(element('p',preview.included?`Used by model${preview.truncated?' · title or excerpt shortened for context':''}`:'Not selected for model context','meta'));}if(source.extraction){const details=element('details');details.append(element('summary','Extraction provenance'));fields(details,source.extraction);node.append(details);}if(source.provenance)node.append(element('p',`Provenance: ${printable(source.provenance)}`,'meta'));const url=safeURL(source.url);if(url){const link=element('a',source.url,'source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';node.append(link);}else if(source.url)node.append(element('p',source.url));target.append(node);});if(!array(run.sources).length)target.append(element('p','No sources were returned. Findings without source support should be treated as exploratory proposals.','empty')); }
function renderAgents(run) {const target=$('agents');target.replaceChildren();array(run.agents).forEach((agent,index)=>{const node=card(agent,index,'Agent');node.append(element('span',agent.status || 'Recorded','tag'),element('pre',agent.error || printable(agent.output) || 'No output recorded.','agent-output'));target.append(node);});if(!target.childNodes.length)target.append(element('p','No agent outputs were returned.','empty'));}
function showRun(run,final=true) {currentRun=run;$('results').hidden=false;$('results-title').textContent=run.question || 'Research investigation';$('run-mode').textContent=run.mode==='demo'?'METHOD DEMO · ILLUSTRATIVE OUTPUT':'LIVE INVESTIGATION · NOVELTY UNVERIFIED';$('result-notice').textContent=run.mode==='demo'?'This is an illustrative method demonstration. Its deterministic hypotheses are not validated research findings or a comprehensive review.':'Model-generated proposals require source verification, domain review, and replication. Novelty has not been established.';$('result-notice').classList.toggle('run-pending',run.status==='running');if(run.status==='running'){$('result-notice').textContent='Investigation running. Completed stages appear as they finish; later stages are still pending.';$('result-notice').classList.remove('run-failure');}else if(run.status && run.status!=='complete'){$('result-notice').textContent=`Investigation ${run.status}. ${run.error || 'Some agent stages did not complete. Review the agent notebook for details.'}`;$('result-notice').classList.add('run-failure');}else{$('result-notice').classList.remove('run-failure');}renderGaps(run);renderHypotheses(run);renderSources(run);renderAgents(run);$('limitations').replaceChildren();array(run.limitations).forEach(limit=>$('limitations').append(element('p',limit)));if(!array(run.limitations).length)$('limitations').append(element('p','No run-specific limitations were returned. This tool cannot establish novelty or validate causal claims.'));if(final){selectTab(document.querySelector('[data-tab="findings"]'));$('results-title').focus();$('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}
async function history() {try{const runs=await request('/api/runs');const target=$('history-list');target.replaceChildren();runs.forEach(run=>{const button=element('button',run.question || run.id,'history-item');button.type='button';button.append(element('small',[run.mode,run.created_at ? new Date(run.created_at).toLocaleString():null].filter(Boolean).join(' · ')));button.onclick=async()=>{try{showRun(await request(`/api/runs/${encodeURIComponent(run.id)}`));}catch(error){status(error.message,'error');}};target.append(button);});if(!runs.length)target.append(element('p','Your investigations will appear here.','hint'));}catch{$('history-list').replaceChildren(element('p','Research history is temporarily unavailable.','hint'));}}
$('research-form').addEventListener('submit',async event=>{event.preventDefault();if(modelController){status('Finish or cancel model loading before starting.','error');return;}let sources=[];try{sources=parseEvidence($('sources').value);$('sources').removeAttribute('aria-invalid');}catch(error){status(`Check your evidence: ${error.message}`,'error');$('sources').setAttribute('aria-invalid','true');$('sources').focus();return;}const question=$('question').value.trim();if(!question){status('Enter a research question.','error');return;}const mode=document.querySelector('input[name="mode"]:checked').value;setBusy(true);$('research-form').setAttribute('aria-busy','true');status(mode==='live'?'The six-agent investigation is running. Live research may take several minutes; completed stages appear as they finish.':'Running the six-role browser demonstration…','pending');try{const run=await request('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,mode,sources,context_ids:selectedContext===null?undefined:selectedContext.slice(),retrieve:$('retrieve').checked,search_query:$('search-query').value.trim()})});showRun(run);status(run.storage_warning || (run.status==='failed'?'The investigation failed. Review the saved agent notebook for details.':run.status==='partial'?'A partial investigation was saved. Review incomplete stages in the agent notebook.':run.status==='stopped'?'Investigation stopped. Completed stages remain available for export.':'Investigation saved to your research notebook.'),run.storage_warning || run.status==='failed'?'error':'');await history();}catch(error){status(error.name==='AbortError'?'Investigation stopped.':error.message,error.name==='AbortError'?'':'error');}finally{investigationController=null;$('stop-run').hidden=true;setBusy(false);$('research-form').removeAttribute('aria-busy');}});
$('example').onclick=()=>{$('question').value='How might retrieval practice and sleep timing interact to improve long-term learning in university students?';$('search-query').value='retrieval practice sleep memory';$('question').focus();};
$('refresh-history').onclick=history;
function selectTab(button){document.querySelectorAll('[data-tab]').forEach(item=>{item.setAttribute('aria-selected',String(item===button));item.tabIndex=item===button?0:-1;});document.querySelectorAll('.tab-panel').forEach(panel=>panel.hidden=panel.id!==button.dataset.tab);}
document.querySelectorAll('[data-tab]').forEach((button,index)=>{button.onclick=()=>selectTab(button);button.onkeydown=event=>{const tabs=[...document.querySelectorAll('[data-tab]')];let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();selectTab(tabs[next]);tabs[next].focus();}};});
function setBusy(busy){document.querySelectorAll('#research-form input,#research-form textarea,#research-form button').forEach(control=>{if(control.id==='stop-run')return;if(busy){control.dataset.previouslyDisabled=String(control.disabled);control.disabled=true;}else{control.disabled=control.dataset.previouslyDisabled==='true';delete control.dataset.previouslyDisabled;}});$('example').disabled=busy;$('delete-run').disabled=busy;$('clear-notebook').disabled=busy;}
function download(extension){
  if(!currentRun)return;
  const metadata={context_ids:currentRun.context_ids || null,status:currentRun.status || (currentRun.mode==='demo'?'complete':'unknown'),error:currentRun.error || null,model:currentRun.model || null,created_at:currentRun.created_at || null,evidence_status:currentRun.evidence_status || null,retrieval:currentRun.retrieval || null,storage_warning:currentRun.storage_warning || null};
  const content=extension==='json'?JSON.stringify(currentRun,null,2):`# ${currentRun.question}\n\n${currentRun.mode==='demo'?'Illustrative method demo':'Local AI proposals'}. Novelty unverified.\n\n## Run status and provenance\n\n`+JSON.stringify(metadata,null,2)+'\n\n'+['gaps','hypotheses','experiments','sources','agents','limitations'].map(key=>`## ${key}\n\n`+JSON.stringify(currentRun[key],null,2)).join('\n\n');
  const url=URL.createObjectURL(new Blob([content],{type:extension==='json'?'application/json':'text/markdown'}));
  const link=element('a');link.href=url;link.download=`pocket-phd-${currentRun.id}.${extension}`;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
}
$('delete-run').onclick=async()=>{if(!currentRun || !confirm('Delete this saved investigation? This cannot be undone.'))return;try{await request(`/api/runs/${encodeURIComponent(currentRun.id)}`,{method:'DELETE',headers:{'X-Pocket-PhD':'local'}});currentRun=null;$('results').hidden=true;status('Investigation deleted.');await history();}catch(error){status(error.message,'error');}};
$('export-json').onclick=()=>download('json');
$('export-md').onclick=()=>download('md');
(async()=>{try{const config=await request('/api/config');document.querySelector('input[value="live"]').disabled=!config.live_available;$('live-label').classList.toggle('unavailable',!config.live_available);$('live-note').textContent=config.live_available?`Configured: ${config.model || 'research model'}`:'WebGPU unavailable — try Chrome or Edge';}catch{$('live-note').textContent='Model configuration unavailable';}await history();})();

$('load-model').onclick=async()=>{ modelController=new AbortController();$('cancel-model').hidden=false; $('load-model').disabled=true; try {await window.PocketResearch.load(message=>{$('model-status').textContent=message;},{signal:modelController.signal}); $('live-note').textContent='Model loaded — runs on this device';document.querySelector('input[value="live"]').disabled=false;$('model-status').textContent='Model ready. Select Local AI to use it; Method demo remains selected until you switch.';} catch(error){$('model-status').textContent=error.message;} finally{modelController=null;$('cancel-model').hidden=true;$('load-model').disabled=false;} };

$('stop-run').onclick=()=>{investigationController?.abort();$('live-note').textContent='Stopped — reload the local model before another AI run';};

$('sources').addEventListener('input',()=>{selectedContext=null;previewEvidence();});
$('evidence-file').addEventListener('change',async()=>{
  const file=$('evidence-file').files[0];if(!file)return;
  try{
    if(file.size>500000)throw new Error('Evidence file must be no larger than 500,000 bytes.');
    const text=await file.text(),sources=parseEvidence(text);
    await window.PocketResearch.prepareEvidence({sources,question:'',retrieve:false});
    $('sources').value=formatEvidence(sources);selectedContext=null;$('sources').removeAttribute('aria-invalid');previewEvidence();
    status(`Imported ${sources.length} evidence records locally. Review the model context before running.`);
  }catch(error){status(`Evidence import failed: ${error.message}`,'error');}
  finally{$('evidence-file').value='';}
});
previewEvidence();

$('cancel-model').onclick=()=>{modelController?.abort();window.PocketResearch.cancelLoad?.();};
$('clear-notebook').onclick=()=>{if(privateSession()){status('Private session cannot change saved notebook data.','error');return;}if(!confirm('Clear every Pocket PhD notebook entry? Export anything you need first. Other browser data and model caches will remain.'))return;try{savedRuns();localStorage.removeItem(storageKey);history();status('Pocket PhD notebook cleared.');}catch(error){status(error.message,'error');}};
$('add-evidence').onclick=()=>{try{const sources=parseEvidence($('sources').value),title=$('evidence-title').value.trim(),url=$('evidence-url').value.trim(),abstract=$('evidence-excerpt').value.trim();if(!title)throw new Error('Enter a source title.');if(url && !safeURL(url))throw new Error('Use an HTTP or HTTPS source URL.');if(sources.length>=20)throw new Error('Use at most 20 evidence records.');sources.push({title,url,abstract});const formatted=formatEvidence(sources);parseEvidence(formatted);$('sources').value=formatted;selectedContext=null;previewEvidence();for(const id of ['evidence-title','evidence-url','evidence-excerpt'])$(id).value='';status('Evidence added. Review its context selection.');}catch(error){status(error.message,'error');}};
document.querySelectorAll('input[name="mode"]').forEach(control=>control.addEventListener('change',()=>{$('run-button').textContent=control.value==='live'?'Start Local AI investigation':'Start method demo';}));
