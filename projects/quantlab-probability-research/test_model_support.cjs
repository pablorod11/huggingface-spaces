const assert=require('node:assert/strict'),Q=require('./model.js');
const flat=Q.run(Array(1200).fill(100),{protocol:'strict'});
assert(flat.feature_support,'Run must report training support for latest input');
assert.deepEqual(flat.feature_support.training_class_counts,flat.folds[0].training_class_counts);
assert.equal(flat.feature_support.latest.max_abs_standardized_value,0);
assert.deepEqual(flat.feature_support.latest.outside_training_range,[]);
assert(flat.feature_support.warnings.some(w=>w.code==='LOW_CLASS_SUPPORT'));
const normal=Q.synthetic(1200,42),shock=normal.slice();shock[1199]*=1.5;
const a=Q.run(normal,{protocol:'strict'}),b=Q.run(shock,{protocol:'strict'});
assert.deepEqual(a.feature_support.training_ranges,b.feature_support.training_ranges,'Latest shock must not change training reference');
assert.deepEqual(a.predictions.map(({actual_log_return,...row})=>row),b.predictions.map(({actual_log_return,...row})=>row),'Changing the last close must not change forecasts made before it');
assert(b.feature_support.latest.extreme_features.includes('last_return'));
assert(b.feature_support.latest.outside_training_range.includes('last_return'));
assert(b.feature_support.warnings.some(w=>w.code==='UNFAMILIAR_INPUT'));
assert.equal(b.feature_support.thresholds.absolute_standardized_value,3);
assert.equal(b.feature_support.thresholds.minimum_class_count,10);
for(const protocol of ['classic','strict']){const report=Q.run(normal,{protocol});assert.equal(report.feature_support.latest.feature_index,1199);assert.equal(report.feature_support.training_observations,report.latest_forecast.train_label_end-60);assert.equal(report.feature_support.latest.standardized_values.length,6);}
console.log('Model support tests passed: training-only reference, low-support warnings, extreme-input flag and label-causal invariance');
