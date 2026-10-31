const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(selection=null){
  const nodes={'context-preview':{querySelector:()=>null},sources:{value:JSON.stringify([{title:'A'},{title:'B'},{title:'C'}])}};
  const context=vm.createContext({document:{getElementById:id=>nodes[id]},message:'',status:text=>context.message=text});
  const app=fs.readFileSync(__dirname+'/app.js','utf8');
  vm.runInContext(app.slice(0,app.indexOf('async function request')),context);
  vm.runInContext('previewEvidence=()=>{}',context);
  context.selection=selection;vm.runInContext('selectedContext=selection',context);
  return {nodes,context,run:code=>vm.runInContext(code,context)};
}
test('removing evidence reindexes explicit selection and Undo restores exact input',()=>{
  const {nodes,run}=harness(['S1','S3']),before=nodes.sources.value;
  run('removeEvidence(0)');
  assert.deepEqual(JSON.parse(nodes.sources.value).map(s=>s.title),['B','C']);
  assert.deepEqual(Array.from(run('selectedContext')),['S2']);
  run('undoEvidenceRemoval()');
  assert.equal(nodes.sources.value,before);
  assert.deepEqual(Array.from(run('selectedContext')),['S1','S3']);
});
test('default context stays automatic; stale Undo cannot overwrite later edits or selections',()=>{
  const {nodes,run}=harness();
  run('removeEvidence(1)');assert.equal(run('selectedContext'),null);
  const after=nodes.sources.value;
  run("selectedContext=['S1']");run('undoEvidenceRemoval()');
  assert.equal(nodes.sources.value,after);
  run('removeEvidence(0)');nodes.sources.value='[{"title":"Later edit"}]';
  run('undoEvidenceRemoval()');assert.equal(nodes.sources.value,'[{"title":"Later edit"}]');
});
test('removal during an investigation or with an invalid index leaves evidence untouched',()=>{
  const {nodes,run}=harness([]),before=nodes.sources.value;
  run('removeEvidence(-1)');assert.equal(nodes.sources.value,before);
  run('investigationController={}');run('removeEvidence(0)');assert.equal(nodes.sources.value,before);
});
