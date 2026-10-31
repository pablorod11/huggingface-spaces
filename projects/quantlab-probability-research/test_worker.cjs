const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Q=require('./model.js'),labs=require('./labs.js'),validation=require('./validation.js');
const messages=[],loaded=[];
const context={QuantModel:Q,QuantLabs:labs,QuantValidation:validation,self:{postMessage:value=>messages.push(value)},importScripts:(...names)=>{for(const name of names){assert.match(name,/^(?:(?:model|labs)\.js\?v=20261027audit2|validation\.js\?v=20261029forecast1)$/);loaded.push(name);}}};
vm.runInNewContext(fs.readFileSync(require.resolve('./worker.js'),'utf8'),context);
assert.equal(loaded.length,3);
for(const protocol of ['strict','classic']){
 context.self.onmessage({data:{closes:Q.synthetic(1200,42),protocol}});const result=messages.at(-1);assert(!result.error,result.error);assert.equal(result.report.validation_protocol.name,protocol);assert(result.report.validation.available);assert.equal(result.report.validation.observations,result.report.test_observations);assert(Number.isFinite(result.diagnostics.std));
 const selected=result.report.selected_metrics.log_loss,raw=result.report.baseline_metrics.empirical_raw.log_loss;
 assert(Math.abs(result.report.validation.comparisons.empirical_raw.mean_difference-(selected-raw))<1e-12);
}
context.self.onmessage({data:{closes:Q.synthetic(900,42),protocol:'strict'}});assert.match(messages.at(-1).error,/1064/);
console.log('Worker tests passed: versioned dependencies, strict/classic reporting, matched diagnostics and insufficient-history errors');
