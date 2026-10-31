const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const referenceDir = path.resolve(__dirname, '../../outputs/imperial-experimental-release');
const payload = JSON.parse(fs.readFileSync(path.join(referenceDir, 'model.json'), 'utf8'));
function isolated(directory) {
  const context = vm.createContext({module: {exports: {}}, console});
  vm.runInContext(fs.readFileSync(path.join(directory, 'inference.js'), 'utf8'), context);
  const Model = context.module.exports.ImperialModel;
  context.module = {exports: {}};
  context.require = name => {
    assert.equal(name, './inference.js');
    return {ImperialModel: Model};
  };
  vm.runInContext(fs.readFileSync(path.join(directory, 'generation-worker.js'), 'utf8'), context);
  return {Model, generate: context.module.exports.generate};
}
const reference = isolated(referenceDir);
const candidate = isolated(__dirname);
const oracle = new reference.Model(payload);
const model = new candidate.Model(payload);
assert.equal(typeof model.createDecoder, 'function', 'candidate must expose per-request createDecoder');
const decoder = model.createDecoder();
assert.equal(typeof decoder.forward, 'function');
let comparisons = 0;
function check(ids, current = decoder) {
  const expected = Array.from(oracle.forward(ids));
  assert.deepEqual(Array.from(model.forward(ids)), expected, 'optimized full forward must remain exactly equal');
  assert.deepEqual(Array.from(current.forward(ids)), expected, 'cached logits must remain exactly equal');
  comparisons++;
}
const history = oracle.encode('The little bird flew over the quiet garden. A child smiled and waved. '.repeat(4));
// Numerical parity alone would also pass a decoder that recomputed every row.
// Observe the public computation boundaries to require actual prefix reuse.
const instrumented = new candidate.Model(payload);
let fullCalls = 0, tokenCalls = 0, maxCachedRows = 0;
const originalContext = instrumented.forwardContext;
const originalToken = instrumented.forwardToken;
function inspectCache(cache) {
  if (!cache) return;
  for (const block of cache) for (const head of block) {
    assert.equal(head.keys.length, head.values.length);
    assert.ok(head.keys.length <= payload.config.context_length, 'cached history must stay bounded');
    maxCachedRows = Math.max(maxCachedRows, head.keys.length);
  }
}
instrumented.forwardContext = function(ids, cache) {
  fullCalls++;
  const result = originalContext.call(this, ids, cache);
  inspectCache(cache);
  return result;
};
instrumented.forwardToken = function(id, position, cache) {
  tokenCalls++;
  const result = originalToken.call(this, id, position, cache);
  inspectCache(cache);
  return result;
};
const traced = instrumented.createDecoder();
for (let length = 1; length <= 64; length++) {
  assert.deepEqual(Array.from(traced.forward(history.slice(0, length))), Array.from(oracle.forward(history.slice(0, length))));
}
assert.equal(fullCalls, 1, 'growing prefixes should not rerun full-context inference');
assert.equal(tokenCalls, 63, 'each appended token should use incremental computation');
assert.equal(maxCachedRows, 64, 'growth should exercise the complete bounded context');
traced.forward(history.slice(0, 64));
assert.equal(fullCalls, 1, 'repeated input should reuse existing logits');
assert.equal(tokenCalls, 63, 'repeated input should not append duplicate cached rows');
for (let end = 65; end <= 68; end++) {
  const ids = history.slice(end - 64, end);
  assert.deepEqual(Array.from(traced.forward(ids)), Array.from(oracle.forward(ids)));
}
assert.equal(fullCalls, 5, 'position-shifting windows must rebuild rather than reuse stale rows');
assert.equal(tokenCalls, 63, 'a full-window shift is not an append');
const replacement = history.slice(0, 10);
traced.forward(replacement);
replacement[0] = (replacement[0] + 1) % payload.vocab.length;
assert.deepEqual(Array.from(traced.forward(replacement)), Array.from(oracle.forward(replacement)));
assert.equal(fullCalls, 7, 'replacement and same-length mutation must invalidate cached prefixes');
replacement.push(history[10]);
assert.deepEqual(Array.from(traced.forward(replacement)), Array.from(oracle.forward(replacement)));
assert.equal(tokenCalls, 64, 'a rebuilt shorter context should support subsequent incremental append');
for (let length = 1; length <= 64; length++) check(history.slice(0, length));
// 65 total history characters crop to a shifted 64-character window. Learned
// absolute positions reset, so retaining stale KV rows would be incorrect.
for (let length = 65; length <= 72; length++) check(history.slice(length - 64, length));
for (const length of [1, 2, 10, 63, 64]) {
  const fresh = model.createDecoder();
  check(history.slice(0, length), fresh);
  check(history.slice(0, length), fresh);
}
const mutable = history.slice(0, 10);
check(mutable);
mutable[3] = (mutable[3] + 1) % payload.vocab.length;
check(mutable);
mutable.push(history[10]);
check(mutable);
check(oracle.encode('A small cat'));
check(oracle.encode('A small cat'));
check(history.slice(0, 2));
check(history.slice(0, 10));
const saved = decoder.forward(history.slice(0, 10));
saved[0] = Infinity;
check(history.slice(0, 10));
const second = model.createDecoder();
for (const length of [1, 2, 10, 63, 64]) {
  check(history.slice(0, length), decoder);
  check(history.slice(30, 30 + length), second);
}
for (const invalid of [[], null, {}, [NaN], [Infinity], [-1], [0.5], [payload.vocab.length], Array(65).fill(0)]) {
  assert.throws(() => decoder.forward(invalid), /Context/);
  check(history.slice(0, 10));
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
let generationCases = 0;
for (const seed of [42, 1729]) {
  for (const spec of [{prompt: 'The little', length: 64},
                      {prompt: 'The little bird flew over the garden. '.repeat(4), length: 128}]) {
    const request = {payload, ...spec, seed, temperature: 0.7};
    const expectedMessages = [], actualMessages = [];
    const expected = reference.generate(request, message => expectedMessages.push(plain(message)));
    const actual = candidate.generate(request, message => actualMessages.push(plain(message)));
    assert.equal(actual.text, expected.text, 'seeded generated text must be identical');
    assert.deepEqual(Array.from(actual.logits), Array.from(expected.logits), 'final logits must be identical');
    assert.deepEqual(plain(actual), plain(expected), 'complete final message parity');
    assert.deepEqual(actualMessages, expectedMessages, 'progress and done event parity');
    generationCases++;
  }
}
console.log(`PASS: ${comparisons} strict reference/optimized/cached logit comparisons and ${generationCases} seeded worker cases, including sliding windows, mutation, invalid inputs and independent decoders.`);
