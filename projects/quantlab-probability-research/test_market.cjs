'use strict';
const assert=require('node:assert/strict');
const Q=require('./market.js');
const raw=require('./market-data.json');
const clone=()=>structuredClone(raw);
const list=Q.validateSnapshot(raw);
assert.equal(list.length,8);assert.equal(list[0].ticker,'AAPL');assert.equal(list[0].closes.length,1254);
assert.notEqual(list[0].closes,raw.securities[0].closes,'Validated input must not share mutable price arrays');
for(const mutate of [d=>d.schemaVersion=2,d=>d.securities[0].currency='EUR',d=>d.securities[0].closes[0]=0,d=>d.securities[0].closes[0]=Infinity,d=>d.securities[0].dates[0]='2021-02-30',d=>d.securities[0].dates[1]=d.securities[0].dates[0],d=>d.securities[0].dates.pop(),d=>d.securities[0].sourceUrl='javascript:alert(1)',d=>d.securities[0].ticker='<img>',d=>d.securities.push(d.securities[0]),d=>d.securities[0].adjustment='']){const data=clone();mutate(data);assert.throws(()=>Q.validateSnapshot(data));}
assert.throws(()=>Q.validateSnapshot({schemaVersion:1,securities:[]}));
(async()=>{let call;const items=await Q.loadSnapshot(async(url,options)=>{call={url,options};return{ok:true,text:async()=>JSON.stringify(raw)}});assert.equal(items.length,8);assert.equal(call.url,'market-data.json');assert(!call.options.body);assert.equal(call.options.cache,'no-cache');
await assert.rejects(()=>Q.loadSnapshot(async()=>({ok:false,status:503})),/unavailable/i);
await assert.rejects(()=>Q.loadSnapshot(async()=>({ok:true,text:async()=>'{bad'})),/snapshot/i);
await assert.rejects(()=>Q.loadSnapshot(async()=>({ok:true,text:async()=>' '.repeat(2*1024*1024+1)})),/2 MiB/);
const source=Q.source(items[0]);assert.equal(source.ticker,'AAPL');assert.equal(source.kind,'market_snapshot');assert.equal(source.last_observation_date,'2026-10-28');assert.equal(source.rows,1254);assert.match(source.adjustment_basis,/adjusted/i);assert.equal(source.synthetic,false);
console.log('Market snapshot tests passed: eight verified series, invalid inputs, bounded read, source provenance, failed fetch.');})().catch(e=>{console.error(e);process.exitCode=1});
