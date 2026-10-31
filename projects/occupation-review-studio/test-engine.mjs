import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Classifier,ReviewSession} from './engine.mjs';
const classifier=new Classifier(JSON.parse(fs.readFileSync(new URL('./model.json',import.meta.url))));
const fixtures=JSON.parse(fs.readFileSync(new URL('./parity-fixtures.json',import.meta.url)));
let maxError=0;
for(const {text,expected} of fixtures){const actual=classifier.predict(text);assert.equal(actual.prediction,expected.prediction);assert.equal(actual.route,expected.route);assert.equal(actual.known_features,expected.known_features);for(const c of classifier.classes){const delta=Math.abs(actual.probabilities[c]-expected.probabilities[c]);maxError=Math.max(maxError,delta);assert.ok(delta<1e-10,`${text}: ${c}: ${delta}`);}}
console.log(`PASS: Python/JavaScript parity over ${fixtures.length} inputs; maximum error ${maxError}`);
for(const text of ['', '  ',null,42,'x'.repeat(10001)])assert.throws(()=>classifier.predict(text));
assert.equal(classifier.predict('zzzznonwordzzzz').route,'ESCALATE');console.log('PASS: input validation and unknown vocabulary');
const session=new ReviewSession(), item=session.add('Ambiguous work',classifier.predict('zzzznonwordzzzz'));
assert.equal(item.final_label,null);assert.throws(()=>session.transition(item.id,0,'reviewer','claim'));assert.throws(()=>session.transition(item.id,0,'auditor','claim'));assert.equal(session.state.items[0].revision,0);
const claimed=session.transition(item.id,0,'senior','claim');assert.equal(claimed.final_label,null);assert.throws(()=>session.transition(item.id,0,'senior','resolve','SOFTWARE','stale'));
assert.throws(()=>session.transition(item.id,1,'senior','resolve','SOFTWARE',''));assert.throws(()=>session.transition(item.id,1,'senior','resolve','OTHER','invalid'));
const alternative=classifier.classes.find(x=>x!==item.prediction), final=session.transition(item.id,1,'senior','resolve',alternative,'Simulated correction');
assert.equal(final.final_label,alternative);assert.equal(final.provenance,'HUMAN');assert.equal(final.corrected,true);assert.equal(session.feedback()[0].history.length,3);assert.throws(()=>session.transition(item.id,2,'senior','resolve','FINANCE','overwrite'));console.log('PASS: role denial, ownership, reasons, stale revisions, human override, immutable decisions, feedback');
const bad=new ReviewSession(undefined,()=>{throw Error('Storage full');});assert.throws(()=>bad.add('test',classifier.predict('software')));assert.equal(bad.state.items.length,0);assert.equal(bad.state.events.length,0);console.log('PASS: failed persistence leaves memory unchanged');
const scope=new ReviewSession(), x=scope.add('Unknown',classifier.predict('zzzznonwordzzzz'));scope.transition(x.id,0,'senior','claim');assert.equal(scope.transition(x.id,1,'senior','out_of_scope',null,'Unsupported occupation').final_label,null);assert.equal(scope.feedback().length,0);console.log('PASS: out-of-scope closure has no category or training feedback');
const corrupt=structuredClone(classifier.model);corrupt.intercept[0]=NaN;assert.throws(()=>new Classifier(corrupt));console.log('PASS: corrupt model rejected');
