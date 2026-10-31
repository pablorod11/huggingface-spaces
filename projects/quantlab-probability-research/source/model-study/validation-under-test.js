/* Descriptive diagnostics on identical, fixed out-of-sample prediction rows. */
(function(root){
'use strict';
const average=a=>a.reduce((s,x)=>s+x,0)/a.length;
const category=y=>y<-.02?0:y>0?2:1;
function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function quantile(a,p){const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);}
function probability(q){return Array.isArray(q)&&q.length===3&&q.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(q.reduce((s,x)=>s+x,0)-1)<1e-6;}
function analyze(report,{reps=400,blocks=[5,20,60],seed=42}={}){
 if(!Number.isInteger(reps)||reps<1||reps>1000||!Number.isInteger(seed)||!Array.isArray(blocks)||!blocks.length||blocks.length>10||!blocks.every(b=>Number.isSafeInteger(b)&&b>0))throw Error('Use 1–1000 bootstrap replicates, an integer seed and 1–10 positive integer block lengths.');
 if(!report||!Array.isArray(report.predictions)||!report.predictions.length||report.predictions.length>2500)throw Error('Require 1–2500 prediction rows.');
 const rows=report.predictions,n=rows.length;
 if(rows.some(r=>!r||!r.baseline_probabilities||!r.baseline_probabilities.empirical_raw||!r.baseline_probabilities.empirical_calibrated))return{available:false,reason:'Matched row-level empirical baselines are unavailable. No comparison was reconstructed.'};
 let previous=-Infinity;
 for(const r of rows){if(!Number.isFinite(r.actual_log_return)||!Number.isSafeInteger(r.target_index)||!Number.isSafeInteger(r.feature_index)||r.target_index<=r.feature_index||r.target_index<=previous||!probability(r.probabilities)||!probability(r.baseline_probabilities.empirical_raw)||!probability(r.baseline_probabilities.empirical_calibrated))throw Error('Prediction rows require ordered unique targets, finite returns and valid matched probability vectors.');previous=r.target_index;}
 const values=rows.map(r=>{const c=category(r.actual_log_return),q=r.probabilities,raw=r.baseline_probabilities.empirical_raw,cal=r.baseline_probabilities.empirical_calibrated;return{c,loss:-Math.log(Math.max(q[c],1e-12)),raw:-Math.log(Math.max(raw[c],1e-12)),cal:-Math.log(Math.max(cal[c],1e-12)),brier:q.reduce((s,p,k)=>s+(p-(k===c?1:0))**2,0),rawBrier:raw.reduce((s,p,k)=>s+(p-(k===c?1:0))**2,0),entropy:-q.reduce((s,p)=>s+(p?p*Math.log(p):0),0)};});
 const lengths=[...new Set(blocks.map(b=>Math.min(b,n)))];
 function compare(key){const diffs=values.map(v=>v.loss-v[key]);return{mean_difference:average(diffs),intervals:lengths.map(block=>{if(block===n)return{block,reps,percentile95:null,estimable:false,reason:'Block length spans entire evaluation sample; resampling cannot estimate uncertainty.'};const random=rng(seed+block),means=[];for(let rep=0;rep<reps;rep++){let sum=0,count=0;while(count<n){const start=Math.floor(random()*(n-block+1)),take=Math.min(block,n-count);for(let j=0;j<take;j++)sum+=diffs[start+j];count+=take;}means.push(sum/n);}means.sort((a,b)=>a-b);return{block,reps,percentile95:[quantile(means,.025),quantile(means,.975)],estimable:true};})};}
 function summary(start,end){const slice=values.slice(start,end);return{end_target_index:rows[end-1].target_index,observations:slice.length,log_loss:average(slice.map(v=>v.loss)),raw_log_loss:average(slice.map(v=>v.raw)),brier:average(slice.map(v=>v.brier)),raw_brier:average(slice.map(v=>v.rawBrier)),downside_count:slice.filter(v=>v.c===0).length,mean_entropy:average(slice.map(v=>v.entropy))};}
 const rolling=[];if(n<100)rolling.push(summary(0,n));else{for(let end=100;end<=n;end+=20)rolling.push(summary(end-100,end));if(rolling.at(-1).end_target_index!==rows[n-1].target_index)rolling.push(summary(n-100,n));}
 const class_counts=[0,0,0];values.forEach(v=>class_counts[v.c]++);
 const warnings=['Intervals condition on fixed out-of-sample predictions; refitting and model-selection uncertainty are omitted.','Moving-block intervals assume sufficient local stationarity; regime shifts and block boundaries can limit interpretation.','Repeated research and multiple comparisons are not adjusted for.'];
 if(lengths.includes(n))warnings.push('A block length spans the entire evaluation sample; its uncertainty interval is unavailable because resampling cannot estimate uncertainty.');
 for(const [i,fold]of(report.folds||[]).entries())for(const [field,label]of[['temperature_class_counts','temperature'],['selection_class_counts','selection'],['test_class_counts','test']]){const counts=fold[field];if(counts===null||counts===undefined)continue;if(!Array.isArray(counts)||counts.length!==3||!counts.every(c=>Number.isSafeInteger(c)&&c>=0))throw Error('Fold class counts must contain three nonnegative integers.');for(let c=0;c<3;c++)if(counts[c]<10)warnings.push(`Fold ${i+1} ${label}: ${['downside','middle','positive'][c]} has ${counts[c]} ${counts[c]===1?'event':'events'}, below the heuristic minimum support of 10; this is not a statistical guarantee.`);}
 if(n<200)warnings.push('Fewer than 200 observations: disjoint early/recent movement summaries are unavailable.');
 return{available:true,observations:n,class_counts,comparisons:{empirical_raw:compare('raw'),empirical_calibrated:compare('cal')},rolling,movement:n>=200?{window:100,early:summary(0,100),recent:summary(n-100,n)}:null,warnings,interpretation:'Negative paired loss differences favor the selected policy. Intervals are descriptive; crossing zero leaves advantage unresolved and does not establish equality. These diagnostics do not establish market edge or trigger trading or retraining.'};
}
const api={analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantValidation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
