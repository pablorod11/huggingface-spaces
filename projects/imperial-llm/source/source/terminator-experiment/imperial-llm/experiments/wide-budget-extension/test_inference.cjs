const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {ImperialModel}=require('./inference.js');
const bytes=fs.readFileSync(path.join(__dirname,'model.json'));
const data=JSON.parse(bytes), record=JSON.parse(fs.readFileSync(path.join(__dirname,'training.json')));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.model_sha256);
const model=new ImperialModel(data);
let maximum=0;
for(const row of record.parity??record.parity_cases){ const ids=row.ids??row.token_ids, expected=row.logits??row.expected_final_logits; const got=model.forward(ids);assert.equal(got.length,expected.length);const error=Math.max(...got.map((x,i)=>Math.abs(x-expected[i])));maximum=Math.max(maximum,error);assert.ok(error<record.parity_tolerance,`Python/JS max error ${error}`); }
for(const text of ['The little','One day','The sun','\n'])assert.equal(model.decode(model.encode(text)),text);
assert.throws(()=>model.encode('🤖'),/Unsupported character/);
assert.throws(()=>model.forward([]),/Context/);
assert.throws(()=>model.forward([999]),/Context/);
assert.throws(()=>model.forward(Array(data.config.context_length+1).fill(0)),/Context/);
const broken=structuredClone(data);broken.weights['lm_head.weight'][0][0]=null;assert.throws(()=>new ImperialModel(broken),/Invalid model tensor/);
console.log(`PASS: checksum, three Python/JS logit cases (max error ${maximum}), roundtrip, input bounds, tensor validation.`);
