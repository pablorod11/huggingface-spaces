const assert=require('node:assert/strict'),{infer}=require('./app.js'),data=require('./showcase.json');
let maximum=0;
data.parity.inputs.forEach((pixels,i)=>infer(data.model,pixels).forEach((p,j)=>{maximum=Math.max(maximum,Math.abs(p-data.parity.expected[i][j]));}));
assert.ok(maximum<=data.parity.tolerance);
for(const bad of [[],Array(64).fill(NaN),Array(64).fill(2)])assert.throws(()=>infer(data.model,bad));
console.log(`PASS: ${data.parity.inputs.length} exported parity vectors; max error ${maximum}; invalid inputs rejected`);
