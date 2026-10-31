/* Dependency-free, browser-local research baselines. No trading/alpha claim.
 * Targets next observed-close log return. Synthetic RNG differs from Python.
 */
(function(root){
'use strict';
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const cls=y=>y<-.02?0:y>0?2:1;
function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function synthetic(n=1500,seed=42){
 if(!Number.isInteger(n)||n<100||n>2500||!Number.isInteger(seed))throw Error('Use integer n from 100 to 2500 and integer seed');
 const random=rng(seed),normal=()=>Math.sqrt(-2*Math.log(Math.max(random(),1e-12)))*Math.cos(2*Math.PI*random());
 const close=[100];let state=0,previous=0;
 for(let i=1;i<n;i++){if(random()<(state?.10:.025))state=1-state;const jump=random()<.008?Math.log(Math.max(random(),1e-12))*.025:0;const r=.0003+.08*previous+(state?.025:.008)*normal()+jump;close.push(close[i-1]*Math.exp(r));previous=r;}
 return close;
}
function validate(close,min=62){if(!Array.isArray(close)||close.length<min||!close.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))throw Error(`Need at least ${min} finite positive closes`);}
function features(close){validate(close);const r=close.slice(1).map((v,i)=>Math.log(v)-Math.log(close[i])),x=[],y=[],indices=[];
 for(let t=60;t<close.length-1;t++){const r5=r.slice(t-5,t),r20=r.slice(t-20,t),sd=a=>Math.sqrt(a.reduce((s,v)=>s+(v-mean(a))**2,0)/(a.length-1));x.push([r[t-1],r5.reduce((a,b)=>a+b,0),r20.reduce((a,b)=>a+b,0),sd(r5),sd(r20),close[t]/Math.max(...close.slice(t-59,t+1))-1]);y.push(r[t]);indices.push(t);}
 return{x,y,indices};}
function softmax(v){const m=Math.max(...v),a=v.map(x=>Math.exp(x-m)),s=a.reduce((x,y)=>x+y,0);return a.map(x=>x/s);}
function temperature(q,t){return softmax(q.map(p=>Math.log(Math.max(1e-12,p))/t));}
function cdf(z){const a=Math.abs(z)/Math.sqrt(2),t=1/(1+.3275911*a),erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);return Math.max(0,Math.min(1,.5*(1+(z>=0?erf:-erf))));}
function metrics(y,q){let loss=0,brier=0,up=0,downside=0,correct=0;for(let i=0;i<y.length;i++){const c=cls(y[i]);up+=(q[i][2]-(c===2?1:0))**2;downside+=(q[i][0]-(c===0?1:0))**2;loss-=Math.log(Math.max(1e-12,q[i][c]));for(let k=0;k<3;k++)brier+=(q[i][k]-(k===c?1:0))**2;if(q[i].indexOf(Math.max(...q[i]))===c)correct++;}return{log_loss:loss/y.length,brier_multiclass:brier/y.length,up_brier:up/y.length,downside_brier:downside/y.length,accuracy:correct/y.length};}
function solve(a,b){a=a.map((row,i)=>[...row,b[i]]);const n=b.length;for(let j=0;j<n;j++){let p=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[p][j]))p=i;[a[j],a[p]]=[a[p],a[j]];if(Math.abs(a[j][j])<1e-14)throw Error('Singular ridge system');const d=a[j][j];for(let k=j;k<=n;k++)a[j][k]/=d;for(let i=0;i<n;i++)if(i!==j){const v=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=v*a[j][k];}}return a.map(row=>row[n]);}
function fit(x,y){const n=x.length,p=6,m=Array(p).fill(0),scale=Array(p).fill(0);for(const row of x)for(let j=0;j<p;j++)m[j]+=row[j]/n;for(const row of x)for(let j=0;j<p;j++)scale[j]+=(row[j]-m[j])**2/n;for(let j=0;j<p;j++)scale[j]=Math.sqrt(scale[j])||1;
 const z=x.map(row=>[1,...row.map((v,j)=>(v-m[j])/scale[j])]),counts=[1,1,1];y.forEach(v=>counts[cls(v)]++);
 const a=Array.from({length:p+1},()=>Array(p+1).fill(0)),b=Array(p+1).fill(0);for(let i=0;i<n;i++)for(let j=0;j<=p;j++){b[j]+=z[i][j]*y[i]/n;for(let k=0;k<=p;k++)a[j][k]+=z[i][j]*z[i][k]/n;}for(let j=1;j<=p;j++)a[j][j]+=1;const beta=solve(a,b);const residual=y.map((v,i)=>v-z[i].reduce((s,u,j)=>s+u*beta[j],0)),mu=mean(residual),sigma=Math.max(1e-6,Math.sqrt(residual.reduce((s,v)=>s+(v-mu)**2,0)/(n-1)));
 const weights=Array.from({length:p+1},()=>[0,0,0]);let squared=0;for(const row of z)for(const v of row)squared+=v*v;const step=1/(.5*squared/n+.03);
 for(let iter=0;iter<100;iter++){const grad=Array.from({length:p+1},()=>[0,0,0]);for(let i=0;i<n;i++){const logits=[0,0,0];for(let j=0;j<=p;j++)for(let k=0;k<3;k++)logits[k]+=z[i][j]*weights[j][k];const prob=softmax(logits);for(let j=0;j<=p;j++)for(let k=0;k<3;k++)grad[j][k]+=z[i][j]*(prob[k]-(cls(y[i])===k?1:0))/n;}for(let j=0;j<=p;j++)for(let k=0;k<3;k++)weights[j][k]-=step*(grad[j][k]+(j?.03*weights[j][k]:0));}
 return{m,scale,beta,sigma,training_residual_mse:mean(residual.map(v=>v*v)),weights,empirical:counts.map(v=>v/(n+3))};}
