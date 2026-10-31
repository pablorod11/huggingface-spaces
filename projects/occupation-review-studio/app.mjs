import {Classifier,ReviewSession} from './engine.mjs';
const $=id=>document.getElementById(id), pct=n=>(n*100).toFixed(1)+'%', title=s=>s.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let classifier,session,selected=null;
const key='occupation-review-studio-v1';
function notify(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'success';}
function tab(id){document.querySelectorAll('.panel').forEach(e=>e.hidden=e.id!==id);document.querySelectorAll('[data-tab]').forEach(e=>e.setAttribute('aria-current',e.dataset.tab===id?'page':'false'));}
function roleHelp(){ $('role-help').textContent={reviewer:'Handle routine items or escalate uncertainty. Claim before deciding.',senior:'Claim escalations, resolve with a reason, or close unsupported work out of scope.',auditor:'Inspect records and export feedback. No claims or decision changes.'}[$('identity').value]; }
function stats(target,values){target.replaceChildren(...values.map(([v,label])=>{const e=node('div');e.append(node('strong',v),node('span',label));return e;}));}
function render(){
 const items=session.state.items;
 stats($('queue-stats'),[[items.length,'Session records'],[items.filter(x=>!['resolved','out_of_scope'].includes(x.status)).length,'Need a decision'],[items.filter(x=>x.status==='escalated').length,'Awaiting senior'],[items.filter(x=>x.status==='resolved').length,'Resolved']]);
 $('queue').replaceChildren();
 if(!items.length){const row=node('tr'),cell=node('td','No records yet. Add a prediction or guided cases.');cell.colSpan=6;row.append(cell);$('queue').append(row);}
 for(const x of [...items].sort((a,b)=>Number(b.senior_required)-Number(a.senior_required)||a.confidence-b.confidence)){
  const row=node('tr');if(selected?.id===x.id)row.className='selected';
  const cell=node('td'),button=node('button',x.id.slice(0,8),'record-link');button.setAttribute('aria-label',`Inspect ${x.id.slice(0,8)} ${x.prediction} ${x.status}`);button.onclick=()=>{selected={id:x.id,revision:x.revision};render();};cell.append(button);row.append(cell);
  for(const text of [title(x.prediction),pct(x.confidence),title(x.status),x.final_label||'—',x.provenance||'—'])row.append(node('td',text));$('queue').append(row);
 }
 const item=items.find(x=>x.id===selected?.id), detail=$('record-detail');detail.replaceChildren();
 if(!item){detail.append(node('h3','Your review desk is ready'),node('p','Add a prediction or guided cases to begin.'));return;}
 detail.append(node('span',title(item.status),'pill'),node('h3',item.text));
 const dl=node('dl');for(const [term,value] of [['Model suggestion',title(item.prediction)+' · '+pct(item.confidence)],['Final label',item.final_label||'Withheld until a decision'],['Provenance',item.provenance||'Unresolved'],['Revision',String(item.revision)]]){const d=node('div');d.append(node('dt',term),node('dd',value));dl.append(d);}detail.append(dl);
 const instruction=['resolved','out_of_scope'].includes(item.status)?'This completed decision cannot be overwritten.':item.status==='in_review'?`Claimed by ${item.owner}. Give a reason, then decide.`:item.senior_required?'Select Senior adjudicator and claim this escalation.':'Claim this record before deciding.';
 detail.append(node('p',instruction,'scope'),node('h4','Decision trail'));const trail=node('ol',undefined,'timeline');
 for(const event of session.state.events.filter(e=>e.item_id===item.id)){const li=node('li');li.append(node('strong',title(event.action)),node('span',event.actor+' · '+event.timestamp,'small muted'),node('p',event.reason));trail.append(li);}detail.append(trail);
}
function predict(text){const result=classifier.predict(text),item=session.add(text,result);selected={id:item.id,revision:item.revision};
 $('decision-title').textContent={AUTO_ACCEPT:'Accepted by model',HUMAN_REVIEW:'Human review required',ESCALATE:'Senior review required'}[result.route];
 $('decision-copy').textContent=result.route==='AUTO_ACCEPT'?'The frozen validation policy accepted the model suggestion.':'The final label stays empty until a reviewer resolves this record.';
 $('decision-why').textContent=result.known_features?`Model confidence: ${pct(result.confidence)}. Probabilities are uncalibrated.`:'No known vocabulary was found. This always escalates.';
 $('probabilities').replaceChildren();for(const [label,score] of Object.entries(result.probabilities).sort((a,b)=>b[1]-a[1])){const row=node('div',undefined,'probability'),heading=node('div');heading.append(node('span',title(label)),node('strong',pct(score)));const bar=node('progress');bar.max=1;bar.value=score;bar.setAttribute('aria-label',label+' probability');row.append(heading,bar);$('probabilities').append(row);}render();return item;
}
document.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>tab(e.dataset.tab));
document.querySelectorAll('[data-sample]').forEach(e=>e.onclick=()=>{$('description').value=e.dataset.sample;$('description').focus();});
$('classify-form').onsubmit=e=>{e.preventDefault();try{predict($('description').value);notify('Prediction added. Open Review to inspect its next step.');}catch(err){notify(err.message,true);}};
$('guided').onclick=()=>{try{for(const t of ['Develop and test software applications for business systems.','zzzzzzzzzzq qqqqqqqqqzzz','Coordinate technical systems, business records, and customer requests.'])predict(t);notify('Three fictional demo cases added. Open Review to continue.');}catch(e){notify(e.message,true);}};
$('identity').onchange=roleHelp;
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{try{if(!selected)throw Error('Select a record first.');const item=session.transition(selected.id,selected.revision,$('identity').value,button.dataset.action,$('label').value,$('reason').value);selected={id:item.id,revision:item.revision};render();notify('Record updated: '+title(item.status)+'.');}catch(e){notify(e.message,true);}});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(session.feedback(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='occupation-review-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Completed human feedback exported. No retraining occurred.');};
$('clear').onclick=()=>{if(session.state.items.length&&!confirm('Clear all review records and decision trails in this tab? Export completed feedback first.'))return;try{session.commit({items:[],events:[]});selected=null;render();notify('This tab’s demo records were cleared.');}catch(e){notify(e.message,true);}};
try{
 const responses=await Promise.all(['model.json','metrics.json'].map(path=>fetch(path).then(r=>{if(!r.ok)throw Error('Unable to load '+path);return r.json();})));
 classifier=new Classifier(responses[0]);
 let restoreFailed=false;
 let state={items:[],events:[]};try{const raw=sessionStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed.items)||!Array.isArray(parsed.events))throw Error('Invalid state');state=parsed;}}catch{restoreFailed=true;}
 session=new ReviewSession(state,value=>sessionStorage.setItem(key,value));
 const metrics=responses[1],t=metrics.test,r=t.routing;
 stats($('metrics'),[[pct(t.accuracy),'Test accuracy'],[t.macro_f1.toFixed(3),'Macro F1'],[pct(r.auto_accept_coverage),'Auto-accept coverage']]);
 for(const label of classifier.classes){const report=t.classification_report[label],tr=node('tr');for(const value of [title(label),pct(report.precision),pct(report.recall),report['f1-score'].toFixed(3),report.support])tr.append(node('td',String(value)));$('class-metrics').append(tr);}
 $('raw-metrics').textContent=JSON.stringify(metrics,null,2);$('run').disabled=false;$('guided').disabled=false;roleHelp();render();
 notify(restoreFailed?'Previous browser session could not be restored. Starting empty. Model inference is ready and stays in your browser.':'Ready. Model inference stays in your browser; no description is sent to a prediction API.',restoreFailed);
}catch(error){notify('Startup error: '+error.message+'. Reload to retry. Browser session storage must be available for review.',true);}
