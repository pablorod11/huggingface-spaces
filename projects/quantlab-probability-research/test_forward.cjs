const assert=require('node:assert/strict'),Q=require('./model.js'),F=require('./forward.js');
const closes=Q.synthetic(1201,71),report=Q.run(closes.slice(0,1200),{protocol:'strict'}),identity={sha256:'a'.repeat(64),rows:1200,last_date:'2026-01-01',last_close:closes[1199]},source={synthetic:true};
const before=JSON.stringify({report,identity,source});const r=F.createRecord(report,identity,source,'2026-01-01T10:00:00.000Z');
assert.equal(r.schema_version,1);assert.equal(r.anchor.sha256,identity.sha256);assert.deepEqual(r.probabilities,report.latest_forecast.probabilities);assert.equal(r.synthetic,true);
const counts=report.feature_support.training_class_counts;assert.deepEqual(r.baseline_probabilities,counts.map(n=>(n+1)/(counts.reduce((a,b)=>a+b,0)+3)));
const score=F.scoreRecord(r,{date:'2026-01-02',close:closes[1200],confirmedNext:true});assert.equal(score.actual_log_return,Math.log(closes[1200])-Math.log(closes[1199]));assert(score.log_loss>=0);assert(score.brier_multiclass>=0);assert.equal(score.log_loss_difference,score.log_loss-score.baseline_log_loss);
assert.equal(before,JSON.stringify({report,identity,source}));const saved=JSON.stringify(r);F.scoreRecord(r,{date:'2030-01-01',close:100,confirmedNext:true});assert.equal(saved,JSON.stringify(r));
for(const bad of ['2026-02-30','2026-13-01','2026-1-01','junk'])assert.throws(()=>F.createRecord(report,{...identity,last_date:bad}));
for(const bad of [0,-1,NaN,Infinity,'100'])assert.throws(()=>F.createRecord(report,{...identity,last_close:bad}));
assert.throws(()=>F.createRecord({...report,precomputed:true},identity));assert.throws(()=>F.createRecord(report,{...identity,sha256:'x'}));assert.throws(()=>F.createRecord({...report,feature_support:undefined},identity));
for(const p of [[.3,.3,.3],[1,0,-1],[NaN,0,1],[.2,.8],['1',0,0]])assert.throws(()=>F.createRecord({...report,latest_forecast:{...report.latest_forecast,probabilities:p}},identity));
assert.throws(()=>F.scoreRecord(r,{date:'2026-01-02',close:100}));assert.throws(()=>F.scoreRecord(r,{date:'2026-01-01',close:100,confirmedNext:true}));assert.throws(()=>F.scoreRecord(r,{date:'2026-02-30',close:100,confirmedNext:true}));
for(const bad of [0,-1,NaN,Infinity,'100'])assert.throws(()=>F.scoreRecord(r,{date:'2026-01-02',close:bad,confirmedNext:true}));
for(const [patch,close,outcome]of [[{},100,1],[{},101,2],[{},97,0]]){const rr={...r,...patch,anchor:{...r.anchor,close:100}};assert.equal(F.scoreRecord(rr,{date:'2026-01-02',close,confirmedNext:true}).outcome_index,outcome)}
// Model uses log return strictly below -0.02 for big falls; zero belongs to middle.
const boundary={...r,anchor:{...r.anchor,close:1}};for(const close of [Math.exp(-.02),Math.exp(-.02-1e-8),Math.exp(-.02+1e-8),1]){const y=Math.log(close);assert.equal(F.scoreRecord(boundary,{date:'2026-01-02',close,confirmedNext:true}).outcome_index,y<-.02?0:y>0?2:1)}
for(const patch of [{schema_version:2},{threshold:-.03},{target:'anything'},{probabilities:[0,0,0]},{baseline_probabilities:[1,1,1]}])assert.throws(()=>F.scoreRecord({...r,...patch},{date:'2026-01-02',close:100,confirmedNext:true}));
assert.throws(()=>F.createRecord({...report,latest_forecast:{...report.latest_forecast,probabilities:[1,,,]}},identity));
assert.throws(()=>F.createRecord({...report,feature_support:{training_class_counts:[1,,,],training_observations:1}},identity));
for(const counts of [[-1,1,636],[1,1,1],[1.5,2,632.5],[NaN,2,634]])assert.throws(()=>F.createRecord({...report,feature_support:{training_class_counts:counts,training_observations:636}},identity));
for(const rows of [0,NaN,1.5,2501])assert.throws(()=>F.createRecord(report,{...identity,rows}));
assert.throws(()=>F.createRecord(report,identity,source,'2026-02-30T00:00:00.000Z'));
const overflowSafe={...r,anchor:{...r.anchor,close:Number.MIN_VALUE}};assert(Number.isFinite(F.scoreRecord(overflowSafe,{date:'2026-01-02',close:Number.MAX_VALUE,confirmedNext:true}).actual_log_return));
const zeroQ={...r,probabilities:[0,1,0]};assert.equal(F.scoreRecord(zeroQ,{date:'2026-01-02',close:r.anchor.close*2,confirmedNext:true}).log_loss,-Math.log(1e-12));
const mutable=F.createRecord(report,identity,source);mutable.probabilities[0]=999;assert.notEqual(report.latest_forecast.probabilities[0],999);
console.log('Forward tests passed: frozen strict-model record, independent observed outcome, scoring, dates, validation, no mutation');
const snapshotSource={kind:'market_snapshot',synthetic:false,ticker:'AAPL',currency:'USD',name:'AAPL · Apple Inc.',adjustment_basis:'Adjusted for splits and dividends',source_url:'https://finance.yahoo.com/quote/AAPL/',snapshot_retrieved_at:'2026-01-01T00:00:00Z',last_observation_date:'2026-01-01'};
const labeled=F.createRecord(report,identity,snapshotSource,'2026-01-01T10:00:00.000Z');
assert.equal(labeled.source.ticker,'AAPL');assert.equal(labeled.source.kind,'market_snapshot');assert.equal(labeled.source.last_observation_date,identity.last_date);assert.equal(labeled.source.adjustment_basis,snapshotSource.adjustment_basis);
snapshotSource.ticker='MSFT';assert.equal(labeled.source.ticker,'AAPL','Record source must be a snapshot of the identity at creation');
const old={...r};delete old.source;assert(Number.isFinite(F.scoreRecord(old,{date:'2026-01-02',close:100,confirmedNext:true}).log_loss),'Legacy saved records stay scoreable');
