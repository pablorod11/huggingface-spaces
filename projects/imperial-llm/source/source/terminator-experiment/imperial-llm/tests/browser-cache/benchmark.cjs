const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const referenceDir=path.resolve(__dirname,'../../outputs/imperial-experimental-release');
const payload=JSON.parse(fs.readFileSync(path.join(referenceDir,'model.json')));
const Reference=require(path.join(referenceDir,'inference.js')).ImperialModel;
const Candidate=require('./inference.js').ImperialModel;
class LastBlockOnly extends Candidate {
  createDecoder(){return {forward:ids=>this.forward(ids)};}
}
function worker(Model,directory){
  const module={exports:{}};
  // Bind the model lexically: both published files otherwise share a global name.
  new Function('ImperialModel','module','require',fs.readFileSync(path.join(directory,'generation-worker.js'),'utf8'))(
    Model,module,()=>({ImperialModel:Model}));
  return module.exports.generate;
}
const methods={
  baseline:worker(Reference,referenceDir),
  final_block_only:worker(LastBlockOnly,__dirname),
  final_block_and_cache:worker(Candidate,__dirname),
};
const cases=[
  {name:'one_character_64',prompt:'A',length:64},
  {name:'default_prompt_128',prompt:'The little',length:128},
  {name:'full_window_128',prompt:'The little bird flew over the garden. '.repeat(2).slice(-64),length:128},
];
const results=[];
for(const spec of cases){
  const request={payload,prompt:spec.prompt,length:spec.length,temperature:0.7,seed:42};
  const expected=methods.baseline(request,()=>{});
  const times=Object.fromEntries(Object.keys(methods).map(name=>[name,[]]));
  // One untimed full generation per method and case, then three timed paired rounds.
  for(const [name,generate] of Object.entries(methods)){
    const result=generate(request,()=>{});
    assert.equal(result.text,expected.text);
    assert.deepEqual(result.logits,expected.logits);
  }
  for(let round=0;round<3;round++){
    const names=Object.keys(methods);
    const order=[...names.slice(round),...names.slice(0,round)];
    for(const name of order){
      const started=performance.now();
      const result=methods[name](request,()=>{});
      times[name].push(performance.now()-started);
      assert.equal(result.text,expected.text);
      assert.deepEqual(result.logits,expected.logits);
    }
  }
  const median=values=>[...values].sort((a,b)=>a-b)[1];
  const medians=Object.fromEntries(Object.entries(times).map(([name,values])=>[name,median(values)]));
  const row={name:spec.name,prompt_characters:spec.prompt.length,new_characters:spec.length,
    milliseconds:times,median_ms:medians,
    speedup_vs_baseline:Object.fromEntries(Object.entries(medians).map(([name,value])=>[name,medians.baseline/value])),
    cache_speedup_vs_final_block:medians.final_block_only/medians.final_block_and_cache,
    exact_outputs:true};
  results.push(row);
  console.log(JSON.stringify(row));
}
const report={node:process.version,platform:process.platform,arch:process.arch,
  cpu:os.cpus()[0]?.model,model_sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(referenceDir,'model.json'))).digest('hex'),
  method:'Native Node JS, one untimed full generation per method/case plus reference generation; three timed rounds with rotated method order; median. Includes model validation and generation, excludes browser/worker startup and UI message transport.',
  results,limitations:['One host and one seed; preliminary CPU inference benchmark, not browser latency guarantees.',
    'No model weight, quality, architecture or context-length change.'],
};
fs.writeFileSync(path.join(__dirname,'benchmark.json'),JSON.stringify(report,null,2)+'\n');
