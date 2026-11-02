'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {analyze, redact, markdownExport, LocalService, IndexedDBStore, previewBackup, summarize} = require('../static/local.js');

class MemoryStore {
  constructor() { this.rows = new Map(); this.chain = Promise.resolve(); }
  async list() { return structuredClone([...this.rows.values()]); }
  async get(id) { return structuredClone(this.rows.get(id)); }
  write(fn) {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => {});
    return next;
  }
  add(record, limit) { return this.write(() => {
    if (this.rows.size >= limit) throw new Error('100');
    this.rows.set(record.id, structuredClone(record)); return record;
  }); }
  addMany(records, limit) { return this.write(() => {
    if(this.rows.size+records.length>limit) throw new Error('100 assessment limit');
    const ids=new Set(records.map(row=>row.id));
    if(ids.size!==records.length || records.some(row=>this.rows.has(row.id))) throw new Error('Duplicate ID');
    for(const row of records) this.rows.set(row.id,structuredClone(row));
    return records;
  }); }
  continueFrom(sourceId,expected,maximum,buildCopy) {return this.write(()=>{
    const source=this.rows.get(sourceId);
    if(!source) throw new Error('Assessment not found.');
    if((source.revision||0)!==expected){const error=new Error('Source changed; reload before continuing.');error.code='CONFLICT';throw error;}
    if(this.rows.size>=maximum) throw new Error('100 assessment limit');
    const record=buildCopy(structuredClone(source));
    this.rows.set(record.id,structuredClone(record));return structuredClone(record);
  });}
  update(id, fn) { return this.write(() => {
    if (!this.rows.has(id)) throw new Error('Assessment not found.');
    const next = fn(structuredClone(this.rows.get(id)));
    this.rows.set(id, structuredClone(next)); return structuredClone(next);
  }); }
  delete(id) { return this.write(() => {
    if (!this.rows.delete(id)) throw new Error('Assessment not found.');
    return {ok: true};
  }); }
}
const payload = changes => ({name:'Owned lab', workflow:'code', scope:'Owned test app', authorization:true,
  content:'eval(user_input)\nsubprocess.run(command, shell=True)', roles:['red','blue','white','black','purple'], ...changes});
const evidence = changes => ({reviewer:'Analyst A',reference:'Owned fixture revision 123',prerequisites:'User-controlled input reaches the reviewed sink.',
  mitigations:'Reviewed input validation and sandbox boundaries.',method:'Manually traced source to sink in the owned test fixture.',...changes});
const manual=changes=>({title:'Observed access-control gap',severity:'medium',location:'Owned app review item',root_cause:'Authorization requires further review.',
  input_to_impact:'Analyst must validate cross-account access.',prerequisites:'Two authorized test accounts.',mitigations:'Server authorization unverified.',
  evidence:'Analyst observation in the owned fixture.',remediation:'Validate ownership checks and add regression coverage.',...changes});

test('local analysis nominates unresolved candidates without executing source', () => {
  const result = analyze(payload({content:'eval(user_input)\nsubprocess.run(command, shell=True)\npassword="private-secret-9823"'}));
  assert.equal(result.findings.length, 3);
  assert.ok(result.findings.every(f => f.verdict === 'unresolved'));
  assert.equal(result.missions.length, 5);
  assert.match(result.coverage.join(' '), /regex|pattern/i);
  assert.doesNotMatch(JSON.stringify(result), /private-secret-9823|eval\(user_input\)/);
  assert.equal(analyze(payload({content:'print("hello")'})).findings.length, 0);
});

test('local input validation rejects malformed or oversized scope workflows and roles', () => {
  for (const update of [{authorization:false},{authorization:'true'},{scope:''},{workflow:'scan'}, {roles:[]},
    {roles:['red','red']},{roles:['admin']},{roles:['red',{}]},{content:3},{content:'a'.repeat(64001)},
    {content:'eval(x)'+' '.repeat(64000)},{name:'n'.repeat(121)}]) {
    assert.throws(() => analyze(payload(update)));
  }
  for (const invalid of [[],null,3,'text']) assert.throws(() => analyze(invalid));
});

test('alerts group failures, retain no logs, disclose unsupported labels and validate schema', () => {
  const events = Array.from({length:5}, () => ({event:'login_failed',actor:'alice-private',source_ip:'192.0.2.1'}));
  events.push({event:'privilege_change'},{event:'malware_detected'},{event:'custom'});
  const result = analyze(payload({workflow:'alerts',content:JSON.stringify(events)}));
  assert.equal(result.findings.length,3);
  assert.match(result.coverage.join(' '),/1 event\(s\) skipped/);
  assert.doesNotMatch(JSON.stringify(result),/alice-private|192\.0\.2\.1/);
  for (const content of ['{}','[1]','bad','[{"event":3}]','[{"event":"x","extra":1}]',
    JSON.stringify(Array.from({length:501},()=>({event:'x'})))]) {
    assert.throws(() => analyze(payload({workflow:'alerts',content})));
  }
});

test('exercise scenario keywords change role-specific missions without retaining scenario prose', () => {
  const ransomware = analyze(payload({workflow:'exercise',content:'Unique prose 3512 ransomware encrypts payroll'}));
  const phishing = analyze(payload({workflow:'exercise',content:'Unique prose 4512 phishing targets identities'}));
  assert.equal(ransomware.scenario_category,'ransomware');
  assert.equal(phishing.scenario_category,'identity/phishing');
  assert.notDeepEqual(ransomware.missions[0].steps,phishing.missions[0].steps);
  assert.equal(ransomware.findings.length,0);
  assert.doesNotMatch(JSON.stringify(ransomware)+JSON.stringify(phishing),/Unique prose/);
});