function ridgeMean(model,x){return model.beta[0]+x.reduce((sum,v,j)=>sum+(v-model.m[j])/model.scale[j]*model.beta[j+1],0);}
function probabilities(model,x,name,sigmaOverride){if((name==='empirical'||name==='empirical_raw'))return model.empirical.slice();const z=[1,...x.map((v,j)=>(v-model.m[j])/model.scale[j])];if(name==='softmax'){const v=[0,0,0];for(let j=0;j<z.length;j++)for(let k=0;k<3;k++)v[k]+=z[j]*model.weights[j][k];return softmax(v);}const mu=z.reduce((s,v,j)=>s+v*model.beta[j],0),sigma=sigmaOverride??model.sigma,lo=cdf((-.02-mu)/sigma),hi=cdf(-mu/sigma);return[lo,Math.max(0,hi-lo),1-hi];}
function run(close,{protocol='classic'}={}){
 if(!['classic','strict'].includes(protocol))throw Error('Unknown validation protocol');
 const strict=protocol==='strict';validate(close,strict?1064:714);if(close.length>2500)throw Error('Maximum 2500 closes');
 const{x,y,indices}=features(close),names=strict?['empirical','ridge','softmax','ewma','empirical_raw']:['empirical','ridge','softmax','ewma'],predictions=[],folds=[],allQ=Object.fromEntries(names.map(name=>[name,[]])),allY=[],selectedQ=[],rawQ=[];
 const counts=(start,stop)=>{const n=[0,0,0];for(const v of y.slice(start,stop))n[cls(v)]++;return n;};
 function train(calStop,separate=false){
  const calStart=calStop-150,tempStop=separate?calStart-1:calStop,tempStart=separate?tempStop-150:calStart,trainStop=tempStart-1;
  const model=fit(x.slice(0,trainStop),y.slice(0,trainStop)),temps={},scores={},ewmaSigmas=[];
  // Save sigma before consuming its own outcome; test outcomes update only later forecasts.
  const alpha=1-Math.exp(-Math.log(2)/20);let variance=Math.max(1e-12,model.training_residual_mse);
  for(let i=trainStop;i<=y.length;i++){
   ewmaSigmas[i]=Math.sqrt(Math.max(1e-12,variance));
   if(i<y.length){const residual=y[i]-ridgeMean(model,x[i]);variance=(1-alpha)*variance+alpha*residual*residual;}
  }
  const qFor=(name,start,stop)=>x.slice(start,stop).map((row,j)=>probabilities(model,row,name,name==='ewma'?ewmaSigmas[start+j]:undefined));
  for(const name of names){const q=qFor(name,tempStart,tempStop);let best=Infinity;for(const t of (name==='empirical_raw'?[1]:[.5,.75,1,1.5,2,3])){const score=metrics(y.slice(tempStart,tempStop),q.map(p=>temperature(p,t))).log_loss;if(score<best){best=score;temps[name]=t;}}scores[name]=metrics(y.slice(calStart,calStop),qFor(name,calStart,calStop).map(p=>temperature(p,temps[name]))).log_loss;}
  const chosen=names.reduce((a,b)=>scores[a]<=scores[b]?a:b);
  return{model,temps,scores,chosen,calStart,calStop,tempStart,tempStop,trainStop,ewmaSigmas};
 }
 const snapshot=t=>({training_observations:t.trainStop,scaling_mean:t.model.m.slice(),scaling_scale:t.model.scale.slice(),ridge_coefficients:t.model.beta.slice(),softmax_coefficients:t.model.weights.map(r=>r.slice())});
 const boundaries=t=>({train_feature_start:indices[0],train_feature_end:indices[t.trainStop-1],train_label_end:indices[t.trainStop-1]+1,calibration_feature_start:indices[t.calStart],calibration_label_end:indices[t.calStop-1]+1,...(strict?{temperature_feature_start:indices[t.tempStart],temperature_feature_end:indices[t.tempStop-1],temperature_label_end:indices[t.tempStop-1]+1}:{}),selection_feature_start:indices[t.calStart],selection_feature_end:indices[t.calStop-1],selection_label_end:indices[t.calStop-1]+1});
 let frozen;
 const first=strict?y.length-200:652;
 for(let start=first;start<y.length;start+=200){
  const stop=Math.min(start+200,y.length),t=train(start-1,strict),foldIndex=folds.length,foldSelected=[],foldRaw=[],foldCal=[];if(strict)frozen=t;
  for(let i=start;i<stop;i++){
   const qs={};for(const name of names){qs[name]=temperature(probabilities(t.model,x[i],name,name==='ewma'?t.ewmaSigmas[i]:undefined),t.temps[name]);allQ[name].push(qs[name]);}
   const raw=t.model.empirical.slice();allY.push(y[i]);selectedQ.push(qs[t.chosen]);rawQ.push(raw);foldSelected.push(qs[t.chosen]);foldRaw.push(raw);foldCal.push(qs.empirical);
   predictions.push({feature_index:indices[i],target_index:indices[i]+1,probabilities:qs[t.chosen],actual_log_return:y[i],model:t.chosen,ewma_sigma:t.ewmaSigmas[i],ridge_mean:ridgeMean(t.model,x[i]),fold_index:foldIndex,baseline_probabilities:{empirical_raw:raw,empirical_calibrated:qs.empirical}});
  }
  folds.push({...boundaries(t),test_feature_start:indices[start],test_feature_end:indices[stop-1],test_observations:stop-start,selected:t.chosen,calibration_log_loss:t.scores,temperatures:t.temps,test_metrics:metrics(y.slice(start,stop),foldSelected),raw_empirical_metrics:metrics(y.slice(start,stop),foldRaw),calibrated_empirical_metrics:metrics(y.slice(start,stop),foldCal),training_class_counts:counts(0,t.trainStop),temperature_class_counts:strict?counts(t.tempStart,t.tempStop):null,selection_class_counts:counts(t.calStart,t.calStop),test_class_counts:counts(start,stop),...(strict?{fit_metadata:snapshot(t)}:{})});
 }
 // Strict freezes the evaluated fit/choice; only causal EWMA state and features advance.
 const t=strict?frozen:train(y.length-1),latestX=features([...close,close.at(-1)]).x.at(-1),candidate={};for(const name of names)candidate[name]=temperature(probabilities(t.model,latestX,name,name==='ewma'?t.ewmaSigmas[y.length]:undefined),t.temps[name]);
 const candidateMetrics=Object.fromEntries(names.map(name=>[name,metrics(allY,allQ[name])]));
 // Support describes the frozen training reference; it does not certify calibration or detect drift formally.
 const featureNames=['last_return','return_5','return_20','volatility_5','volatility_20','drawdown_60'];
 const trainingRanges=featureNames.map((name,j)=>({name,min:Math.min(...x.slice(0,t.trainStop).map(row=>row[j])),max:Math.max(...x.slice(0,t.trainStop).map(row=>row[j]))}));
 const standardized=latestX.map((value,j)=>(value-t.model.m[j])/t.model.scale[j]);
 const outside=trainingRanges.filter((range,j)=>latestX[j]<range.min||latestX[j]>range.max).map(range=>range.name),extreme=featureNames.filter((name,j)=>Math.abs(standardized[j])>3),trainingCounts=counts(0,t.trainStop),supportWarnings=[];
 const classNames=['big falls','small falls or no change','rises'],lowClasses=classNames.filter((name,j)=>trainingCounts[j]<10);
 if(lowClasses.length)supportWarnings.push({code:'LOW_CLASS_SUPPORT',classes:lowClasses,message:'The learning examples include fewer than 10 cases for: '+lowClasses.join(', ')+'. These chances have little supporting data.'});
 if(outside.length||extreme.length)supportWarnings.push({code:'UNFAMILIAR_INPUT',message:'Some recent price patterns are unusual compared with the learning examples. Treat this guess with extra care.'});
 const featureSupport={reference:strict?'Frozen coefficient-training rows only; temperature, selection and reserved evaluation rows are excluded.':'Training rows of the latest refit; later calibration/selection rows are excluded. Classic refits may include observations evaluated in earlier expanding folds.',training_observations:t.trainStop,training_class_counts:trainingCounts,training_ranges:trainingRanges,latest:{feature_index:close.length-1,standardized_values:standardized,max_abs_standardized_value:Math.max(...standardized.map(Math.abs)),outside_training_range:outside,extreme_features:extreme},thresholds:{absolute_standardized_value:3,minimum_class_count:10,note:'Descriptive heuristics, not calibrated confidence, a formal drift test, or evidence that unflagged forecasts are reliable.'},warnings:supportWarnings};

 return{feature_support:featureSupport,target:'next observed-close log return',threshold:-.02,classes:['r < -0.02','-0.02 <= r <= 0','r > 0'],validation_protocol:{name:protocol,scope:strict?'single reserved final 200 labeled feature rows':'expanding chronological test blocks',note:strict?'Training, temperature fitting and candidate selection use separate earlier blocks; evaluated coefficients, temperatures and choice stay frozen for latest forecast. EWMA updates causally. Repeated inspection can still overfit this reservation.':'Temperature and candidate selection reuse calibration; latest forecast refits on its own earlier training block.',reserved_test_rows:strict?200:0},test_observations:allY.length,predictions,folds,candidate_metrics:candidateMetrics,baseline_metrics:{empirical_raw:metrics(allY,rawQ),empirical_calibrated:candidateMetrics.empirical},selected_metrics:metrics(allY,selectedQ),model_details:{ewma:{half_life_observations:20,alpha:1-Math.exp(-Math.log(2)/20),mean_model:'ridge',initialization:'training residual mean square',variance_convention:'next-observation conditional residual second moment; daily sigma floor 1e-6',update:'online after each observed label, with frozen fold ridge coefficients; own forecast label excluded',annualization:'sigma times sqrt(252); assumes equally spaced trading-day observations',probabilities:'normal residual probabilities, then calibration-selected temperature'},ridge:{variance:'constant training residual sample variance'}},latest_forecast:{...boundaries(t),...(strict?{fit_metadata:snapshot(t),fit_frozen_from_fold:0}:{}),candidate_volatility_annualized:{ewma:t.ewmaSigmas[y.length]*Math.sqrt(252),ridge:t.model.sigma*Math.sqrt(252)},ewma_sigma:t.ewmaSigmas[y.length],probabilities:candidate[t.chosen],model:t.chosen,candidate_probabilities:candidate,feature_index:close.length-1,target_index:close.length,calibration_log_loss:t.scores,temperatures:t.temps},limitations:['Synthetic data demonstrate software only.','Next observed close may span calendar gaps.','Normal ridge/EWMA errors and stationary calibration can fail under regime shifts.','EWMA volatility updates from prior observed outcomes inside test blocks; mean coefficients stay frozen.','Annualized volatility assumes 252 equally spaced trading observations; calendar gaps can invalidate this convention.',strict?'Reserved labels are excluded from coefficient/temperature/choice fitting; EWMA updates using only earlier observed labels. Repeated inspection is not controlled.':'Temperature and model selection reuse calibration; test blocks remain untouched.','No transaction costs, execution model, or established economic edge.']};
}
const api={synthetic,features,run};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
