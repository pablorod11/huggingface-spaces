'use strict';
const assert=require('node:assert/strict'),Q=require('./candidate.js'),B=require('./baseline.js');
const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function integral(f,a,b,n=20000){const h=(b-a)/n;let s=f(a)+f(b);for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);return s*h/3;}
const pdf=z=>3/8*(1+z*z/4)**-2.5;
for(const z of [-20,-5,-1,0,1,5,20]){near(Q.t4CDF(z),.5+integral(pdf,0,z),2e-10);near(Q.t4CDF(z)+Q.t4CDF(-z),1);}
near(Q.t4CDF(2),.9419417382415922);near(Q.t4CDF(0),.5);
for(const z of [1e3,1e6,1e50]){assert.ok(Q.t4Survival(z)>0);near(Q.t4Survival(z)*z**4,3,z===1e3?3e-5:1e-9);}
near(integral(z=>z*z*pdf(z),-200,200,100000),2,0.0004); // scale sigma/sqrt(2) restores variance sigma²
for(const mu of [-1,0,1])for(const sigma of [1e-6,.01,1]){const q=Q.t4Probabilities(mu,sigma);assert.ok(q.every(v=>v>=0&&v<=1));near(q.reduce((a,b)=>a+b),1);}
const close=B.synthetic(1254,63001),before=Q.run(close,{protocol:'strict'});
assert.ok('student_t4' in before.candidate_metrics);
assert.deepEqual(Q.run(close,{protocol:'classic'}),B.run(close,{protocol:'classic'}));
for(const at of [1054,1154,1253]){const mutated=close.map((v,i)=>i>=at?v*Math.exp(.015*(i-at+1)):v),after=Q.run(mutated,{protocol:'strict'});assert.deepEqual(after.folds[0].fit_metadata,before.folds[0].fit_metadata);assert.deepEqual(after.folds[0].temperatures,before.folds[0].temperatures);assert.equal(after.folds[0].selected,before.folds[0].selected);for(let i=0;i<before.predictions.length;i++)if(before.predictions[i].target_index<=at){assert.deepEqual(after.predictions[i].probabilities,before.predictions[i].probabilities);assert.deepEqual(after.predictions[i].candidate_probabilities.student_t4,before.predictions[i].candidate_probabilities.student_t4);assert.equal(after.predictions[i].ewma_sigma,before.predictions[i].ewma_sigma);}}
assert.deepEqual(before.latest_forecast.fit_metadata,before.folds[0].fit_metadata);
assert.equal(before.latest_forecast.temperatures.student_t4,before.folds[0].temperatures.student_t4);
console.log('PASS: independent integration, variance, tails, normalization, classic equivalence, own-label/future-suffix causality, frozen fit/temperature');