test('redaction removes quoted multiword assignments and bearer metadata; markdown escapes markup', () => {
  const value = redact('password="Correct Horse Battery Staple" Authorization: Bearer private-token-315');
  assert.doesNotMatch(value,/Correct Horse|private-token-315/);
  const assessment = analyze(payload({name:'<img src=x onerror=alert(1)>',scope:'Owned scope password="Correct Horse Battery Staple"'}));
  assert.doesNotMatch(markdownExport(assessment), /<img|Correct Horse/);
  assert.match(markdownExport(assessment), /&lt;/);
});

test('service persists ledger decisions and exports, validates notes, and deletes', async () => {
  const store = new MemoryStore(), service = new LocalService(store);
  assert.deepEqual(await service.request('/api/assessments'),{assessments:[]});
  const {assessment:a} = await service.request('/api/assessments',{method:'POST',body:JSON.stringify(payload())});
  const base = '/api/assessments/'+a.id;
  await assert.rejects(service.request(base+'/findings/'+a.findings[0].id,{method:'PATCH',body:JSON.stringify({expected_revision:0,verdict:'confirmed-static',note:'yes'})}));
  const review = await service.request(base+'/findings/'+a.findings[0].id,{method:'PATCH',body:JSON.stringify({expected_revision:0,verdict:'confirmed-static',note:'Traced taint in the owned test fixture.',review:evidence()})});
  assert.equal(review.assessment.findings[0].verdict,'confirmed-static');
  const fresh = new LocalService(store);
  assert.equal((await fresh.request(base)).assessment.findings[0].verdict,'confirmed-static');
  assert.equal((await fresh.request('/api/assessments')).assessments[0].unresolved_count,1);
  assert.match(await fresh.exportText(a.id,'markdown'),/Traced taint/);
  assert.equal(JSON.parse(await fresh.exportText(a.id,'json')).id,a.id);
  await assert.rejects(fresh.exportText(a.id,'html'));
  assert.deepEqual(await fresh.request(base,{method:'DELETE'}),{ok:true});
  await assert.rejects(fresh.request(base));
  await assert.rejects(fresh.request('/api/login',{method:'POST',body:'{}'}));
});

test('concurrent stale reviews conflict then explicit reload preserves both decisions and bounded history', async () => {
  const store = new MemoryStore(), service = new LocalService(store);
  const {assessment:a} = await service.request('/api/assessments',{method:'POST',body:payload()});
  const path = `/api/assessments/${a.id}/findings/${a.findings[0].id}`;
  const results=await Promise.allSettled(['First','Second'].map(word => service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'unresolved',note:word+' independent evidence review.'}})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const failed=results.find(result=>result.status==='rejected');assert.equal(failed.reason.code,'CONFLICT');
  const loser=results[0].status==='rejected'?'First':'Second';
  await service.request(path,{method:'PATCH',body:{expected_revision:1,verdict:'unresolved',note:loser+' independent evidence review.'}});
  const record = (await service.request('/api/assessments/'+a.id)).assessment;
  assert.equal(record.activity.length,3);
  assert.match(JSON.stringify(record.activity),/First/); assert.match(JSON.stringify(record.activity),/Second/);
  await store.update(a.id, row => {row.activity=Array.from({length:200},()=>({at:'x',action:'review',note:'x'})); return row;});
  await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:2,verdict:'unresolved',note:'One more review'}}),/200/);
});

test('finding saves require exact revision and GET normalizes legacy revisions without silent overwrites',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const original=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  assert.equal(original.revision,0);assert.equal(original.findings[0].revision,0);
  const path=`/api/assessments/${original.id}/findings/${original.findings[0].id}`;
  for(const expected_revision of [undefined,-1,0.5,'0',1]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision,verdict:'unresolved',note:'Preserve the latest analyst decision.'}}),error=>error.code==='CONFLICT');
    assert.deepEqual(await store.get(original.id),original);
  }
  const saved=(await service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'unresolved',note:'Saved current revision without a stale overwrite.'}})).assessment;
  assert.equal(saved.revision,1);assert.equal(saved.findings[0].revision,1);
  const legacy=analyze(payload());delete legacy.revision;for(const finding of legacy.findings) delete finding.revision;
  await store.add(legacy,100);
  const fetched=(await service.request('/api/assessments/'+legacy.id)).assessment;
  assert.equal(fetched.revision,0);assert.equal(fetched.findings[0].revision,0);
});

test('record count is bounded and storage failure is surfaced instead of apparent success', async () => {
  const store = new MemoryStore(), service = new LocalService(store);
  for (let i=0;i<100;i++) await service.request('/api/assessments',{method:'POST',body:payload({content:'print(1)'})});
  await assert.rejects(service.request('/api/assessments',{method:'POST',body:payload()}),/100/);
  const broken = new LocalService({list:async()=>{throw new Error('storage failed');}});
  await assert.rejects(broken.request('/api/assessments'),/storage failed/);
  const unavailable = new IndexedDBStore(undefined);
  await assert.rejects(unavailable.list(),/storage|IndexedDB/i);
});

