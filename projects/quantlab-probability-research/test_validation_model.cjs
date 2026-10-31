const assert=require('node:assert/strict'),Q=require('./model.js');
const close=Q.synthetic(1200,42),strict=Q.run(close,{protocol:'strict'}),fold=strict.folds[0];
assert.equal(strict.test_observations,200);assert.equal(strict.folds.length,1);
assert.equal(strict.validation_protocol.name,'strict');assert.equal(strict.validation_protocol.reserved_test_rows,200);
assert.equal(fold.temperature_class_counts.reduce((a,b)=>a+b),150);
assert.equal(fold.selection_class_counts.reduce((a,b)=>a+b),150);
assert.equal(fold.test_class_counts.reduce((a,b)=>a+b),200);
assert(fold.training_class_counts.reduce((a,b)=>a+b)>=500);
assert(fold.train_label_end<fold.temperature_feature_start);
assert(fold.temperature_label_end<fold.calibration_feature_start);
assert(fold.calibration_label_end<fold.test_feature_start);
assert.equal(strict.predictions.at(-1).target_index,close.length-1);
assert.equal(strict.latest_forecast.target_index,close.length);
assert.deepEqual(strict.latest_forecast.fit_metadata,fold.fit_metadata);
assert.deepEqual(strict.latest_forecast.temperatures,fold.temperatures);
assert.equal(strict.latest_forecast.model,fold.selected);
const changed=close.slice();for(let i=fold.test_feature_start+1;i<changed.length;i++)changed[i]*=1.25;
const mutated=Q.run(changed,{protocol:'strict'});
assert.deepEqual(mutated.folds[0].fit_metadata,fold.fit_metadata);
assert.deepEqual(mutated.folds[0].temperatures,fold.temperatures);
assert.equal(mutated.folds[0].selected,fold.selected);
assert.deepEqual(mutated.predictions[0].probabilities,strict.predictions[0].probabilities);
for(const report of [strict,Q.run(close)]){
 assert.deepEqual(report.baseline_metrics.empirical_calibrated,report.candidate_metrics.empirical);
 for(const p of report.predictions){assert(Number.isInteger(p.fold_index));for(const b of Object.values(p.baseline_probabilities))assert(Math.abs(b.reduce((a,v)=>a+v)-1)<1e-12);}
 for(const f of report.folds){assert(f.test_observations>0);assert(Number.isFinite(f.test_metrics.log_loss));}
}
assert.equal(Q.run(close).folds[0].temperature_class_counts,null);
assert.equal(Q.run(Q.synthetic(1064,7),{protocol:'strict'}).test_observations,200);
assert.throws(()=>Q.run(Q.synthetic(1063,7),{protocol:'strict'}));
assert.throws(()=>Q.run(close,{protocol:'unknown'}));
console.log('validation model passed: strict split, frozen fit, baseline/fold audits, minimum history');

assert(strict.candidate_metrics.empirical_raw,'Strict choice must include untuned frequency');
assert.equal(fold.temperatures.empirical_raw,1,'Raw baseline must never fit a temperature');
const raw=fold.training_class_counts.map(c=>(c+1)/(fold.fit_metadata.training_observations+3));
const ys=Q.features(close).y.slice(fold.selection_feature_start-60,fold.selection_feature_end-60+1);
const loss=ys.reduce((sum,y)=>sum-Math.log(raw[y<-.02?0:y>0?2:1]),0)/ys.length;
assert(Math.abs(loss-fold.calibration_log_loss.empirical_raw)<1e-12,'Choice score must use selection labels only');
assert.equal(fold.calibration_log_loss[fold.selected],Math.min(...Object.values(fold.calibration_log_loss)));
assert(!Q.run(close).candidate_metrics.empirical_raw,'Classic numerical policy remains unchanged');
console.log('Untuned strict candidate passed: fixed temperature, independent selection score and unchanged classic candidate set');
