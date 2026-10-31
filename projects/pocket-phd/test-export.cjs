const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const source=app.slice(app.indexOf('function download(extension)'),app.indexOf("$('delete-run').onclick"));
for(const state of ['complete','partial','failed']) {
  let content;
  const run={id:'test',question:'Fictional question',mode:'live',status:state,error:state==='complete'?null:'stage stopped',model:'test-model',created_at:'2026-10-24T12:00:00Z',retrieval:{provider:'Crossref',query:'public keywords',status:'failed'},storage_warning:'Result not saved',agents:[],limitations:['Novelty unverified']};
  const context={currentRun:run,Blob:class{constructor(parts){content=parts.join('');}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},element:()=>({click(){},remove(){}}),document:{body:{append(){}}}};
  vm.runInNewContext(source+';download("md");',context);
  for(const value of [state,'test-model','2026-10-24T12:00:00Z','public keywords','Crossref','Result not saved'])assert.ok(content.includes(value),`Markdown missing ${value}`);
  if(run.error)assert.ok(content.includes(run.error));
  vm.runInNewContext(source+';download("json");',context);
  assert.deepEqual(JSON.parse(content),run);
}
console.log('PASS: complete, partial, failed and unsaved exports preserve run metadata; JSON unchanged');