test('versioned backup previews clients and restores sanitized copies with fresh record and finding IDs', async () => {
  const store=new MemoryStore(), service=new LocalService(store);
  const first=(await service.request('/api/assessments',{method:'POST',body:payload({client:'Acme'})})).assessment;
  await service.request('/api/assessments',{method:'POST',body:payload({client:'Other business',workflow:'exercise',content:'A cloud tabletop'})});
  const backup=await service.backupText('Acme');
  assert.deepEqual(previewBackup(backup),{count:1,clients:['Acme']});
  assert.equal(JSON.parse(backup).format,'napolean-cyber-command');
  assert.deepEqual(await service.restoreBackup(backup),{count:1});
  const records=await store.list();
  const copy=records.find(row=>row.id!==first.id && row.client==='Acme');
  assert.ok(copy); assert.notEqual(copy.findings[0].id,first.findings[0].id);
  assert.equal(copy.name,first.name);
  assert.deepEqual(previewBackup(JSON.stringify(first)),{count:1,clients:['Acme']});
  const clientNames=(await service.request('/api/assessments')).assessments.map(row=>row.client);
  assert.ok(clientNames.includes('Other business'));
});

test('restore rejects malformed, oversized, hostile extra fields and invalid records without any mutation', async () => {
  const store=new MemoryStore(), service=new LocalService(store), record=analyze(payload());
  const envelope=records=>JSON.stringify({format:'napolean-cyber-command',version:1,records});
  for(const input of ['bad','{}','[]',JSON.stringify({format:'other',version:1,records:[]}),
    JSON.stringify({format:'napolean-cyber-command',version:3,records:[]}),
    envelope([{...record,content:'Raw source must never enter storage'}]),
    envelope([record,{...record,roles:['unknown']}]),
    ' '.repeat(5*1024*1024+1)]) {
    await assert.rejects(service.restoreBackup(input));
    assert.equal((await store.list()).length,0);
  }
  const malicious=structuredClone(record);
  malicious.scope='Owned scope password="Correct Horse Battery Staple"';
  await service.restoreBackup(envelope([malicious]));
  assert.doesNotMatch(JSON.stringify(await store.list()),/Correct Horse/);
});

test('restore capacity failure preserves existing records and adds no partial copies', async () => {
  const store=new MemoryStore(), service=new LocalService(store);
  for(let i=0;i<99;i++) await service.request('/api/assessments',{method:'POST',body:payload({content:'print(1)'})});
  const records=[analyze(payload()),analyze(payload())];
  await assert.rejects(service.restoreBackup(JSON.stringify({format:'napolean-cyber-command',version:1,records})),/100/);
  assert.equal((await store.list()).length,99);
});

test('confirmation requires structured evidence and remediation tracking validates dates and statuses', async () => {
  const service=new LocalService(new MemoryStore());
  const a=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const path=`/api/assessments/${a.id}/findings/${a.findings[0].id}`;
  for(const review of [undefined,evidence({reference:''}),evidence({method:'yes'}),evidence({method:'.'.repeat(30)}),evidence({reviewer:'A'.repeat(121)})]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Verified the owned source and reachable input.',review}}));
  }
  for(const tracking of [{due_date:'2026-02-31'},{due_date:'2026-1-1'},{status:'done'},{owner:42}]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'unresolved',note:'Review in progress.',tracking}}));
  }
  const result=await service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Verified the owned source and reachable input.',review:evidence(),
    tracking:{owner:'Fix owner',due_date:'2026-12-01',status:'in-progress',retest:'Regression test pending.'}}});
  assert.equal(result.assessment.findings[0].review.reviewer,'Analyst A');
  assert.equal(result.assessment.findings[0].tracking.due_date,'2026-12-01');
  const report=await service.exportText(a.id,'markdown');
  assert.match(report,/Executive summary/i);assert.match(report,/Fix owner/);assert.match(report,/Analyst A/);assert.ok(report.includes('Tracking status: in\\-progress'));
});

test('role handoffs append scoped activity and reject invalid or same-role handoffs', async () => {
  const service=new LocalService(new MemoryStore());
  const a=(await service.request('/api/assessments',{method:'POST',body:payload({roles:['red','blue']})})).assessment;
  const path='/api/assessments/'+a.id;
  for(const handoff of [{from:'red',to:'white',note:'Review this candidate.'},{from:'red',to:'red',note:'Review this candidate.'},{from:'red',to:'blue',note:''}]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:handoff}));
  }
  const result=await service.request(path,{method:'PATCH',body:{from:'red',to:'blue',note:'Correlate this candidate with owned defensive telemetry.'}});
  assert.equal(result.assessment.activity.length,2);
  assert.equal(result.assessment.activity[1].action,'role_handoff');
  assert.match(result.assessment.activity[1].note,/red.*blue/);
  assert.match(await service.exportText(a.id,'markdown'),/Correlate this candidate/);
});

test('imported incomplete confirmations are explicitly downgraded and nested fields cannot smuggle raw inputs', async () => {
  const store=new MemoryStore(),service=new LocalService(store),record=analyze(payload());
  record.findings[0].verdict='confirmed-runtime';
  const envelope=rows=>JSON.stringify({format:'napolean-cyber-command',version:1,records:rows});
  await service.restoreBackup(envelope([record]));
  const restored=(await store.list())[0];
  assert.equal(restored.findings[0].verdict,'unresolved');
  assert.match(restored.activity.at(-1).note,/Legacy confirmations/);
  for(const mutate of [row=>row.findings[0].review.content='raw source',row=>row.missions[0].steps=[{}],row=>row.activity[0].raw='source',
    row=>row.findings[0].tracking.status='bad',row=>row.findings[0].severity='critical']) {
    const bad=structuredClone(record);mutate(bad);await assert.rejects(service.restoreBackup(envelope([bad])));
  }
  assert.equal((await store.list()).length,1);
});

