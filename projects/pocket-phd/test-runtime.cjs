'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync(`${__dirname}/research.js`,'utf8');
function harness(extra={}) {const context={window:{},AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,console,...extra};vm.createContext(context);vm.runInContext(text,context);return context.window.PocketResearch;}
test('failed Crossref batch retains only supplied evidence',async()=>{
  const api=harness({fetch:async()=>({ok:true,json:async()=>({message:{items:[{title:['Valid retrieved paper'],DOI:'10.1234/valid'},{title:['x'.repeat(1001)]}]}})})});
  const result=await api.prepareEvidence({sources:[{title:'Supplied source'}],question:'Q',retrieve:true});
  assert.deepEqual(Array.from(result.sources,source=>source.title),['Supplied source']);
  assert.equal(result.retrieval.status,'failed');
  assert.equal(result.retrieval.added,0);
  assert.equal(result.retrieval.count,0);
  assert.match(result.limitations[0],/Used supplied evidence only/);
});
test('successful Crossref batch keeps canonical IDs, deduplicates and caps evidence',async()=>{
  const items=[{title:['Duplicate'],DOI:'10.1234/existing'},{title:['New paper'],DOI:'10.1234/new'},{title:['Duplicate new paper'],DOI:'10.1234/new'},{title:['Beyond limit']}];
  const api=harness({fetch:async()=>({ok:true,json:async()=>({message:{items}})})});
  const sources=Array.from({length:19},(_,i)=>({title:`Supplied ${i}`,url:i===0?'https://doi.org/10.1234/existing':''}));
  const result=await api.prepareEvidence({sources,question:'Q',retrieve:true});
  assert.equal(result.sources.length,20);
  assert.equal(result.sources[19].id,'S20');
  assert.equal(result.sources[19].title,'New paper');
  assert.equal(result.sources[19].provenance,'Crossref metadata');
  assert.equal(result.retrieval.status,'completed');
  assert.equal(result.retrieval.added,1);
  assert.equal(result.retrieval.count,4);
});
test('explicit selection validates canonical unique IDs and preserves source order',()=>{const api=harness(),sources=Array.from({length:7},(_,i)=>({title:`T${i}`}));assert.deepEqual(Array.from(api.contextPreview(sources,['S7','S2']).filter(s=>s.included),s=>s.id),['S2','S7']);for(const ids of [['S0'],['S01'],['S8'],['S1','S1'],['S1','S2','S3','S4','S5','S6','S7']])assert.throws(()=>api.contextPreview(sources,ids));assert.equal(api.contextPreview(sources,[]).filter(s=>s.included).length,0);});
test('already aborted evidence requests reject without retrieval',async()=>{let fetched=false;const api=harness({fetch:async()=>{fetched=true;}}),controller=new AbortController();controller.abort();await assert.rejects(api.prepareEvidence({sources:[],question:'Q',retrieve:true},{signal:controller.signal}),{name:'AbortError'});assert.equal(fetched,false);});
test('pending Crossref body is cancellable and abort is not a retrieval failure',async()=>{const api=harness({fetch:async()=>({ok:true,json:()=>new Promise(()=>{})})}),controller=new AbortController();const pending=api.prepareEvidence({sources:[],question:'Q',retrieve:true},{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});});
test('load cancellation interrupts pending adapter and stale adapter cannot activate',async()=>{let resolve;const api=harness({navigator:{gpu:{requestAdapter:()=>new Promise(r=>resolve=r)}}});const pending=api.load(()=>{});api.cancelLoad();await assert.rejects(pending,{name:'AbortError'});resolve({});await new Promise(r=>setTimeout(r,5));assert.equal(api.ready(),false);});
test('load deadline bounds pending adapter',async()=>{const api=harness({navigator:{gpu:{requestAdapter:()=>new Promise(()=>{})}}});await assert.rejects(api.load(()=>{},{timeoutMs:5}),/timed out/);assert.equal(api.ready(),false);});
function runtimeHarness(fetcher,engine) {const context={window:{},AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,console,fetch:fetcher,fakeEngine:engine};vm.createContext(context);vm.runInContext(text.replace('let engine = null, worker = null;','let engine = globalThis.fakeEngine, worker = null;'),context);return context.window.PocketResearch;}
const evidence={sources:[{id:'S1',title:'A',abstract:''},{id:'S2',title:'B',abstract:'Excerpt',year:2026}],retrieval:{status:'not_requested'},limitations:[]};
test('schema fetch cancellation resolves stopped run and destroys readiness',async()=>{const api=runtimeHarness(()=>new Promise(()=>{}),{}),c=new AbortController();const p=api.investigate({question:'Q'},evidence,()=>{},c.signal);c.abort();const result=await p;assert.equal(result.status,'stopped');assert.equal(api.ready(),false);});
test('stage timeout ends inference with no retry and destroys readiness',async()=>{let calls=0;const api=runtimeHarness(async()=>({ok:true,json:async()=>({roles:[['framer','Framer']],schemas:{framer:{answer:'text'}}})}),{resetChat:async()=>{},chat:{completions:{create:()=>{calls++;return new Promise(()=>{});}}}});const result=await api.investigate({question:'Q'},evidence,()=>{},undefined,{stageTimeoutMs:5});assert.equal(result.status,'failed');assert.match(result.error,/timed out/);assert.equal(calls,1);assert.equal(api.ready(),false);});
test('checkpoint contains complete current data and selection matches actual context',async()=>{let request;const api=runtimeHarness(async()=>({ok:true,json:async()=>({roles:[['framer','Framer']],schemas:{framer:{answer:'text'}}})}),{resetChat:async()=>{},chat:{completions:{create:async value=>{request=JSON.parse(value.messages[1].content);return(async function*(){yield{choices:[{delta:{content:'{"answer":"Done"}'},finish_reason:'stop'}]};})();}}}});const checkpoints=[];const result=await api.investigate({question:'Q',context_ids:['S2']},evidence,()=>{},undefined,{onCheckpoint:value=>checkpoints.push(value)});assert.equal(result.status,'complete');assert.equal(checkpoints.length,1);assert.equal(checkpoints[0].agents[0].status,'complete');assert.equal(checkpoints[0].sources.length,2);assert.deepEqual(Array.from(result.context_ids),['S2']);assert.deepEqual(request.sources,[{id:'S2',title:'B',abstract:'Excerpt',year:2026}]);});
test('cancelled initialization cannot restore engine after a newer load',async()=>{let finishOld,initCount=0,terminated=0;const newEngine={};const context={window:{},AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,console,navigator:{gpu:{requestAdapter:async()=>({})}},document:{baseURI:'https://example.org/'},URL,Worker:class{terminate(){terminated++;}},fakeModule:{CreateWebWorkerMLCEngine:()=>++initCount===1?new Promise(resolve=>finishOld=resolve):Promise.resolve(newEngine)}};vm.createContext(context);vm.runInContext(text.replace("import('./vendor/web-llm.js')","Promise.resolve(globalThis.fakeModule)"),context);const api=context.window.PocketResearch;const old=api.load(()=>{});while(!finishOld)await new Promise(resolve=>setTimeout(resolve,0));api.cancelLoad();await assert.rejects(old,{name:'AbortError'});await api.load(()=>{});finishOld({stale:true});await new Promise(resolve=>setTimeout(resolve,5));assert.equal(api.ready(),true);assert.ok(terminated>=1);});
test('Local AI rejects empty selection before schema loading or generation',async()=>{let fetched=false;const api=runtimeHarness(async()=>{fetched=true;throw new Error('Unexpected fetch');},{});await assert.rejects(api.investigate({question:'Q',context_ids:[]},evidence,()=>{}),/Select at least one evidence record for Local AI/);assert.equal(fetched,false);});
