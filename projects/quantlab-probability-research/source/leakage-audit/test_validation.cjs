const assert=require('node:assert/strict'),{analyze}=require('./validation-current.js');
function fixture(n=240){return{predictions:Array.from({length:n},(_,i)=>({actual_log_return:i%3===0?-.03:i%3===1?-.01:.01,probabilities:[.2,.3,.5],baseline_probabilities:{empirical_raw:[.2,.3,.5],empirical_calibrated:[.2,.3,.5]},fold_index:0,feature_index:i,target_index:i+1})),folds:[{temperature_class_counts:null,selection_class_counts:[2,40,50],test_class_counts:[80,80,80]}]};}
const r=fixture(),a=analyze(r,{reps:40});
for(const c of Object.values(a.comparisons)){assert.equal(c.mean_difference,0);for(const i of c.intervals)assert.deepEqual(i.percentile95,[0,0]);}
assert.deepEqual(a,analyze(r,{reps:40}));assert.deepEqual(a.class_counts,[80,80,80]);assert.equal(a.rolling.at(-1).end_target_index,240);assert.equal(a.movement.early.observations,100);assert(a.warnings.some(w=>w.includes('downside has 2')));
const fixed=fixture(1);fixed.predictions[0].probabilities=[.5,.25,.25];const f=analyze(fixed,{reps:5,blocks:[5,20]});assert(Math.abs(f.comparisons.empirical_raw.mean_difference-Math.log(.2/.5))<1e-12);assert.equal(f.comparisons.empirical_raw.intervals.length,1);assert.equal(f.movement,null);assert(Math.abs(f.rolling[0].brier-.375)<1e-12);
for(const c of Object.values(f.comparisons)){assert.equal(c.intervals[0].percentile95,null);assert.equal(c.intervals[0].estimable,false);assert(c.intervals[0].reason.includes('entire evaluation sample'));}
assert(f.warnings.some(w=>w.includes('uncertainty interval is unavailable')));
const short=analyze(fixture(5),{reps:5});for(const c of Object.values(short.comparisons)){assert.equal(c.intervals.length,1);assert.equal(c.intervals[0].block,5);assert.equal(c.intervals[0].estimable,false);assert.equal(c.intervals[0].percentile95,null);}
const mixed=analyze(fixture(5),{reps:5,blocks:[2,5,20]});for(const c of Object.values(mixed.comparisons)){assert.equal(c.intervals.length,2);assert.equal(c.intervals[0].estimable,true);assert.deepEqual(c.intervals[0].percentile95,[0,0]);assert.equal(c.intervals[1].estimable,false);assert.equal(c.intervals[1].percentile95,null);}
const missing=fixture();delete missing.predictions[3].baseline_probabilities;assert.equal(analyze(missing).available,false);
for(const options of [{reps:0},{reps:1001},{blocks:[]},{blocks:[0]},{blocks:[1.2]},{seed:NaN}])assert.throws(()=>analyze(r,options));
for(const mutate of [x=>x.predictions[0].probabilities=[NaN,0,1],x=>x.predictions[0].actual_log_return=Infinity,x=>x.predictions[1].target_index=1,x=>x.predictions[0].baseline_probabilities.empirical_raw=[1,1,1]]){const invalid=fixture();mutate(invalid);assert.throws(()=>analyze(invalid));}
assert.throws(()=>analyze({predictions:[]}));assert.throws(()=>analyze(fixture(2501)));
const shift=fixture(200);shift.predictions.forEach((row,i)=>{row.actual_log_return=i<100?.01:-.03;row.probabilities=[.05,.05,.9];});const s=analyze(shift,{reps:10});assert(s.movement.recent.log_loss>s.movement.early.log_loss);assert.equal(s.movement.early.downside_count,0);assert.equal(s.movement.recent.downside_count,100);assert.equal(s.rolling.at(-1).end_target_index,200);
console.log('Validation diagnostics tests passed: paired identity, fixed losses, deterministic bootstrap, bounds, unavailable baseline, shift and support warnings');
const Q=require('./model-current.js'),same=analyze(Q.run(Q.synthetic(1200,71005),{protocol:'strict'}),{reps:20});
assert.equal(same.comparisons.empirical_raw.matches_probabilities,true);
assert.equal(same.comparisons.empirical_raw.mean_difference,0,'Roundoff must not create apparent skill against the identical raw baseline');
for(const interval of same.comparisons.empirical_raw.intervals)assert.deepEqual(interval.percentile95,[0,0]);
assert.equal(s.comparisons.empirical_raw.matches_probabilities,false,'A shifted forecast must not be called equivalent');

const rare=fixture(1);rare.predictions[0].probabilities=[1.1e-12,.3,.7-1.1e-12];rare.predictions[0].baseline_probabilities.empirical_raw=[2e-12,.3,.7-2e-12];assert.equal(analyze(rare,{reps:5}).comparisons.empirical_raw.matches_probabilities,false,'Tiny probability differences with material log-loss effects must not be called equivalent');