test('maximum alert grouping still round trips through the bounded backup schema', async () => {
  const events=[];
  for(let i=0;i<99;i++) for(let n=0;n<5;n++) events.push({event:'login_failed',actor:String(i)});
  events.push({event:'privilege_change'},{event:'malware_detected'});
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload({workflow:'alerts',content:JSON.stringify(events)})})).assessment;
  assert.equal(record.findings.length,100);
  assert.ok(record.findings.some(f=>f.title==='Malware alert requires validation'));
  assert.match(record.coverage.join(' '),/1 candidate.*omitted/);
  assert.equal(previewBackup(await service.backupText()).count,1);
});

test('full legitimate activity history remains restorable without truncation',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  await store.update(record.id,row=>{row.activity=Array.from({length:200},(_,index)=>({at:row.created_at,action:'finding_reviewed',note:'Evidence history entry '+index}));return row;});
  const backup=await service.backupText();
  await service.restoreBackup(backup);
  const copy=(await store.list()).find(row=>row.id!==record.id);
  assert.equal(copy.activity.length,200);
  assert.equal(copy.activity[199].note,'Evidence history entry 199');
  assert.match(copy.summary,/imported|restored/i);
});

test('redaction expansion cannot create records outside the bounded backup schema',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  for(const change of [{name:'token=x '.repeat(15)},{client:'token=x '.repeat(15)},{scope:'token=x '.repeat(250)}]) {
    await assert.rejects(service.request('/api/assessments',{method:'POST',body:payload(change)}),/redact|limit|characters/i);
  }
  assert.equal((await store.list()).length,0);
});

test('invalid structured updates and handoff/activity limits never partially modify records',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const path=`/api/assessments/${record.id}/findings/${record.findings[0].id}`;
  for(const update of [{review:evidence({reference:''}),verdict:'confirmed-static'}, {tracking:{due_date:'2027-02-29'},verdict:'unresolved'},
    {tracking:{retest:3},verdict:'unresolved'},{review:evidence({method:'token=x '.repeat(250)}),verdict:'confirmed-static'}]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,note:'Evidence remains unchanged on invalid updates.',...update}}));
    assert.deepEqual((await service.request('/api/assessments/'+record.id)).assessment,record);
  }
  await store.update(record.id,row=>{row.activity=Array.from({length:200},()=>({at:row.created_at,action:'review',note:'Preserved history'}));return row;});
  await assert.rejects(service.request('/api/assessments/'+record.id,{method:'PATCH',body:{from:'red',to:'blue',note:'New handoff'}}),/200/);
  assert.equal((await store.get(record.id)).activity.length,200);
});

test('optional blank client defaults to Unassigned while invalid types are rejected',()=>{
  for(const client of [undefined,'','  ']) assert.equal(analyze(payload({client})).client,'Unassigned');
  for(const client of [null,3,[]]) assert.throws(()=>analyze(payload({client})));
});

test('review activity retains prior reviewer and reference after latest evidence changes',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const path=`/api/assessments/${record.id}/findings/${record.findings[0].id}`;
  await service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'First review of reachable owned fixture.',review:evidence({reviewer:'First analyst',reference:'First revision 11'})}});
  const result=await service.request(path,{method:'PATCH',body:{expected_revision:1,verdict:'unresolved',note:'Second review needs more evidence.',review:evidence({reviewer:'Second analyst',reference:'Second revision 22'})}});
  assert.match(result.assessment.activity[1].note,/First analyst/);assert.match(result.assessment.activity[1].note,/First revision 11/);
  assert.match(result.assessment.activity[2].note,/Second analyst/);
  assert.equal(previewBackup(await service.backupText()).count,1);
});

test('maximum structured evidence remains backup-restorable and oversized workspace export gives an actionable error',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const path=`/api/assessments/${record.id}/findings/${record.findings[0].id}`;
  await service.request(path,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'N'.repeat(4000),
    review:evidence({reviewer:'R'.repeat(120),reference:'F'.repeat(2000),prerequisites:'P'.repeat(2000),mitigations:'M'.repeat(2000),method:'T'.repeat(2000)}),
    tracking:{owner:'O'.repeat(2000),due_date:'2028-02-29',status:'retest',retest:'Q'.repeat(2000)}}});
  assert.equal(previewBackup(await service.backupText()).count,1);
  const large=await store.get(record.id);
  large.activity=Array.from({length:200},()=>({at:record.created_at,action:'review',note:'A'.repeat(8000)}));
  for(let i=0;i<4;i++){const copy=structuredClone(large);copy.id=i.toString(16).padStart(32,'0');store.rows.set(copy.id,copy);}
  await assert.rejects(service.backupText(),/5 MB.*smaller client group|5 MB.*individual assessment/);
});

test('bounded lexical detection fixture benchmark distinguishes code from comments and strings',()=>{
  const fixtures=require('./detection-fixtures.cjs');
  for(const fixture of fixtures) {
    const result=analyze(payload({content:fixture.source}));
    assert.equal(result.findings.length,fixture.expected,fixture.name);
    assert.ok(result.findings.every(row=>row.verdict==='unresolved'),fixture.name);
    assert.match(result.coverage.join(' '),/scope|rebinding|dataflow/i);
  }
});

