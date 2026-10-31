const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
async function exercise(privateMode,mutate){
 let raw='[{"id":"older","question":"Keep existing"}]',writes=0;
 const nodes={'private-session':{checked:privateMode},'stop-run':{hidden:true}};
 const ctx=vm.createContext({AbortController,crypto:{randomUUID:()=> 'same-run'},document:{getElementById:id=>nodes[id]||null},localStorage:{getItem:()=>raw,setItem:(_,value)=>{writes++;raw=value;}},window:{PocketResearch:{ready:()=>true,prepareEvidence:async()=>({sources:[{id:'S1',title:'Paper'}]}),investigate:async(input,evidence,progress,signal,{onCheckpoint})=>{for(const stage of [1,2])await onCheckpoint({question:'Question',status:'running',agents:Array(stage).fill({})});if(mutate)raw='[{"id":"other-tab","question":"Concurrent save"}]';return {question:'Question',status:'complete'};}}}});
 vm.runInContext(app.slice(0,app.indexOf('function status')),ctx);ctx.showRun=()=>{};ctx.status=()=>{};
 const result=await vm.runInContext("request('/api/research',{body:JSON.stringify({question:'Question',mode:'live',sources:[]})})",ctx);
 if(privateMode){assert.equal(writes,0);assert.equal(JSON.parse(raw)[0].id,'older');await assert.rejects(vm.runInContext("request('/api/runs/older',{method:'DELETE'})",ctx),/Private session/);assert.equal(writes,0);}
 else if(mutate){assert.equal(JSON.parse(raw)[0].id,'other-tab');assert.ok(result.storage_warning);assert.equal(writes,2);}
 else {const saved=JSON.parse(raw);assert.equal(writes,3);assert.equal(saved.length,2);assert.equal(saved.filter(row=>row.id==='same-run').length,1);assert.equal(saved[0].status,'complete');assert.equal(saved[1].id,'older');}
}
(async()=>{await exercise(false,false);await exercise(true,false);await exercise(false,true);console.log('PASS app checkpoints/final stable upsert, private zero writes/delete guard, stale-tab final protection');})().catch(error=>{console.error(error);process.exitCode=1;});
let clearCalls=0,confirmCalls=0;const clearNodes={'clear-notebook':{},'private-session':{checked:true}};
const clearCtx=vm.createContext({document:{getElementById:id=>clearNodes[id]},localStorage:{removeItem:()=>clearCalls++},confirm:()=>{confirmCalls++;return true;},status:()=>{}});
vm.runInContext(app.slice(0,app.indexOf('function saveRun')),clearCtx);
vm.runInContext(app.slice(app.indexOf("$('clear-notebook').onclick="),app.indexOf("$('add-evidence').onclick=")),clearCtx);
clearNodes['clear-notebook'].onclick();assert.equal(clearCalls,0);assert.equal(confirmCalls,0);
const controls=[{id:'question',disabled:false,dataset:{}},{id:'live',disabled:true,dataset:{}},{id:'stop-run',disabled:false,dataset:{}}];
const busyNodes=Object.fromEntries(['example','delete-run','clear-notebook'].map(id=>[id,{disabled:false}]));
const busyCtx=vm.createContext({document:{querySelectorAll:()=>controls,getElementById:id=>busyNodes[id]}});
vm.runInContext("const $=id=>document.getElementById(id);"+app.slice(app.indexOf('function setBusy'),app.indexOf('function download')),busyCtx);
for(const outcome of ['failed','stopped']){vm.runInContext('setBusy(true)',busyCtx);assert.equal(controls[0].disabled,true);assert.equal(controls[2].disabled,false);vm.runInContext('setBusy(false)',busyCtx);assert.equal(controls[0].disabled,false,outcome);assert.equal(controls[1].disabled,true,outcome);assert.equal(busyNodes.example.disabled,false,outcome);}
console.log('PASS private clear guard and busy control state restoration');
const noticeNodes={};for(const id of ['results','results-title','run-mode','result-notice','limitations'])noticeNodes[id]={textContent:'',replaceChildren(){},append(){},classList:{values:new Set(['run-failure']),toggle(key,on){on?this.values.add(key):this.values.delete(key);},remove(key){this.values.delete(key);},add(key){this.values.add(key);}}};
const noticeCtx=vm.createContext({document:{getElementById:id=>noticeNodes[id]},array:value=>Array.isArray(value)?value:[],element:()=>({}),renderGaps(){},renderHypotheses(){},renderSources(){},renderAgents(){}});
vm.runInContext("const $=id=>document.getElementById(id);let currentRun;"+app.slice(app.indexOf('function showRun'),app.indexOf('async function history')),noticeCtx);
vm.runInContext("showRun({question:'Running question',mode:'live',status:'running',limitations:['Review required']},false)",noticeCtx);
assert.match(noticeNodes['result-notice'].textContent,/running.*Completed stages/);assert.equal(noticeNodes['result-notice'].classList.values.has('run-failure'),false);assert.equal(noticeNodes['result-notice'].classList.values.has('run-pending'),true);
vm.runInContext("showRun({question:'Failed question',mode:'live',status:'failed',error:'Failure detail',limitations:[]},false)",noticeCtx);
assert.equal(noticeNodes['result-notice'].classList.values.has('run-pending'),false);assert.equal(noticeNodes['result-notice'].classList.values.has('run-failure'),true);
console.log('PASS running checkpoint notice is pending; terminal failure remains distinct');
