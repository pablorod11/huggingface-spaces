const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/app.js','utf8'),html=fs.readFileSync(__dirname+'/index.html','utf8');
const vm=require('node:vm');
(async()=>{let signal,fetchCalled=false;const nodes={'stop-run':{hidden:true},'private-session':{checked:false}};const context=vm.createContext({AbortController,crypto:{randomUUID:()=> 'stable'},document:{getElementById:id=>nodes[id]||null},localStorage:{getItem:()=> '[]'},window:{PocketResearch:{prepareEvidence:async(input,options)=>{signal=options.signal;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));}}},fetch:()=>{fetchCalled=true;},console});vm.runInContext(app.split('function status')[0],context);const pending=vm.runInContext("request('/api/research',{body:JSON.stringify({mode:'demo',question:'Question',sources:[]})})",context);assert.ok(signal instanceof AbortSignal,'preparation receives an immediate abort signal');vm.runInContext('investigationController.abort()',context);await assert.rejects(pending,{name:'AbortError'});assert.equal(fetchCalled,false);assert.equal(nodes['stop-run'].hidden,false);console.log('PASS UI Stop aborts evidence preparation before template fetching');})().catch(error=>{console.error(error);process.exitCode=1;});

// Execute the production Add handler with a valid notebook close to the byte budget.
const sourceRecords=Array.from({length:13},()=>({title:'Existing paper',abstract:'x'.repeat(19000)}));
const oldText=JSON.stringify(sourceRecords);assert.ok(oldText.length<250000);
const formNodes={'add-evidence':{},sources:{value:oldText},'evidence-title':{value:'Added paper'},'evidence-url':{value:'https://example.org/paper'},'evidence-excerpt':{value:'y'.repeat(20000)}};
let message='';const addContext=vm.createContext({document:{getElementById:id=>formNodes[id]},URL,status:text=>{message=text;},previewEvidence:()=>{throw Error('Oversize evidence must not reach preview');}});
vm.runInContext(app.slice(0,app.indexOf('async function request')),addContext);
vm.runInContext(app.slice(app.indexOf('function safeURL'),app.indexOf('function renderSources')),addContext);
vm.runInContext(app.slice(app.indexOf("$('add-evidence').onclick="),app.indexOf("document.querySelectorAll('input[name=",app.indexOf("$('add-evidence').onclick="))),addContext);
formNodes['add-evidence']?.onclick?.();
assert.equal(formNodes.sources.value,oldText,'Failed Add preserves original evidence');
assert.equal(formNodes['evidence-excerpt'].value,'y'.repeat(20000),'Failed Add preserves editable inputs');
assert.match(message,/250,000/);
console.log('PASS oversized Add preserves evidence and form values');
const tabs=['findings','evidence','agents'].map(name=>({dataset:{tab:name},attrs:{},setAttribute(key,value){this.attrs[key]=value;},focus(){this.focused=true;}}));
const panels=tabs.map(tab=>({id:tab.dataset.tab,hidden:false}));
const tabContext=vm.createContext({document:{querySelectorAll:selector=>selector==='[data-tab]'?tabs:panels}});
vm.runInContext(app.slice(app.indexOf('function selectTab'),app.indexOf('function download')),tabContext);
tabs[1].onclick();assert.equal(tabs[1].attrs['aria-selected'],'true');assert.equal(tabs[0].tabIndex,-1);assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);
let prevented=false;tabs[1].onkeydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(tabs[2].focused,true);assert.equal(tabs[2].attrs['aria-selected'],'true');assert.equal(panels[2].hidden,false);
console.log('PASS result tabs select panels and move keyboard focus');