test('multiline aliased calls preserve original evidence line and never retain source strings',()=>{
  const result=analyze(payload({content:'# heading\nimport subprocess as sp\nsp.run(\n "private-command-marker-9182",\n shell=True\n)'}));
  assert.equal(result.findings.length,1);
  assert.match(result.findings[0].location,/line 3$/);
  assert.doesNotMatch(JSON.stringify(result),/private-command-marker-9182/);
});

test('nested direct evaluation is nominated even when immediately after an outer opening parenthesis',()=>{
  const result=analyze(payload({content:'subprocess.run(eval(user_input), shell=True)'}));
  assert.equal(result.findings.length,2);
  assert.ok(result.findings.some(row=>row.title==='Possible dynamic Python evaluation'));
  const nested=analyze(payload({content:'# heading\nwrapper(\n subprocess.run(command, shell=True)\n)'}));
  assert.equal(nested.findings.length,1);
  assert.match(nested.findings[0].location,/line 3$/);
});

test('unattributed login failures are disclosed without fabricated identity correlation',()=>{
  const anonymous=Array.from({length:5},()=>({event:'login_failed'}));
  const result=analyze(payload({workflow:'alerts',content:JSON.stringify(anonymous)}));
  assert.equal(result.findings.length,0);
  assert.match(result.coverage.join(' '),/5.*unattributed|5.*missing both/i);
  const partial=analyze(payload({workflow:'alerts',content:JSON.stringify(Array.from({length:5},()=>({event:'login_failed',source_ip:'192.0.2.1'})))}));
  assert.equal(partial.findings.length,1);
  assert.match(partial.coverage.join(' '),/5.*one identifier/i);
  assert.doesNotMatch(partial.findings[0].root_cause,/share actor and source/);
});

test('shared report totals count only confirmed nonresolved remediation work',()=>{
  const record=analyze(payload());const base=record.findings[0];
  record.findings=[['unresolved','open'],['rejected','open'],['confirmed-static','open'],['confirmed-runtime','retest'],['confirmed-static','resolved']]
    .map(([verdict,status])=>({...structuredClone(base),verdict,tracking:{...base.tracking,status}}));
  assert.deepEqual(summarize(record),{unresolved:1,confirmed_static:2,confirmed_runtime:1,rejected:1,open_remediation:2});
  assert.match(markdownExport(record),/Open remediation items: 2/);
  record.findings=[{...base,verdict:'unresolved',tracking:{...base.tracking,status:'open'}}];
  assert.equal(summarize(record).open_remediation,0);
});

test('manual findings impose unresolved low-confidence provenance and preserve bounded evidence',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload({content:'print(1)'})})).assessment;
  const path=`/api/assessments/${initial.id}/findings`;
  const saved=(await service.request(path,{method:'POST',body:manual({evidence:'Authorization: Bearer private-token-9833'})})).assessment;
  const added=saved.findings[0];
  assert.equal(added.origin,'manual');assert.equal(added.verdict,'unresolved');assert.equal(added.confidence,'low');assert.equal(added.revision,0);
  assert.equal(saved.revision,1);assert.equal(saved.activity.at(-1).action,'manual_finding_added');
  assert.doesNotMatch(JSON.stringify(saved),/private-token-9833/);
  assert.equal(summarize(saved).open_remediation,0);
  const before=await store.get(saved.id);
  for(const update of [{verdict:'confirmed-runtime'},{origin:'heuristic'},{title:''},{severity:'critical'},{content:'raw source'}, {evidence:'x'.repeat(4001)}]) {
    await assert.rejects(service.request(path,{method:'POST',body:manual(update)}));
    assert.deepEqual(await store.get(saved.id),before);
  }
  assert.equal(previewBackup(await service.backupText()).count,1);
});

test('manual additions enforce finding and activity limits in the same transaction',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const record=(await service.request('/api/assessments',{method:'POST',body:payload({content:'print(1)'})})).assessment;
  const path=`/api/assessments/${record.id}/findings`;
  await store.update(record.id,row=>{row.findings=Array.from({length:99},()=>analyze(payload()).findings[0]);return row;});
  const results=await Promise.allSettled([1,2].map(()=>service.request(path,{method:'POST',body:manual()})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await store.get(record.id)).findings.length,100);
  await store.update(record.id,row=>{row.findings=[];row.activity=Array.from({length:200},()=>({at:row.created_at,action:'review',note:'Preserved'}));return row;});
  await assert.rejects(service.request(path,{method:'POST',body:manual()}),/200/);
  assert.equal((await store.get(record.id)).findings.length,0);
});

test('snapshots freeze canonical report data with SHA256 and survive later edits unchanged',async()=>{
  const {createHash}=require('node:crypto');
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  assert.deepEqual(initial.snapshots,[]);
  const first=await service.createSnapshot(initial.id,0);
  assert.equal(first.assessment.revision,1);assert.equal(first.snapshot.version,1);
  assert.equal(first.snapshot.source_revision,0);assert.equal(first.snapshot.data.revision,0);
  assert.equal(Object.hasOwn(first.snapshot.data,'snapshots'),false);
  assert.equal(first.snapshot.sha256,createHash('sha256').update(JSON.stringify(first.snapshot.data)).digest('hex'));
  const exported=await service.exportSnapshot(initial.id,first.snapshot.id,'json');
  await service.request(`/api/assessments/${initial.id}/findings/${initial.findings[0].id}`,{method:'PATCH',body:{expected_revision:0,verdict:'unresolved',note:'Changed after the frozen report snapshot.'}});
  assert.equal(await service.exportSnapshot(initial.id,first.snapshot.id,'json'),exported);
  const markdown=await service.exportSnapshot(initial.id,first.snapshot.id,'markdown');
  assert.match(markdown,/SHA-256/);assert.doesNotMatch(markdown,/Changed after the frozen/);
  const second=await service.createSnapshot(initial.id,2);assert.equal(second.snapshot.version,2);
  const third=await service.createSnapshot(initial.id,3);assert.equal(third.snapshot.version,3);
  const before=await store.get(initial.id);
  await assert.rejects(service.createSnapshot(initial.id,4),/3 snapshot/);
  assert.deepEqual(await store.get(initial.id),before);
});

