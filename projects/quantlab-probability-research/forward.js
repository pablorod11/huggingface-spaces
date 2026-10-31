'use strict';
// Local records are editable evidence of a saved guess, not verified preregistrations.
(function(root){
 const TARGET='next observed-close log return';
 const NOTE='One event cannot establish accuracy or an economic edge. This local editable record is not a verified preregistration. The next observation and its timing cannot be independently verified here.';
 const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,4)==='0000')throw Error('Use a valid Gregorian date as YYYY-MM-DD.');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('Use a valid Gregorian date as YYYY-MM-DD.');
  return value;
 }
 function probabilities(q){
  if(!Array.isArray(q)||q.length!==3||Array.from(q).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(q.reduce((a,b)=>a+b,0)-1)>1e-9)throw Error('Need three finite probabilities that sum to one.');
  return q.slice();
 }
 function anchor(identity){
  if(!identity||typeof identity.sha256!=='string'||!(/^[a-fA-F0-9]{64}$/).test(identity.sha256)||!Number.isSafeInteger(identity.rows)||identity.rows<62||identity.rows>2500||!positive(identity.last_close))throw Error('A complete valid input identity is required.');
  return{sha256:identity.sha256,rows:identity.rows,date:day(identity.last_date),close:identity.last_close};
 }
 function validRecord(record){
  if(!record||record.schema_version!==1||record.target!==TARGET||record.threshold!==-.02)throw Error('Unsupported forecast record.');
  const a=record.anchor;
  anchor({sha256:a?.sha256,rows:a?.rows,last_date:a?.date,last_close:a?.close});
  probabilities(record.probabilities);probabilities(record.baseline_probabilities);
 }
 function createRecord(report,identity,source={},savedAt=new Date().toISOString()){
  if(!report||report.precomputed||report.target!==TARGET||report.threshold!==-.02||!report.latest_forecast||!report.feature_support)throw Error('Save a current browser forecast with its training support and input identity.');
  const counts=report.feature_support.training_class_counts,n=report.feature_support.training_observations;
  if(!Array.isArray(counts)||counts.length!==3||Array.from(counts).some(v=>!Number.isSafeInteger(v)||v<0)||!Number.isSafeInteger(n)||n<1||n>2500||counts.reduce((a,b)=>a+b,0)!==n)throw Error('Training class counts must match the training sample size.');
  if(typeof savedAt!=='string'||!Number.isFinite(Date.parse(savedAt))||new Date(savedAt).toISOString()!==savedAt)throw Error('Use a valid ISO saved timestamp.');
  const revision=report.execution?.model_revision;
  return{schema_version:1,target:TARGET,threshold:-.02,saved_at:savedAt,model_revision:typeof revision==='string'?revision:'unrecorded-browser-model',model:typeof report.latest_forecast.model==='string'?report.latest_forecast.model:'unknown',synthetic:source.synthetic===true,source:Object.fromEntries(['kind','name','ticker','currency','adjustment_basis','source_url','snapshot_retrieved_at','last_observation_date'].filter(key=>typeof source[key]==='string').map(key=>[key,source[key]])),anchor:anchor(identity),probabilities:probabilities(report.latest_forecast.probabilities),baseline_probabilities:counts.map(v=>(v+1)/(n+3)),baseline:'Untuned training class frequencies with Laplace smoothing of one per class.',note:NOTE};
 }
 function scoreRecord(record,observation={}){
  validRecord(record);
  if(observation.confirmedNext!==true)throw Error('Confirm that this is the very next recorded closing price.');
  const date=day(observation.date);
  if(date<=record.anchor.date||!positive(observation.close))throw Error('The next closing price must be finite and positive, with a later date.');
  const y=Math.log(observation.close)-Math.log(record.anchor.close),outcome=y<-.02?0:y>0?2:1,q=record.probabilities,b=record.baseline_probabilities;
  const loss=-Math.log(Math.max(1e-12,q[outcome])),base=-Math.log(Math.max(1e-12,b[outcome]));
  return{date,close:observation.close,confirmed_next:true,actual_log_return:y,outcome_index:outcome,outcome:['Big fall','Small fall or no change','Rise'][outcome],assigned_probability:q[outcome],log_loss:loss,brier_multiclass:q.reduce((s,p,i)=>s+(p-(i===outcome?1:0))**2,0),baseline_assigned_probability:b[outcome],baseline_log_loss:base,log_loss_difference:loss-base,note:NOTE};
 }
 const api={createRecord,scoreRecord};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.QuantForward=api;
})(globalThis);
