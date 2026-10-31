const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {createRunCache}=require('./cache.js');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,value:id==='validation-protocol'?'strict':id==='data-source'?'synthetic':id==='observations'?'1200':'42',files:[],textContent:'',hidden:false,disabled:false,listeners:{},classList:{remove(){},add(){},toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},replaceChildren(){this.textContent='';},append(){},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;},click(){downloadClicks++;}});return nodes.get(id);}
const tabs=[node('forecast-tab'),node('help-tab')];tabs[0].dataset={view:'workbench'};tabs[1].dataset={view:'methods'};
let lastWorkerData=null;let workerCount=0,parseCount=0,cacheWrites=0,exportedBlob=null,downloadClicks=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
let network=deferred();
const sandbox={URL:{createObjectURL(blob){exportedBlob=blob;return 'blob:fixture';},revokeObjectURL(){}},console,TextEncoder,TextDecoder,structuredClone,setTimeout,clearTimeout,Date,JSON,Math,Number,Blob,
 document:{getElementById:node,querySelectorAll:selector=>selector==='[data-view]'?tabs:selector==='.view'?[node('workbench'),node('methods')]:[],querySelector:()=>node('quality-panel'),createElement:()=>node('created')},
 QuantProvenance:{...require('./provenance.js'),fingerprint:async()=> 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
 QuantCache:{createRunCache(){const cache=createRunCache();return{...cache,set(...args){cacheWrites++;cache.set(...args);}};}},
 QuantForward:require('./forward.js'),
 QuantMarket:{source:require('./market.js').source,loadSnapshot:async()=>require('./market-data.json').securities},
 QuantExecution:{costs:input=>require('./execution.js').costs(input)},
 QuantModel:{synthetic:()=>Array(1200).fill(100)},
 QuantLabs:{game:()=>({}),blackScholes:()=>({call:1,put:1}),kelly:()=>0,parseCSV(){parseCount++;return{closes:Array(1200).fill(100),dates:Array(714).fill('2020-01-01'),quality:{}};}},
 QuantScenarios:{impliedVolatility(){throw Error('stub');},jumpDistribution(){throw Error('stub');}},
 FormData:class{get(){return '1';}},fetch:()=>network.promise,
 Worker:class{constructor(){workerCount++;}postMessage(data){lastWorkerData=data;}terminate(){}}
};sandbox.globalThis=sandbox;
const source=fs.readFileSync(require.resolve('./app.js'),'utf8').replace(/import\('\.\/model\.js[^']*'\)/,"Promise.resolve({})");
vm.createContext(sandbox);vm.runInContext(source,sandbox);
(async()=>{
 for(const [key,value]of Object.entries({notional:1000,attempts:10,completed:8,movePercent:1,spreadPercent:.1,feePercent:.05,slippagePercent:.02,delayPercent:.03}))node('cost-'+key).value=String(value);
 node('cost-form').listeners.submit({preventDefault(){}});
 assert.match(node('cost-output').textContent,/58.40/);assert.match(node('cost-audit').textContent,/58.4/);assert.match(node('cost-threshold').textContent,/0.27%/);
 node('cost-completed').value='11';node('cost-form').listeners.submit({preventDefault(){}});assert.match(node('cost-output').textContent,/finished|completed/i);assert.equal(node('cost-completed').focused,true);assert.equal(node('cost-threshold').textContent,'');assert.equal(node('cost-audit').textContent,'No valid cost exercise. Correct the inputs and try again.');
 node('cost-completed').value='8';node('cost-form').listeners.submit({preventDefault(){}});assert.match(node('cost-output').textContent,/58.40/);
 assert.equal(vm.runInContext('percent(1e-9)',sandbox),'<0.01%');assert.equal(vm.runInContext('percent(1-1e-9)',sandbox),'>99.99%');assert.equal(vm.runInContext('percent(0)',sandbox),'0.00%');assert.equal(vm.runInContext('percent(1)',sandbox),'100.00%');
 vm.runInContext('drawProbabilities([1e-9,.5,.5-1e-9])',sandbox);assert(node('probability-chart').innerHTML.includes('&lt;0.01%'),'Tiny nonzero probabilities must stay readable in valid SVG text');
 tabs[1].listeners.click();assert.equal(node('workbench').hidden,true);assert.equal(node('methods').hidden,false);assert.equal(node('methods').scrolled,true,'Navigation must show the start of the newly selected view');tabs[0].listeners.click();
 const outer={tagName:'DETAILS',open:false,parentElement:null},inner={tagName:'DETAILS',open:false,parentElement:outer};node('experiment').listeners.invalid({target:{parentElement:inner}});assert(inner.open&&outer.open,'Native validation must reveal closed ancestor details');
 for(const id of ['support-warning','validation-policy','movement-note','validation-audit'])node(id).textContent='private derived fixture';
 node('clear-data').listeners.click();assert.equal(node('support-warning').textContent,'');assert.equal(node('support-warning').hidden,true);assert.equal(node('validation-policy').textContent,'');assert.equal(node('movement-note').textContent,'');assert.match(node('validation-audit').textContent,/No validation/);await Promise.resolve();assert.equal(workerCount,0,'Clearing pending module load must prevent worker creation');
 const file=deferred();node('data-source').value='csv';node('csv-file').files=[{size:100,arrayBuffer:()=>file.promise}];
 const pending=vm.runInContext('run()',sandbox);node('clear-data').listeners.click();file.resolve(new TextEncoder().encode('date,close').buffer);await pending;
 assert.equal(parseCount,0);assert.equal(workerCount,0);assert.equal(cacheWrites,0);assert.match(node('status').textContent,/cleared/);
 const benchmark=node('benchmark').listeners.click();node('clear-data').listeners.click();network.resolve({ok:true,json:async()=>{throw Error('stale response must not be parsed');}});await benchmark;assert.match(node('status').textContent,/cleared/);
 network=deferred();const json=deferred();const loading=node('benchmark').listeners.click();network.resolve({ok:true,json:()=>json.promise});await Promise.resolve();node('clear-data').listeners.click();json.resolve({});await loading;assert.match(node('status').textContent,/cleared/);
 node('data-source').value='synthetic';await vm.runInContext('run()',sandbox);assert.equal(workerCount,1,'A fresh run after clearing must still work');node('clear-data').listeners.click();
 assert.equal(vm.runInContext('currentReport',sandbox),null);assert.equal(vm.runInContext('runCache.size()',sandbox),0);
 node('observations').value='850';vm.runInContext('syncSource()',sandbox);assert.equal(node('setup-options').open,true,'Invalid hidden example settings must be revealed');assert.equal(node('demo-settings').open,true);node('observations').value='1200';
 const digest=deferred();sandbox.QuantProvenance.fingerprint=()=>digest.promise;const beforeDigest=workerCount;const hashing=vm.runInContext('run()',sandbox);await Promise.resolve();node('clear-data').listeners.click();digest.resolve('stale-hash');await hashing;assert.equal(workerCount,beforeDigest,'Clearing a pending digest must prevent worker creation');
 const Q=require('./model.js'),V=require('./validation.js');const report=Q.run(Q.synthetic(1200,71005),{protocol:'strict'});report.validation=V.analyze(report);sandbox.fixtureReport=report;
 vm.runInContext("render(fixtureReport,{synthetic:true,rows:1200,name:'Fixture'},null,{},false,{sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',rows:1200,last_date:'2014-08-08',last_close:100})",sandbox);
 assert.match(node('validation-verdict').textContent,/same chances/);
 node('download').listeners.click();assert.equal(downloadClicks,1);let exported=JSON.parse(await exportedBlob.text());assert.equal(exported.experiment_manifest.inputs.sha256,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');assert.equal(exported.experiment_manifest.inspection_history.total_views,1);assert.equal(exported.experiment_manifest.split_boundaries.length,1);assert(exported.validation.available);assert(exported.feature_support);assert.equal(Boolean(node('support-warning').textContent),exported.feature_support.warnings.length>0);
 vm.runInContext("render(fixtureReport,{synthetic:true,rows:1200,name:'Fixture'},null,{},true,{sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',rows:1200,last_date:'2014-08-08',last_close:100})",sandbox);
 node('download').listeners.click();exported=JSON.parse(await exportedBlob.text());assert.equal(exported.experiment_manifest.view.cache_hit,true);assert.equal(exported.experiment_manifest.inspection_history.total_views,2);
 assert.deepEqual(exported.forward_check.probabilities,report.latest_forecast.probabilities);
 const frozen=exported.forward_check, countBefore=workerCount;
 node('forward-date').value='2014-08-11';node('forward-close').value='101';node('forward-next').checked=true;
 node('forward-file').files=[{size:100,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify({forward_check:frozen})).buffer}];
 await node('forward-form').listeners.submit({preventDefault(){}});
 assert.match(node('forward-result').textContent,/Rise/);assert.equal(workerCount,countBefore);assert.equal(node('forward-download').disabled,false);
 node('forward-download').listeners.click();const check=JSON.parse(await exportedBlob.text());assert.deepEqual(check.record.probabilities,frozen.probabilities);assert.equal(check.result.outcome,'Rise');
 const delayed=deferred();node('forward-file').files=[{size:100,arrayBuffer:()=>delayed.promise}];const checking=node('forward-form').listeners.submit({preventDefault(){}});
 node('clear-data').listeners.click();delayed.resolve(new TextEncoder().encode(JSON.stringify({forward_check:frozen})).buffer);await checking;
 assert.equal(node('forward-result').textContent,'');assert.equal(node('forward-download').disabled,true);assert.equal(node('forward-next').checked,false);
 node('forward-file').files=[{size:2,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}];
 await node('forward-form').listeners.submit({preventDefault(){}});assert.match(node('forward-status').textContent,/new browser guess/);
 node('clear-data').listeners.click();assert.equal(vm.runInContext('inspectionJournal.snapshot().total_views',sandbox),0);const clicks=downloadClicks;node('download').listeners.click();assert.equal(downloadClicks,clicks,'No export after clearing');
 // A pending market read must not create a worker after clear or source changes.
 const marketPending=deferred();sandbox.QuantMarket.loadSnapshot=()=>marketPending.promise;
 node('data-source').value='market';node('market-ticker').value='AAPL';const beforeMarket=workerCount;
 const marketRun=vm.runInContext('run()',sandbox);node('clear-data').listeners.click();marketPending.resolve(require('./market-data.json').securities);await marketRun;assert.equal(workerCount,beforeMarket);assert.equal(vm.runInContext('currentReport',sandbox),null);
 sandbox.QuantMarket.loadSnapshot=async()=>require('./market-data.json').securities;
 await vm.runInContext('run()',sandbox);assert.equal(workerCount,beforeMarket+1);assert.equal(lastWorkerData.closes.length,1254);node('clear-data').listeners.click();
 node('data-source').value='synthetic';node('seed').value='42';node('observations').value='1200';
 vm.runInContext("render(fixtureReport,{synthetic:true,rows:1200,name:'Fixture'},null,{},false,{sha256:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',rows:1200,last_date:'2014-08-08',last_close:100})",sandbox);
 node('experiment').listeners.input();assert.equal(vm.runInContext('currentReport',sandbox),null);assert.equal(node('download').disabled,true);assert.equal(node('evaluation-support').hidden,true,'Edited inputs must hide stale reliability');
 console.log('Ticker/source state passed: late market read canceled; fresh snapshot fits; edits invalidate export and reliability.');
 console.log('Export integration passed: current manifest, validation, cache-hit history and clear');
 console.log('App state tests passed: clear invalidates delayed module, CSV read, benchmark response and JSON; fresh runs still work');
})().catch(error=>{console.error(error);process.exitCode=1;});