test('snapshot CAS prevents stale or simultaneous captures without partial history writes',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  for(const expected of [undefined,-1,'0',1]) await assert.rejects(service.createSnapshot(initial.id,expected),error=>error.code==='CONFLICT');
  const results=await Promise.allSettled([service.createSnapshot(initial.id,0),service.createSnapshot(initial.id,0)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(results.find(row=>row.status==='rejected').reason.code,'CONFLICT');
  const current=await store.get(initial.id);assert.equal(current.snapshots.length,1);assert.equal(current.activity.length,2);
});

test('backupv2 verifies every historical digest before atomic restore and accepts legacyv1 reports',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const created=await service.createSnapshot(initial.id,0);
  const text=await service.backupText();const envelope=JSON.parse(text);
  assert.equal(envelope.version,2);
  assert.deepEqual(await service.restoreBackup(text),{count:1});
  const copies=await store.list();const restored=copies.find(row=>row.id!==initial.id);
  assert.equal(restored.snapshots[0].id,created.snapshot.id);
  assert.deepEqual(restored.snapshots[0].data,created.snapshot.data);
  assert.notEqual(restored.id,created.snapshot.data.id);
  const before=await store.list();
  const tampered=structuredClone(envelope);tampered.records[0].snapshots[0].data.name='Changed historical report';
  await assert.rejects(service.restoreBackup(JSON.stringify(tampered)),/digest|SHA|integrity/i);
  assert.deepEqual(await store.list(),before);
  const nested=structuredClone(envelope);nested.records[0].snapshots[0].data.snapshots=[];
  await assert.rejects(service.restoreBackup(JSON.stringify(nested)),/unsupported|snapshot/i);
  const legacy=analyze(payload());delete legacy.revision;delete legacy.snapshots;
  for(const finding of legacy.findings){delete finding.revision;delete finding.origin;}
  assert.deepEqual(await service.restoreBackup(JSON.stringify({format:'napolean-cyber-command',version:1,records:[legacy]})),{count:1});
});

test('snapshot growth beyond a restorable single-record backup limit fails without changing the record',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  await store.update(initial.id,row=>{row.activity=Array.from({length:185},()=>({at:row.created_at,action:'review',note:'A'.repeat(8000)}));return row;});
  await service.createSnapshot(initial.id,0);await service.createSnapshot(initial.id,1);
  const before=await store.get(initial.id);
  await assert.rejects(service.createSnapshot(initial.id,2),/5 MB/);
  assert.deepEqual(await store.get(initial.id),before);
  assert.equal(previewBackup(await service.backupText()).count,1);
});

test('a valid near-5MB exported record restores without provenance annotations pushing it over the limit',async()=>{
  const store=new MemoryStore(),service=new LocalService(store),record=analyze(payload());
  const base=record.findings[0];
  record.findings=Array.from({length:100},(_,index)=>{
    const row=structuredClone(base);row.id=index.toString(16).padStart(32,'0');row.title='T'.repeat(500);
    for(const key of ['location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation','review_note']) row[key]='E'.repeat(4000);
    row.review=evidence({reviewer:'R'.repeat(120),reference:'F'.repeat(1000),prerequisites:'P'.repeat(1000),mitigations:'M'.repeat(1000),method:'D'.repeat(1000)});
    row.tracking={owner:'O'.repeat(1000),due_date:'',status:'open',retest:'Q'.repeat(1000)};return row;
  });
  const entry=length=>({at:record.created_at,action:'review',note:'H'.repeat(length)});
  const bytes=()=>Buffer.byteLength(JSON.stringify({format:'napolean-cyber-command',version:2,records:[record]},null,2));
  const limit=5*1024*1024;
  let low=1,high=199;
  while(low<high){const middle=Math.ceil((low+high)/2);record.activity=Array.from({length:middle},()=>entry(8000));if(bytes()<limit)low=middle;else high=middle-1;}
  record.activity=Array.from({length:low},()=>entry(8000));record.activity.push(entry(1));
  low=1;high=8000;
  while(low<high){const middle=Math.ceil((low+high)/2);record.activity.at(-1).note='H'.repeat(middle);if(bytes()<limit)low=middle;else high=middle-1;}
  record.activity.at(-1).note='H'.repeat(low);
  assert.ok(bytes()<limit&&bytes()>limit-5);
  await store.add(record,100);
  const backup=await service.backupText();
  assert.equal(previewBackup(backup).count,1);
  assert.deepEqual(await service.restoreBackup(backup),{count:1});
  const restored=(await store.list()).find(row=>row.id!==record.id);
  assert.equal(restored.activity.length,record.activity.length);
  assert.equal(restored.summary,record.summary);
});

