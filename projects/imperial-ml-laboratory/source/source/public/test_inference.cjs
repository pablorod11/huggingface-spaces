const assert = require('node:assert/strict');
const fs = require('node:fs');
const {infer} = require('./app.js');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let maximumError = 0;
for (let i = 0; i < data.parity.inputs.length; i++) {
  const actual = infer(data.model, data.parity.inputs[i]);
  assert.equal(actual.length, 10);
  assert.ok(Math.abs(actual.reduce((a,b)=>a+b,0)-1) < 1e-12);
  actual.forEach((p,j) => { maximumError = Math.max(maximumError, Math.abs(p-data.parity.expected[i][j])); });
}
assert.ok(maximumError <= data.parity.tolerance, `maximum error ${maximumError}`);
for (const bad of [[], Array(64).fill(NaN), Array(64).fill(Infinity), Array(64).fill(-0.1), Array(64).fill(1.1)]) {
  assert.throws(()=>infer(data.model,bad));
}
console.log(JSON.stringify({vectors:data.parity.inputs.length,maximumError,tolerance:data.parity.tolerance,invalidInputsRejected:5}));
