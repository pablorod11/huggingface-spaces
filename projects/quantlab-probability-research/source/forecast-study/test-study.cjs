'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),S=require('./study.cjs'),B=require('./baseline.js');
const source=fs.readFileSync(__dirname+'/original-study.cjs','utf8'),definition=source.slice(source.indexOf('function generator('),source.indexOf('const label=')),context={Q:B,n:1200,Math};vm.createContext(context);vm.runInContext(definition+';this.generate=generator;',context);
for(const kind of ['built_in_regimes','iid_gaussian','heavy_tail','autocorrelated','volatility_up','volatility_down'])assert.deepEqual(S.generator(kind,63001,B),Array.from(context.generate(kind,63001)));
const summary=S.summarize([{kind:'a',difference:{log_loss:0,brier_multiclass:0,downside_brier:0}}],'kind');assert.equal(summary.passes,false);
const run={rows:Array.from({length:200},(_,date)=>({date,actual_log_return:date%2?.01:-.01,expanded:[.1,.3,.6],current:[.1,.4,.5],raw:[.1,.4,.5],calibrated:[.1,.4,.5]}))},m={bootstrap:{seed:83001,resamples:2000,upper_quantile:.983333}};
const single=S.bootstrap([run],20,m),duplicates=S.bootstrap([run,run],20,m);assert.deepEqual(single,duplicates);assert.deepEqual(single,S.bootstrap([run],20,m));assert.equal(single.current.upper_bound,single.raw.upper_bound);assert.throws(()=>S.bootstrap([run,{rows:run.rows.map((r,i)=>({...r,date:i+1}))}],20,m),/alignment/);
const exact=S.score([{actual_log_return:-.03,probabilities:[.5,.25,.25]}],r=>r.probabilities);assert.equal(exact.log_loss,-Math.log(.5));assert.equal(exact.brier_multiclass,.375);assert.equal(exact.downside_brier,.25);assert.equal(exact.outcomes[0].events,1);
console.log('PASS: archived generator equality, strict improvement gate, scoring, synchronized date-block bootstrap, deterministic resamples, date mismatch rejection');
