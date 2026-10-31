const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8').split('async function request')[0];
let raw='[]',fail=false;
const context=vm.createContext({localStorage:{getItem:()=>raw,setItem:(_,value)=>{if(fail)throw Error('quota');raw=value;}},document:{getElementById:()=>null}});
vm.runInContext(source,context);
const run=()=>vm.runInContext("({id:'new',question:'New question'})",context);
let result=run();context.result=result;vm.runInContext('saveRun(result,savedRuns())',context);assert.equal(JSON.parse(raw)[0].id,'new');
for(const invalid of ['{','null','{}','[null]','[{"id":7}]']){raw=invalid;assert.throws(()=>vm.runInContext('savedRuns()',context));result=run();context.result=result;vm.runInContext('saveRun(result,null)',context);assert.equal(raw,invalid);assert.ok(result.storage_warning);}
raw='[]';vm.runInContext('var previous=savedRuns()',context);raw='[{"id":"other","question":"Other tab"}]';context.result=run();vm.runInContext('saveRun(result,previous)',context);assert.equal(JSON.parse(raw)[0].id,'other');assert.ok(context.result.storage_warning);
raw='[]';fail=true;context.result=run();vm.runInContext('saveRun(result,[])',context);assert.ok(context.result.storage_warning);assert.equal(raw,'[]');
console.log('PASS: normal save, malformed histories preserved, stale-tab save blocked, quota failure exportable');
fail=false;raw='[{"id":"new","question":"Old checkpoint"},{"id":"other","question":"Keep"}]';context.result=run();vm.runInContext('saveRun(result,savedRuns())',context);assert.equal(JSON.parse(raw).length,2);assert.equal(JSON.parse(raw)[1].id,'other');
context.document.getElementById=id=>id==='private-session'?{checked:true}:null;const before=raw;context.result=run();vm.runInContext('saveRun(result,savedRuns())',context);assert.equal(raw,before);assert.match(context.result.storage_warning,/Private session/);
console.log('PASS: checkpoint upserts preserve other history; private session writes nothing');