test('current imported confirmations require substantive decision notes and frozen incomplete claims reject',async()=>{
  const store=new MemoryStore(),service=new LocalService(store),record=analyze(payload());
  record.findings[0].verdict='confirmed-static';record.findings[0].review=evidence();record.findings[0].review_note='short';
  const envelope=rows=>JSON.stringify({format:'napolean-cyber-command',version:2,records:rows});
  await service.restoreBackup(envelope([record]));
  assert.equal((await store.list())[0].findings[0].verdict,'unresolved');
  const fresh=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  await service.request(`/api/assessments/${fresh.id}/findings/${fresh.findings[0].id}`,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Substantive source review decision.',review:evidence()}});
  await service.createSnapshot(fresh.id,1);
  const backup=JSON.parse(await service.backupText());
  backup.records.find(row=>row.id===fresh.id).snapshots[0].data.findings[0].review_note='';
  const before=await store.list();
  assert.throws(()=>previewBackup(JSON.stringify(backup)),/note|evidence|confirmation/i);
  await assert.rejects(service.restoreBackup(JSON.stringify(backup)),/note|evidence|confirmation/i);
  assert.deepEqual(await store.list(),before);
});

test('role workbooks enforce completeness, redaction and assessment revision CAS',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  assert.equal(initial.workbook.length,5);assert.ok(initial.workbook.every(entry=>entry.status==='planned'));
  const path=`/api/assessments/${initial.id}/workbook`;
  const entry={...initial.workbook[0],owner:'Analyst A',status:'complete',evidence:'Owned test evidence revision 123',expected:'Expected defensive signal',observed:'Observed signal in the owned fixture',decision:'Evidence supports the scoped result.'};
  for(const change of [{evidence:''},{observed:''},{decision:''},{status:'done'},{owner:'X'.repeat(121)},{role:'admin'}]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,entry:{...entry,...change}}}));
    assert.deepEqual(await store.get(initial.id),initial);
  }
  const updated=(await service.request(path,{method:'PATCH',body:{expected_revision:0,entry:{...entry,evidence:'Authorization: Bearer private-token-workbook'}}})).assessment;
  assert.equal(updated.revision,1);assert.equal(updated.workbook[0].status,'complete');
  assert.doesNotMatch(JSON.stringify(updated),/private-token-workbook/);
  const before=await store.get(initial.id);
  await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,entry}}),error=>error.code==='CONFLICT');
  assert.deepEqual(await store.get(initial.id),before);
  const snapshot=await service.createSnapshot(initial.id,1);
  assert.deepEqual(snapshot.snapshot.data.workbook,updated.workbook);
  assert.match(await service.exportText(initial.id,'markdown'),/Role workbook|Five-hat workbook/i);
  assert.match(await service.exportText(initial.id,'markdown'),/Expected defensive signal/);
  assert.equal(previewBackup(await service.backupText()).count,1);
});

test('actual previous-release historical snapshot hashes remain unchanged through new normalization and backups',async()=>{
  const fs=require('node:fs');
  const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'legacy-snapshot.json'),'utf8'));
  const old=fixture.records[0].snapshots[0],store=new MemoryStore(),service=new LocalService(store);
  assert.equal(Object.hasOwn(old.data,'workbook'),false);assert.equal(Object.hasOwn(old.data,'delivery'),false);
  await service.restoreBackup(JSON.stringify(fixture));
  const first=(await store.list())[0];
  const exported=JSON.parse(await service.exportSnapshot(first.id,old.id,'json'));
  assert.equal(exported.sha256,old.sha256);assert.deepEqual(exported.data,old.data);
  const live=(await service.request('/api/assessments/'+first.id)).assessment;
  assert.equal(live.workbook.length,live.roles.length);
  await service.restoreBackup(await service.backupText());
  const copy=(await store.list()).find(row=>row.id!==first.id);
  const second=JSON.parse(await service.exportSnapshot(copy.id,old.id,'json'));
  assert.equal(second.sha256,old.sha256);assert.deepEqual(second.data,old.data);
});

test('continuation atomically creates a fresh linked current-state copy while a full source remains unchanged',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload({client:'Client A'})})).assessment;
  await service.request(`/api/assessments/${initial.id}/findings/${initial.findings[0].id}`,{method:'PATCH',body:{expected_revision:0,verdict:'confirmed-static',note:'Scoped source review with complete evidence.',review:evidence(),tracking:{owner:'Fix owner',status:'in-progress',due_date:'2027-01-01',retest:'Retest pending'}}});
  await service.createSnapshot(initial.id,1);
  await store.update(initial.id,row=>{row.activity=Array.from({length:200},()=>({at:row.created_at,action:'review',note:'Keep original source history'}));return row;});
  const source=await store.get(initial.id);
  const continued=(await service.request(`/api/assessments/${initial.id}/continue`,{method:'POST',body:{expected_revision:source.revision}})).assessment;
  assert.deepEqual(await store.get(initial.id),source);
  assert.notEqual(continued.id,source.id);assert.equal(continued.revision,0);
  assert.deepEqual(continued.continuation,{parent_id:source.id,parent_revision:source.revision});
  assert.equal(continued.activity.length,1);assert.equal(continued.activity[0].action,'continuation_created');
  assert.deepEqual(continued.snapshots,[]);assert.equal(continued.client,'Client A');assert.deepEqual(continued.workbook,source.workbook);
  assert.notEqual(continued.findings[0].id,source.findings[0].id);assert.equal(continued.findings[0].revision,0);
  assert.equal(continued.findings[0].verdict,'confirmed-static');assert.deepEqual(continued.findings[0].tracking,source.findings[0].tracking);
  assert.match(await service.exportText(continued.id,'markdown'),new RegExp(source.id));
  assert.equal(previewBackup(await service.backupText()).count,2);
});

