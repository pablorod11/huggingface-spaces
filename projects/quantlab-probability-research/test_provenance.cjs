const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const P=require('./provenance.js');
(async()=>{
 const input={dates:['2020-01-01','2020-01-02'],closes:[100,101]};
 const a=await P.fingerprint(input,webcrypto),b=await P.fingerprint({...input},webcrypto);
 assert.equal(a,b);assert.match(a,/^[a-f0-9]{64}$/);
 assert.notEqual(a,await P.fingerprint({...input,closes:[100,102]},webcrypto));
 assert.notEqual(a,await P.fingerprint({...input,dates:['2021-01-01','2021-01-02']},webcrypto));
 await assert.rejects(()=>P.fingerprint({dates:[],closes:[1]},webcrypto));
 const journal=P.createJournal(2);const meta={data_sha256:a,protocol:'strict',model_revision:'v1',cache_hit:false};
 const first=journal.record(meta);assert.equal(first.sequence,1);meta.protocol='changed';
 journal.record({...meta,cache_hit:true});journal.record(meta);
 let snapshot=journal.snapshot();assert.equal(snapshot.total_views,3);assert.equal(snapshot.omitted_views,1);assert.equal(snapshot.views.length,2);assert.equal(snapshot.views[0].sequence,2);
 snapshot.views[0].protocol='mutated';assert.notEqual(journal.snapshot().views[0].protocol,'mutated');
 assert(!JSON.stringify(snapshot).includes('closes'));
 journal.clear();assert.equal(journal.snapshot().total_views,0);assert.equal(journal.snapshot().views.length,0);
 console.log('Provenance tests passed: SHA-256 identity, date/value sensitivity, bounded cloned inspection history and clearing');
})().catch(e=>{console.error(e);process.exitCode=1;});
