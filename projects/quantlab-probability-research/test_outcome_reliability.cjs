const assert=require('node:assert/strict');
const {analyze}=require('./validation.js');
const options={reps:1,blocks:[1]};
function fixture(returns,probabilities){return{predictions:returns.map((actual_log_return,i)=>({actual_log_return,probabilities:probabilities?.[i]||[.2,.3,.5],baseline_probabilities:{empirical_raw:[.2,.3,.5],empirical_calibrated:[.2,.3,.5]},feature_index:i,target_index:i+1}))};}
// All means use the identical validated evaluation rows, including boundary values.
const report=fixture([-.020001,-.02,0,.000001],[[.1,.2,.7],[.2,.4,.4],[.3,.5,.2],[.4,.1,.5]]);
const result=analyze(report,options);
assert(Array.isArray(result.outcomes),'Outcome summaries must be available for matched evaluation rows');
assert.deepEqual(result.outcomes.map(({class_index,label,events,observations,observed_rate,low_support})=>({class_index,label,events,observations,observed_rate,low_support})),[
 {class_index:0,label:'Big fall',events:1,observations:4,observed_rate:.25,low_support:true},
 {class_index:1,label:'Small fall or no change',events:2,observations:4,observed_rate:.5,low_support:true},
 {class_index:2,label:'Rise',events:1,observations:4,observed_rate:.25,low_support:true}
]);
for(const [i,expected]of[.25,.3,.45].entries())assert(Math.abs(result.outcomes[i].mean_predicted-expected)<1e-12);
assert.equal(result.outcomes.reduce((sum,o)=>sum+o.events,0),report.predictions.length);
assert.deepEqual(result.outcomes.map(o=>o.events),result.class_counts);
const support=analyze(fixture([...Array(9).fill(-.03),...Array(10).fill(-.01)]),options);
assert.deepEqual(support.outcomes.map(o=>o.events),[9,10,0]);
assert.deepEqual(support.outcomes.map(o=>o.low_support),[true,false,true]);
assert.deepEqual(support.outcomes.map(o=>o.observed_rate),[9/19,10/19,0]);
const legacy=fixture([.01]);delete legacy.predictions[0].baseline_probabilities;
assert.equal(analyze(legacy,options).available,false);
assert.equal(analyze(legacy,options).outcomes,undefined,'Unavailable legacy diagnostics must not fabricate outcome summaries');
for(const mutate of[
 r=>r.predictions[0].actual_log_return=NaN,
 r=>r.predictions[0].probabilities=[.2,.3,.6],
 r=>r.predictions[0].probabilities=[-.1,.5,.6],
 r=>r.predictions[1].target_index=1,
 r=>r.predictions[0].baseline_probabilities.empirical_calibrated=[Infinity,0,0]
]){const invalid=fixture([-.03,.01]);mutate(invalid);assert.throws(()=>analyze(invalid,options));}
assert.throws(()=>analyze({predictions:[]},options));
console.log('Outcome reliability tests passed: boundaries, exact counts, same-row means, support threshold, unavailable legacy and invalid rows');
