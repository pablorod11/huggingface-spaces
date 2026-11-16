'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modulePath = path.join(__dirname, '../static/protocols.js');

test('protocol study module is available for the workbook', () => {
  assert.ok(fs.existsSync(modulePath), 'Expected the local protocol study module');
});

test('known topics provide study questions and primary references without accepting arbitrary IDs', () => {
  const protocols = require(modulePath);
  assert.deepEqual(protocols.topics.map(topic => topic.id), ['http', 'tls', 'dns', 'ssh']);
  for (const id of ['http', 'tls', 'dns', 'ssh']) {
    const topic = protocols.getTopic(id);
    assert.equal(topic.id, id);
    assert.equal(topic.questions.length, 3);
    assert.ok(topic.title && topic.summary && topic.boundary && topic.explorerLesson);
    assert.ok(topic.sources.every(source => source.label && new URL(source.href).hostname === 'www.rfc-editor.org'));
  }
  for (const id of ['unknown', '__proto__', 'constructor', null, undefined]) {
    assert.equal(protocols.getTopic(id), null);
    assert.throws(() => protocols.draftExpected('', id), /choose|unknown|select/i);
  }
  assert.equal(protocols.explorerUrl, 'https://protocol-explorer-alpha.vercel.app/');
});

test('draft appends study context while preserving every existing character', () => {
  const protocols = require(modulePath);
  const existing = '  Existing expected controls.\r\nLeave this wording.  ';
  const drafted = protocols.draftExpected(existing, 'tls');
  assert.ok(drafted.startsWith(existing + '\n\n'));
  assert.match(drafted.slice(existing.length), /study context/i);
  assert.match(drafted.slice(existing.length), /not observations, evidence, or conclusions/i);
  assert.ok(drafted.includes(protocols.getTopic('tls').questions[0]));
  assert.equal(existing, '  Existing expected controls.\r\nLeave this wording.  ');
});

test('repeating the same topic does not duplicate or alter the draft', () => {
  const protocols = require(modulePath);
  const once = protocols.draftExpected('Expected behavior', 'http');
  assert.equal(protocols.draftExpected(once, 'http'), once);
  const both = protocols.draftExpected(once, 'ssh');
  assert.ok(both.startsWith(once + '\n\n'));
  assert.ok(both.includes(protocols.getTopic('ssh').questions[0]));
});

test('draft retains primary reference labels and URLs for exported study context', () => {
  const protocols = require(modulePath);
  const drafted = protocols.draftExpected('Existing controls', 'dns');
  assert.ok(drafted.includes('RFC 1035 — DNS implementation and specification'));
  assert.ok(drafted.includes('https://www.rfc-editor.org/rfc/rfc1035.html'));
  assert.ok(drafted.includes('RFC 4033 — DNS security introduction and requirements'));
  assert.ok(drafted.includes('https://www.rfc-editor.org/rfc/rfc4033.html'));
});

test('draft permits exactly 2000 characters and rejects overflow without truncation', () => {
  const protocols = require(modulePath);
  const emptyDraft = protocols.draftExpected('', 'dns');
  const prefixLength = 2000 - emptyDraft.length - 2;
  assert.ok(prefixLength > 0);
  const prefix = 'x'.repeat(prefixLength);
  const drafted = protocols.draftExpected(prefix, 'dns');
  assert.equal(drafted.length, 2000);
  assert.ok(drafted.startsWith(prefix + '\n\n'));
  assert.equal(protocols.draftExpected(drafted, 'dns'), drafted);
  assert.throws(() => protocols.draftExpected(prefix + 'x', 'dns'), /2000/);
  assert.throws(() => protocols.draftExpected(drafted + 'x', 'dns'), /2000/);
});

test('draft rejects non-text values instead of coercing or discarding them', () => {
  const protocols = require(modulePath);
  for (const value of [null, undefined, {}, 123]) {
    assert.throws(() => protocols.draftExpected(value, 'http'), /text|string/i);
  }
});

test('browser global supports drafting without storage or network capabilities', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context);
  assert.equal(context.VeyraProtocols.getTopic('dns').id, 'dns');
  assert.match(context.VeyraProtocols.draftExpected('', 'dns'), /study context/i);
});