test('continuation stale CAS and concurrent capacity failures leave source and register unchanged',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const path=`/api/assessments/${initial.id}/continue`;
  for(const expected_revision of [undefined,-1,'0',1]) await assert.rejects(service.request(path,{method:'POST',body:{expected_revision}}),error=>error.code==='CONFLICT');
  assert.equal((await store.list()).length,1);
  for(let index=0;index<98;index++) await store.add(analyze(payload({content:'print(1)'})),100);
  const source=await store.get(initial.id);
  const results=await Promise.allSettled([1,2].map(()=>service.request(path,{method:'POST',body:{expected_revision:0}})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await store.list()).length,100);assert.deepEqual(await store.get(initial.id),source);
});

test('analyst delivery is bounded, redacted, revision-guarded and carried by reports, snapshots and continuation',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  const initial=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  assert.deepEqual(initial.delivery,{executive_summary:'',business_impact:'',recommendations:''});
  const delivery={executive_summary:'Reviewed a scoped access-control candidate.',business_impact:'Potential access to a synthetic customer record.',recommendations:'Validate ownership checks, then add regression coverage.'};
  const path=`/api/assessments/${initial.id}/delivery`;
  for(const invalid of [{...delivery,html:'<script>bad</script>'},{...delivery,business_impact:null},{...delivery,recommendations:'X'.repeat(4001)}]) {
    await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,delivery:invalid}}));
    assert.deepEqual(await store.get(initial.id),initial);
  }
  const current=(await service.request(path,{method:'PATCH',body:{expected_revision:0,delivery}})).assessment;
  assert.equal(current.revision,1);assert.deepEqual(current.delivery,delivery);
  await assert.rejects(service.request(path,{method:'PATCH',body:{expected_revision:0,delivery}}),error=>error.code==='CONFLICT');
  const report=await service.exportText(initial.id,'markdown');assert.match(report,/synthetic customer record/);assert.match(report,/regression coverage/);
  const snapshot=await service.createSnapshot(initial.id,1);assert.deepEqual(snapshot.snapshot.data.delivery,delivery);
  const continued=(await service.request(`/api/assessments/${initial.id}/continue`,{method:'POST',body:{expected_revision:2}})).assessment;
  assert.deepEqual(continued.delivery,delivery);
  const redacted=(await service.request(`/api/assessments/${continued.id}/delivery`,{method:'PATCH',body:{expected_revision:0,delivery:{...delivery,business_impact:'password="Synthetic secret value"'}}})).assessment;
  assert.doesNotMatch(JSON.stringify(redacted),/Synthetic secret value/);
  assert.equal(previewBackup(await service.backupText()).count,2);
});

test('workspace status reports approximate local bytes and treats estimate or metadata failures as unavailable',async()=>{
  const store=new MemoryStore(),service=new LocalService(store);
  assert.deepEqual(await service.workspaceStatus(),{count:0,approximate_bytes:0,usage:null,quota:null});
  const record=(await service.request('/api/assessments',{method:'POST',body:payload()})).assessment;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{estimate:async()=>({usage:12345,quota:98765})}}});
    const result=await service.workspaceStatus();
    assert.equal(result.count,1);assert.equal(result.approximate_bytes,Buffer.byteLength(JSON.stringify(record)));
    assert.equal(result.usage,12345);assert.equal(result.quota,98765);
    globalThis.navigator.storage.estimate=async()=>{throw new Error('Privacy mode denial');};
    const denied=await service.workspaceStatus();assert.equal(denied.count,1);assert.equal(denied.usage,null);assert.equal(denied.quota,null);
    const broken=new LocalService({list:async()=>{throw new Error('Metadata unavailable');}});
    assert.deepEqual(await broken.workspaceStatus(),{count:null,approximate_bytes:null,usage:null,quota:null});
  } finally {
    if(descriptor) Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;
  }
});

test('malformed optional engagement fields reject atomically and missing fields stay absent in historical hashes',async()=>{
  const store=new MemoryStore(),service=new LocalService(store),record=analyze(payload());
  const envelope=row=>JSON.stringify({format:'napolean-cyber-command',version:2,records:[row]});
  for(const mutate of [row=>row.workbook[0].role='admin',row=>row.workbook[0].status='complete',
    row=>row.workbook.push({...row.workbook[0]}),row=>row.delivery={html:'<script>bad</script>'},
    row=>row.continuation={parent_id:row.id,parent_revision:0},row=>row.continuation={parent_id:'a'.repeat(32),parent_revision:-1},
    row=>row.continuation={parent_id:'invalid',parent_revision:0}]) {
    const invalid=structuredClone(record);mutate(invalid);
    await assert.rejects(service.restoreBackup(envelope(invalid)));
    assert.equal((await store.list()).length,0);
  }
  const legacy=structuredClone(record);delete legacy.workbook;delete legacy.delivery;
  await service.restoreBackup(envelope(legacy));
  const live=(await service.request('/api/assessments/'+(await store.list())[0].id)).assessment;
  assert.equal(live.workbook.length,live.roles.length);assert.deepEqual(live.delivery,{executive_summary:'',business_impact:'',recommendations:''});
});
