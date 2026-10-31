'use strict';
const assert=require('node:assert/strict'),Q=require('./model-current.js');
let runs=0,forecastChecks=0,featureChecks=0,foldChecks=0,ownLabelChecks=0,latestParameterChecks=0;const cases=[];
const params=f=>Object.fromEntries(['selected','temperatures','calibration_log_loss','fit_metadata','training_class_counts','temperature_class_counts','selection_class_counts'].filter(k=>k in f).map(k=>[k,f[k]]));
const prediction=p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!=='actual_log_return'));
for(const n of [1064,1200,1800,2500])for(const protocol of ['strict','classic']){
 const close=Q.synthetic(n,103+n),a=Q.run(close,{protocol});runs++;
 for(const f of a.folds){assert(f.train_label_end<f.selection_feature_start);assert(f.selection_label_end<f.test_feature_start);if(protocol==='strict'){assert(f.train_label_end<f.temperature_feature_start);assert(f.temperature_label_end<f.selection_feature_start);assert.equal(f.training_class_counts.reduce((a,b)=>a+b,0),f.fit_metadata.training_observations);}}
 if(protocol==='strict'){assert.deepEqual(a.latest_forecast.fit_metadata,a.folds[0].fit_metadata);assert.deepEqual(a.latest_forecast.temperatures,a.folds[0].temperatures);assert.equal(a.latest_forecast.model,a.folds[0].selected);}
 const testStart=a.predictions[0].target_index,bounds=[...new Set([testStart,Math.floor((testStart+n-1)/2),n-1])];
 for(const boundary of bounds){const changed=close.map((p,i)=>i>=boundary?p*Math.exp(.2+.07*Math.sin(i)):p),b=Q.run(changed,{protocol});runs++;
  const fa=Q.features(close),fb=Q.features(changed);
  for(let j=0;j<fa.indices.length;j++)if(fa.indices[j]<boundary){assert.deepEqual(fa.x[j],fb.x[j]);featureChecks++;if(fa.indices[j]+1<boundary)assert.equal(fa.y[j],fb.y[j]);}
  for(let i=0;i<a.predictions.length;i++){const p=a.predictions[i];if(p.target_index<=boundary){assert.deepEqual(prediction(p),prediction(b.predictions[i]));forecastChecks++;if(p.target_index===boundary){assert.notEqual(p.actual_log_return,b.predictions[i].actual_log_return);ownLabelChecks++;}}}
  for(let j=0;j<a.folds.length;j++)if(a.folds[j].selection_label_end<boundary){assert.deepEqual(params(a.folds[j]),params(b.folds[j]));foldChecks++;}
  if(a.latest_forecast.selection_label_end<boundary){for(const key of ['fit_metadata','temperatures','model','calibration_log_loss'])assert.deepEqual(a.latest_forecast[key],b.latest_forecast[key]);latestParameterChecks++;}
  cases.push({n,protocol,mutation_start_price_index:boundary});
 }
}
console.log(JSON.stringify({runs,mutation_cases:cases.length,forecastChecks,featureChecks,foldChecks,ownLabelChecks,latestParameterChecks,cases},null,2));
