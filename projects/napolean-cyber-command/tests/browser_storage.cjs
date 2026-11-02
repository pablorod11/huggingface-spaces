'use strict';
// Real Chromium/IndexedDB integration checks. Uses an existing Playwright install.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

async function main() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const body = await fs.readFile(filename);
      response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(filename)] || 'application/octet-stream');
      response.end(body);
    } catch (_) { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const externalRequests = [];
    const localRequestsOnly = route => {
      if (!route.request().url().startsWith(origin + '/')) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    };
    await context.route('**/*', localRequestsOnly);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => globalThis.CyberLocal && document.querySelector('#view h1'));
    const record = await page.evaluate(async () => {
      const result = await CyberLocal.request('/api/assessments', { method: 'POST', body: {
        name: 'Browser integration fixture', workflow: 'code', scope: 'Owned synthetic fixture', authorization: true,
        content: 'eval(user_input)', roles: ['red', 'blue', 'white', 'black', 'purple']
      }});
      return result.assessment;
    });
    await page.reload();
    await page.waitForFunction(() => globalThis.CyberLocal && document.querySelector('#view h1'));
    assert.equal(await page.evaluate(async id => (await CyberLocal.request('/api/assessments/' + id)).assessment.id, record.id), record.id);
    console.log('PASS actual IndexedDB survives page reload');

    const second = await context.newPage();
    await second.goto(origin);
    await second.waitForFunction(() => !!globalThis.CyberLocal);
    const review = (tab, label) => tab.evaluate(async ({ id, fid, label, revision }) => {
      try {
        await CyberLocal.request(`/api/assessments/${id}/findings/${fid}`, { method: 'PATCH', body: {
          expected_revision: revision, verdict: 'unresolved', note: `${label} independent synthetic evidence review.`,
          tracking: { owner: label, status: 'resolved', due_date: '2026-12-01', retest: `${label} synthetic retest evidence` }
        }});
        return { label, saved: true };
      } catch (error) { return { label, saved: false, code: error.code }; }
    }, { id: record.id, fid: record.findings[0].id, label, revision: record.findings[0].revision || 0 });
    const outcomes = await Promise.all([review(page, 'First tab'), review(second, 'Second tab')]);
    assert.equal(outcomes.filter(row => row.saved).length, 1);
    const loser = outcomes.find(row => !row.saved), winner = outcomes.find(row => row.saved);
    assert.equal(loser.code, 'CONFLICT');
    const current = await page.evaluate(async id => (await CyberLocal.request('/api/assessments/' + id)).assessment, record.id);
    assert.equal(current.findings[0].tracking.owner, winner.label);
    assert.equal(current.findings[0].tracking.status, 'resolved');
    assert.equal(current.activity.length, 2, 'rejected stale write adds no event');
    await second.evaluate(async ({ id, fid, label }) => {
      const fresh = (await CyberLocal.request('/api/assessments/' + id)).assessment.findings.find(row => row.id === fid);
      await CyberLocal.request(`/api/assessments/${id}/findings/${fid}`, { method: 'PATCH', body: {
        expected_revision: fresh.revision, verdict: 'unresolved', note: `${label} independent synthetic evidence review after explicit reload.`
      }});
    }, { id: record.id, fid: record.findings[0].id, label: loser.label });
    const reviewed = await page.evaluate(async id => (await CyberLocal.request('/api/assessments/' + id)).assessment, record.id);
    assert.equal(reviewed.activity.length, 3);
    assert.match(JSON.stringify(reviewed.activity), /First tab/);
    assert.match(JSON.stringify(reviewed.activity), /Second tab/);
    assert.equal(reviewed.findings[0].tracking.owner, winner.label);
    console.log('PASS actual IndexedDB stale write conflicts, preserves current tracking, and explicit reload/retry retains both notes');

    const duplicateRollback = await page.evaluate(async record => {
      const store = new CyberLocal.IndexedDBStore();
      const before = (await store.list()).length;
      const row = structuredClone(record); row.id = 'a'.repeat(32);
      let rejected = false;
      try { await store.addMany([row, structuredClone(row)], 100); } catch (_) { rejected = true; }
      return { rejected, before, after: (await store.list()).length, exists: !!(await store.get(row.id)) };
    }, record);
    assert.deepEqual(duplicateRollback, { rejected: true, before: 1, after: 1, exists: false });
    console.log('PASS actual IndexedDB duplicate-key transaction abort rolls back entire batch');

    const quotaRollback = await page.evaluate(async record => {
      const store = new CyberLocal.IndexedDBStore();
      const original = IDBObjectStore.prototype.add;
      const rows = ['b', 'c'].map(letter => ({ ...structuredClone(record), id: letter.repeat(32) }));
      let calls = 0, rejected = false;
      IDBObjectStore.prototype.add = function (...args) {
        if (++calls === 2) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return original.apply(this, args);
      };
      try { await store.addMany(rows, 100); } catch (_) { rejected = true; }
      finally { IDBObjectStore.prototype.add = original; }
      return { rejected, retained: (await store.list()).length, firstExists: !!(await store.get(rows[0].id)) };
    }, record);
    assert.deepEqual(quotaRollback, { rejected: true, retained: 1, firstExists: false });
    console.log('PASS quota fault injection aborts real transaction without partial batch (simulated quota)');

    const denied = await page.evaluate(async () => {
      const store = new CyberLocal.IndexedDBStore({ open() { throw new DOMException('Synthetic storage denial', 'SecurityError'); } });
      try { await store.list(); return false; } catch (error) { return /storage|privacy/i.test(error.message); }
    });
    assert.equal(denied, true);
    console.log('PASS storage denial is surfaced (simulated browser policy)');

    const snapshots = await page.evaluate(async id => {
      let assessment = (await CyberLocal.request('/api/assessments/' + id)).assessment;
      const first = await CyberLocal.createSnapshot(id, assessment.revision || 0);
      const snapshot = first.snapshot;
      const frozen = await CyberLocal.exportSnapshot(id, snapshot.id, 'json');
      assessment = (await CyberLocal.request('/api/assessments/' + id)).assessment;
      const finding = assessment.findings[0];
      await CyberLocal.request(`/api/assessments/${id}/findings/${finding.id}`, { method: 'PATCH', body: {
        expected_revision: finding.revision, verdict: 'unresolved', note: 'Later synthetic evidence must not alter the captured snapshot.'
      }});
      const unchanged = frozen === await CyberLocal.exportSnapshot(id, snapshot.id, 'json');
      for (let index = 0; index < 2; index++) {
        assessment = (await CyberLocal.request('/api/assessments/' + id)).assessment;
        await CyberLocal.createSnapshot(id, assessment.revision);
      }
      assessment = (await CyberLocal.request('/api/assessments/' + id)).assessment;
      let capped = false;
      try { await CyberLocal.createSnapshot(id, assessment.revision); } catch (_) { capped = true; }
      return { unchanged, capped, count: assessment.snapshots.length, snapshot, frozen };
    }, record.id);
    assert.equal(snapshots.unchanged, true);
    assert.equal(snapshots.capped, true);
    assert.equal(snapshots.count, 3);
    assert.equal(Object.hasOwn(snapshots.snapshot.data, 'snapshots'), false);
    assert.match(snapshots.snapshot.sha256, /^[a-f0-9]{64}$/);
    console.log('PASS SHA-256 report snapshots stay frozen after later edits, contain no nested snapshots and enforce the three-snapshot cap');

    const restore = await page.evaluate(async () => {
      const before = (await CyberLocal.request('/api/assessments')).assessments;
      const backup = await CyberLocal.backupText();
      CyberLocal.previewBackup(backup);
      await CyberLocal.restoreBackup(backup);
      const after = (await CyberLocal.request('/api/assessments')).assessments;
      const envelope = JSON.parse(backup);
      return { before, after, envelope };
    });
    assert.equal(restore.before.length, 1);
    assert.equal(restore.after.length, 2);
    assert.equal(new Set(restore.after.map(row => row.id)).size, 2);
    assert.ok(restore.after.some(row => row.id !== restore.before[0].id));
    const copied = await page.evaluate(async original => {
      const summaries = (await CyberLocal.request('/api/assessments')).assessments;
      const copy = (await CyberLocal.request('/api/assessments/' + summaries.find(row => row.id !== original.id).id)).assessment;
      return { original: original.findings.map(row => row.id), copied: copy.findings.map(row => row.id), snapshots: copy.snapshots };
    }, record);
    assert.equal(copied.original.length, copied.copied.length);
    assert.ok(copied.copied.every(id => !copied.original.includes(id)));
    assert.equal(copied.snapshots[0].id, snapshots.snapshot.id, 'historical snapshot ID stays historical on restore');
    assert.deepEqual(copied.snapshots[0].data, snapshots.snapshot.data);
    assert.equal(copied.snapshots[0].sha256, snapshots.snapshot.sha256);
    console.log('PASS versioned backup restores into actual IndexedDB with fresh record IDs');

    const invalid = await page.evaluate(async () => {
      const before = (await CyberLocal.request('/api/assessments')).assessments.length;
      const envelope = JSON.parse(await CyberLocal.backupText());
      // Restore must validate the entire file before adding any of its records.
      if (!Array.isArray(envelope.records)) throw new Error('Expected versioned records backup envelope.');
      envelope.records[envelope.records.length - 1].workflow = 'invalid-workflow';
      let rejected = false;
      try { await CyberLocal.restoreBackup(JSON.stringify(envelope)); } catch (_) { rejected = true; }
      return { before, after: (await CyberLocal.request('/api/assessments')).assessments.length, rejected };
    });
    assert.deepEqual(invalid, { before: 2, after: 2, rejected: true });
    console.log('PASS whole invalid backup is rejected without mutating actual IndexedDB');

    const tampered = await page.evaluate(async () => {
      const before = (await CyberLocal.request('/api/assessments')).assessments.length;
      const envelope = JSON.parse(await CyberLocal.backupText());
      envelope.records[envelope.records.length - 1].snapshots[0].data.name = 'Tampered synthetic snapshot title';
      let rejected = false;
      try { await CyberLocal.restoreBackup(JSON.stringify(envelope)); } catch (_) { rejected = true; }
      return { before, after: (await CyberLocal.request('/api/assessments')).assessments.length, rejected };
    });
    assert.deepEqual(tampered, { before: 2, after: 2, rejected: true });
    console.log('PASS tampered snapshot digest rejects the whole backup before any IndexedDB mutation');

    await page.reload();
    await page.getByRole('button', { name: /Backup all clients JSON/ }).waitFor();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: /Backup all clients JSON/ }).click();
    const download = await downloaded;
    const stream = await download.createReadStream();
    let downloadedText = '';
    for await (const chunk of stream) downloadedText += chunk.toString('utf8');
    assert.equal(JSON.parse(downloadedText).records.length, 2);
    await page.getByRole('button', { name: /Restore backup/ }).click();
    await page.locator('#restore-file').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(downloadedText) });
    await page.locator('#restore-preview').filter({ hasText: '2 assessment copies' }).waitFor();
    await page.locator('#restore-confirm').check();
    await page.locator('#restore-submit').click();
    await page.waitForFunction(async () => (await CyberLocal.request('/api/assessments')).assessments.length === 4);
    console.log('PASS browser UI backup download, import preview, confirmation and restore');

    const historyCap = await page.evaluate(async id => {
      const store = new CyberLocal.IndexedDBStore();
      const record = await store.update(id, row => {
        row.activity = Array.from({ length: 200 }, () => ({ at: new Date().toISOString(), action: 'test_fixture', note: 'Synthetic history cap fixture' }));
        return row;
      });
      let rejected = false;
      try { await CyberLocal.request(`/api/assessments/${id}/findings/${record.findings[0].id}`, { method: 'PATCH', body: { expected_revision: record.findings[0].revision || 0, verdict: 'unresolved', note: 'Synthetic review beyond the history cap.' } }); }
      catch (_) { rejected = true; }
      return { rejected, count: (await store.get(id)).activity.length };
    }, record.id);
    assert.deepEqual(historyCap, { rejected: true, count: 200 });
    console.log('PASS actual IndexedDB preserves full history when its 200-entry cap rejects a write');

    const fullHistoryRestore = await page.evaluate(async id => {
      const before = (await CyberLocal.request('/api/assessments')).assessments.length;
      const full = (await CyberLocal.request('/api/assessments/' + id)).assessment;
      await CyberLocal.restoreBackup(JSON.stringify(full));
      const rows = (await CyberLocal.request('/api/assessments')).assessments;
      const originalIds = new Set([id]);
      let copyWithHistory = false;
      for (const row of rows) {
        if (originalIds.has(row.id)) continue;
        const copy = (await CyberLocal.request('/api/assessments/' + row.id)).assessment;
        if (copy.activity.length === 200) copyWithHistory = true;
      }
      return { before, after: rows.length, copyWithHistory };
    }, record.id);
    assert.equal(fullHistoryRestore.after, fullHistoryRestore.before + 1);
    assert.equal(fullHistoryRestore.copyWithHistory, true);
    console.log('PASS maximum-history assessment remains restorable without truncating its evidence');

    await page.evaluate(async () => {
      const store = new CyberLocal.IndexedDBStore();
      const remaining = 99 - (await store.list()).length;
      const rows = Array.from({ length: remaining }, (_, index) => CyberLocal.analyze({
        name: `Synthetic capacity fixture ${index}`, workflow: 'exercise', scope: 'Owned synthetic fixture',
        content: 'Generic tabletop exercise', authorization: true, roles: ['blue']
      }));
      await store.addMany(rows, 100);
    });
    const addAtCapacity = tab => tab.evaluate(async () => {
      try {
        await CyberLocal.request('/api/assessments', { method: 'POST', body: {
          name: 'Synthetic concurrent capacity write', workflow: 'exercise', scope: 'Owned synthetic fixture',
          content: 'Generic tabletop exercise', authorization: true, roles: ['blue']
        }});
        return true;
      } catch (_) { return false; }
    });
    const capacityResults = await Promise.all([addAtCapacity(page), addAtCapacity(second)]);
    assert.equal(capacityResults.filter(Boolean).length, 1);
    assert.equal(await page.evaluate(async () => (await CyberLocal.request('/api/assessments')).assessments.length), 100);
    console.log('PASS actual IndexedDB concurrent tabs enforce the 100-record workspace limit atomically');

    const legacyContext = await browser.newContext({ serviceWorkers: 'block' });
    await legacyContext.route('**/*', localRequestsOnly);
    const legacyPage = await legacyContext.newPage();
    legacyPage.on('pageerror', error => errors.push(error.message));
    await legacyPage.goto(origin);
    await legacyPage.waitForFunction(() => !!globalThis.CyberLocal);
    const legacyResult = await legacyPage.evaluate(async source => {
      const legacy = structuredClone(source);
      delete legacy.revision; delete legacy.snapshots;
      for (const finding of legacy.findings) { delete finding.revision; delete finding.origin; }
      const result = await CyberLocal.restoreBackup(JSON.stringify({ format: 'napolean-cyber-command', version: 1, records: [legacy] }));
      const rows = (await CyberLocal.request('/api/assessments')).assessments;
      const restored = (await CyberLocal.request('/api/assessments/' + rows[0].id)).assessment;
      return { count: result.count, records: rows.length, freshId: restored.id !== source.id, snapshots: restored.snapshots || [] };
    }, record);
    assert.deepEqual(legacyResult, { count: 1, records: 1, freshId: true, snapshots: [] });
    const continuationRace = await legacyPage.evaluate(async () => {
      const store = new CyberLocal.IndexedDBStore();
      const service = new CyberLocal.LocalService(store);
      const source = (await store.list())[0];
      await store.update(source.id, row => { row.activity = Array.from({length:200}, (_,index)=>({at:row.created_at,action:'synthetic_history',note:'Owned fixture event '+index})); return row; });
      const extras = Array.from({length:98}, (_,index)=>CyberLocal.analyze({name:'Synthetic capacity '+index,scope:'Owned fixture',workflow:'exercise',roles:['blue'],authorization:true,content:'Generic tabletop'}));
      await store.addMany(extras,100);
      const before = JSON.stringify(await store.get(source.id));
      const results = await Promise.allSettled([service.request('/api/assessments/'+source.id+'/continue',{method:'POST',body:{expected_revision:source.revision||0}}),service.request('/api/assessments/'+source.id+'/continue',{method:'POST',body:{expected_revision:source.revision||0}})]);
      const rows = await store.list();
      return {successes:results.filter(item=>item.status==='fulfilled').length,count:rows.length,sourceUnchanged:before===JSON.stringify(await store.get(source.id)),copies:rows.filter(row=>row.continuation?.parent_id===source.id).map(row=>({activity:row.activity.length,snapshots:row.snapshots.length}))};
    });
    assert.deepEqual(continuationRace,{successes:1,count:100,sourceUnchanged:true,copies:[{activity:1,snapshots:0}]});
    console.log('PASS actual IndexedDB continuation at full history preserves source and concurrent capacity cannot exceed 100 records');
    await legacyContext.close();
    console.log('PASS legacy v1 backup restores into a fresh browser context');
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
    console.log('PASS no external network requests or uncaught page errors');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
