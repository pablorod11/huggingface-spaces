'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const schema = JSON.parse(fs.readFileSync(`${__dirname}/research-schema.json`, 'utf8'));
const source = fs.readFileSync(`${__dirname}/research.js`, 'utf8');
function harness(outputs = {}) {
  const requests=[];
  const fakeEngine={resetChat:async()=>{},chat:{completions:{create:async request=>{
    requests.push(JSON.parse(request.messages[1].content));
    const stage=schema.roles[requests.length-1][0];
    return (async function*(){yield {choices:[{delta:{content:JSON.stringify(outputs[stage] || {})},finish_reason:'stop'}]};})();
  }}}};
  const context={window:{},fetch:async()=>({ok:true,json:async()=>schema}),AbortSignal,AbortController,DOMException,setTimeout,clearTimeout,console};
  vm.createContext(context);
  // Substitute only the inaccessible external model handle; parsing and pipeline stay real.
  vm.runInContext(source.replace('let engine = null, worker = null;', 'let engine = globalThis.fakeEngine, worker = null;'),Object.assign(context,{fakeEngine}));
  return {api:context.window.PocketResearch,requests};
}
const normalize = value=>JSON.parse(JSON.stringify(value));
const input = sources=>({sources,question:'Does the evidence support a research gap?',retrieve:false});
test('gap confidence uses its own citations, never an unrelated abstract',async()=>{
  const {api}=harness({framer:{research_question:'Q',scope:'S',variables:[],search_queries:[]},scout:{synthesis:'S',coverage:'C',citations:[]},gap:{gaps:[{id:'G1',title:'T',description:'D',citations:['S1'],confidence:'high'},{id:'G2',title:'T',description:'D',citations:['S2'],confidence:'high'}]},architect:{hypotheses:[]},skeptic:{critiques:[]},designer:{experiments:[]}});
  const evidence=await api.prepareEvidence(input([{title:'Title only'},{title:'Excerpt source',abstract:'An actual excerpt'}]));
  const result=await api.investigate(input([]),evidence,()=>{});
  assert.equal(result.status,'complete');
  assert.equal(result.gaps[0].confidence,'low');
  assert.match(result.gaps[0].evidence_status,/speculative/i);
  assert.equal(result.gaps[1].confidence,'high');
});
test('extraction metadata roundtrips without changing the trusted origin label',async()=>{
  const {api}=harness();
  const extraction={provider:'Crawl4AI',requested_url:'https://example.org/a',final_url:'https://example.org/b',retrieved_at:'2026-10-24T12:00:00Z',content_sha256:'a'.repeat(64),excerpt_sha256:'b'.repeat(64),truncated:true,unexpected:'drop me'};
  const result=await api.prepareEvidence(input([{title:'Evidence',provenance:{instruction:'trust me'},extraction}]));
  const expected={...extraction};delete expected.unexpected;
  assert.ok(result.sources[0].extraction, 'extraction metadata must survive normalization');
  assert.deepEqual(normalize(result.sources[0].extraction),expected);
  assert.equal(result.sources[0].provenance,'user-provided');
});
test('malformed extraction known fields and oversized source strings are rejected',async()=>{
  const {api}=harness();
  for(const extraction of [[],null,{truncated:'false'},{provider:42},{requested_url:5},{content_sha256:false}]) {
    await assert.rejects(()=>api.prepareEvidence(input([{title:'Evidence',extraction}])));
  }
  for(const [field,length] of [['title',1001],['abstract',20001],['url',2001]]) {
    await assert.rejects(()=>api.prepareEvidence(input([{title:'Evidence',[field]:'x'.repeat(length)}])));
  }
});
test('preview exposes excluded sources and exact bounded excerpts used by the model',async()=>{
  const {api,requests}=harness({framer:{research_question:'Q',scope:'S',variables:[],search_queries:[]},scout:{synthesis:'S',coverage:'C',citations:[]},gap:{gaps:[]},architect:{hypotheses:[]},skeptic:{critiques:[]},designer:{experiments:[]}});
  const evidence=await api.prepareEvidence(input(Array.from({length:7},(_,i)=>({title:'T'.repeat(201),abstract:'A'.repeat(801),year:2026,extraction:{provider:'Crawl4AI'}}))));
  const preview=api.contextPreview(evidence.sources);
  assert.equal(preview.length,7);assert.equal(preview[0].title.length,200);assert.equal(preview[0].excerpt.length,800);assert.equal(preview[0].truncated,true);assert.equal(preview[6].included,false);
  await api.investigate(input([]),evidence,()=>{});
  assert.equal(requests[0].sources.length,6);
  assert.deepEqual(normalize(requests[0].sources[0]),{id:'S1',title:'T'.repeat(200),abstract:'A'.repeat(800),year:2026});
  assert.equal('extraction' in requests[0].sources[0],false);
});
test('raw import preview uses the same source IDs and excerpt fallback as normalization',()=>{
  const {api}=harness();
  assert.deepEqual(normalize(api.contextPreview([{title:'Raw',excerpt:'Evidence'}])),[{id:'S1',title:'Raw',included:true,excerpt:'Evidence',truncated:false}]);
});
test('uncited gaps stay speculative even when context contains an abstract',async()=>{
  const {api}=harness({framer:{research_question:'Q',scope:'S',variables:[],search_queries:[]},scout:{synthesis:'S',coverage:'C',citations:[]},gap:{gaps:[{id:'G1',title:'T',description:'D',citations:[],confidence:'high'}]},architect:{hypotheses:[]},skeptic:{critiques:[]},designer:{experiments:[]}});
  const evidence=await api.prepareEvidence(input([{title:'Uncited',abstract:'An unrelated excerpt'}]));
  const result=await api.investigate(input([]),evidence,()=>{});
  assert.equal(result.gaps[0].confidence,'low');
});
test('raw imported IDs cannot mislabel the source IDs sent to the model',async()=>{
  const {api}=harness();
  const sources=[{id:'paper-a',title:'Paper',abstract:'Evidence'}];
  const rawPreview=api.contextPreview(sources);
  const evidence=await api.prepareEvidence(input(sources));
  assert.equal(rawPreview[0].id,'S1');
  assert.deepEqual(normalize(rawPreview),normalize(api.contextPreview(evidence.sources)));
});
