/* Browser-only analysis and result storage. No submission leaves this module. */
(function (root, factory) {
  'use strict';
  const playbooks = typeof module === 'object' && module.exports ? require('./playbooks.js') : root.CyberPlaybooks;
  const api = factory(root, playbooks);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CyberLocal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, playbooks) {
  'use strict';
  const ROLES = ['red', 'blue', 'white', 'black', 'purple'];
  const VERDICTS = ['unresolved', 'confirmed-static', 'confirmed-runtime', 'rejected'];
  const MAX_RECORDS = 100, MAX_ACTIVITY = 200;
  const REVIEW_FIELDS = ['reviewer','reference','prerequisites','mitigations','method'];
  const TRACKING_FIELDS = ['owner','due_date','status','retest'];
  const TRACKING_STATUSES = ['open','in-progress','resolved','retest'];
  const now = () => new Date().toISOString();
  function revision(value=0) {
    if(!Number.isSafeInteger(value)||value<0) throw new Error('Invalid record revision.');
    return value;
  }
  function advanceRevision(value) {
    const current=revision(value);
    if(current===Number.MAX_SAFE_INTEGER) throw new Error('Revision limit reached. Export this record and start a new assessment.');
    return current+1;
  }
  function conflict(message='This finding changed in another view. Reload the latest record before saving again.') {
    const error=new Error(message);error.code='CONFLICT';return error;
  }
  function normalizeRecord(record) {
    return {...record,client:record.client||'Unassigned',revision:revision(record.revision),snapshots:record.snapshots||[],workbook:workbookData(record.workbook,record.roles),delivery:deliveryData(record.delivery),
      findings:record.findings.map(item=>({...item,revision:revision(item.revision),origin:item.origin||'heuristic',review:reviewData(item.review),tracking:trackingData(item.tracking)}))};
  }
  function id() {
    if (!root.crypto || !root.crypto.getRandomValues) throw new Error('Secure browser randomness is unavailable; use HTTPS or localhost.');
    return Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function text(value, label, maximum, minimum = 1) {
    if (typeof value !== 'string' || value.length > maximum || value.trim().length < minimum || /[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]/u.test(value)) {
      throw new Error(`${label} must contain ${minimum}–${maximum} valid characters.`);
    }
    return value.trim();
  }
  function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A JSON object is required.');
    return value;
  }
  function checkedObject(value, allowed, label) {
    object(value);
    if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`);
    return value;
  }
  function clean(value,label,maximum,minimum=0) {
    const result=redact(text(value,label,maximum,minimum));
    if(result.length>maximum) throw new Error(`${label} exceeds its ${maximum}-character limit after redaction. Shorten the text.`);
    return result;
  }
  function clientLabel(value) { return value === undefined || (typeof value==='string' && !value.trim()) ? 'Unassigned' : clean(value,'Client',120,1); }
  function reviewData(value={}, previous={}) {
    checkedObject(value,REVIEW_FIELDS,'Review');
    return Object.fromEntries(REVIEW_FIELDS.map(key=>[key,clean(value[key] ?? previous[key] ?? '',`Review ${key}`,key==='reviewer'?120:2000)]));
  }
  function hasReview(review) {
    return REVIEW_FIELDS.every(key=>review[key].trim().length>0) && review.method.trim().length>=20 && (review.method.match(/[\p{L}\p{N}]/gu)||[]).length>=10;
  }
  function dueDate(value) {
    if (value === '') return '';
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Due date must be a valid ISO date (YYYY-MM-DD).');
    return value;
  }
  function trackingData(value={}, previous={}) {
    checkedObject(value,TRACKING_FIELDS,'Tracking');
    const status=value.status ?? previous.status ?? 'open';
    if(!TRACKING_STATUSES.includes(status)) throw new Error('Unsupported remediation status.');
    return {owner:clean(value.owner ?? previous.owner ?? '', 'Remediation owner',2000),
      due_date:dueDate(value.due_date ?? previous.due_date ?? ''),status,
      retest:clean(value.retest ?? previous.retest ?? '', 'Retest note',2000)};
  }
  function workbookEntry(value,roles) {
    checkedObject(value,['role','owner','status','evidence','expected','observed','decision'],'Workbook entry');
    if(!roles.includes(value.role)) throw new Error('Workbook role must be selected for this assessment.');
    const status=value.status===undefined?'planned':value.status;
    if(!['planned','in-progress','complete'].includes(status)) throw new Error('Unsupported workbook status.');
    const entry={role:value.role,owner:clean(value.owner===undefined?'':value.owner,'Workbook owner',120),status};
    for(const field of ['evidence','expected','observed','decision']) entry[field]=clean(value[field]===undefined?'':value[field],`Workbook ${field}`,2000);
    if(status==='complete'&&['evidence','observed','decision'].some(field=>!entry[field])) throw new Error('A complete workbook entry requires evidence, an observed result and a review decision.');
    return entry;
  }
  function workbookData(value,roles) {
    if(value===undefined) return roles.map(role=>workbookEntry({role},roles));
    const entries=list(value,'Workbook',5,1).map(entry=>workbookEntry(entry,roles));
    if(entries.length!==roles.length||new Set(entries.map(entry=>entry.role)).size!==roles.length) throw new Error('Workbook must contain exactly one entry per selected role.');
    return roles.map(role=>entries.find(entry=>entry.role===role));
  }
  function expectedAssessmentRevision(value) {
    if(!Number.isSafeInteger(value)||value<0) throw conflict('An exact assessment revision is required. Reload the latest assessment before saving.');
    return value;
  }
  function continuationData(value) {
    checkedObject(value,['parent_id','parent_revision'],'Continuation provenance');
    if(!Object.hasOwn(value,'parent_revision')) throw new Error('Continuation parent revision is required.');
    return {parent_id:recordId(value.parent_id),parent_revision:revision(value.parent_revision)};
  }
  function deliveryData(value={}) {
    const fields=['executive_summary','business_impact','recommendations'];
    checkedObject(value,fields,'Analyst delivery');
    return Object.fromEntries(fields.map(field=>[field,clean(value[field]===undefined?'':value[field],`Delivery ${field}`,4000)]));
  }
  function redact(value) {
    return String(value)
      .replace(/(\b[\w.-]*(?:secret|password|passwd|token|api_?key|access_?key|private_?key)[\w.-]*\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n]+)/gi, '$1[REDACTED]')
      .replace(/(\b(?:authorization\s*:\s*)?bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
      .replace(/\b(?:hf_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]');
  }
  function finding(title, severity, location, rootCause, evidence, remediation, prerequisites) {
    return {id:id(), title, severity, confidence:'low', verdict:'unresolved', location,revision:0,origin:'heuristic',
      root_cause:rootCause, input_to_impact:'Analyst must trace input control, reachability and business impact.',
      prerequisites, mitigations:'Not evaluated. Inspect validation, authorization, isolation and compensating controls.',
      evidence, remediation, review_note:'',review:reviewData(),tracking:trackingData()};
  }
  function maskPython(content) {
    const chars=content.split(''),strings=[];
    const hide=(start,end)=>{for(let cursor=start;cursor<end;cursor++) if(chars[cursor]!=='\n'&&chars[cursor]!=='\r') chars[cursor]=' ';};
    let index=0;
    while(index<content.length) {
      if(content[index]==='#') {
        const end=content.indexOf('\n',index);const stop=end<0?content.length:end;hide(index,stop);index=stop;continue;
      }
      if(content[index]==='\\'&&content[index+1]==='\n'){chars[index]=' ';index+=2;continue;}
      if(content[index]!=="'"&&content[index]!=='"'){index++;continue;}
      const start=index,quote=content[index],width=content.slice(index,index+3)===quote.repeat(3)?3:1;
      index+=width;const valueStart=index;let closed=false,valueEnd=content.length;
      while(index<content.length) {
        if(content[index]==='\\'){index=Math.min(index+2,content.length);continue;}
        if(content.slice(index,index+width)===quote.repeat(width)){valueEnd=index;index+=width;closed=true;break;}
        index++;
      }
      if(closed) strings.push({start,valueLength:valueEnd-valueStart});
      hide(start,index);
    }
    return {masked:chars.join(''),strings};
  }
  function shellArgument(masked,opening) {
    const limit=Math.min(masked.length,opening+8193);let depth=1,end=-1;
    for(let index=opening+1;index<limit;index++) {
      if(masked[index]==='(') depth++;
      if(masked[index]===')'&&--depth===0){end=index;break;}
    }
    if(end<0) return false;
    const stack=[];let start=opening+1;
    for(let index=start;index<=end;index++) {
      const char=masked[index];
      if(index===end||(char===','&&!stack.length)) {
        if(/^\s*shell\s*=\s*True\s*$/.test(masked.slice(start,index))) return true;
        start=index+1;continue;
      }
      if('([{'.includes(char)) stack.push(char);
      else if(')]}'.includes(char)) stack.pop();
    }
    return false;
  }
  function codeCandidates(content) {
    const findings=[],{masked,strings}=maskPython(content);
    const modules=new Set(['subprocess']),functions=new Set();
    const shellFunctions=new Set(['run','call','Popen','check_call','check_output']);
    for(const imported of masked.matchAll(/^\s*import\s+([^\n;]+)/gm)) {
      for(const part of imported[1].split(',')) {
        const alias=/^\s*subprocess(?:\s+as\s+([A-Za-z_]\w*))?\s*$/.exec(part);
        if(alias) modules.add(alias[1]||'subprocess');
      }
    }
    for(const imported of masked.matchAll(/^\s*from\s+subprocess\s+import\s+(\([\s\S]*?\)|[^\n;]+)/gm)) {
      for(const part of imported[1].replace(/[()]/g,'').split(',')) {
        const alias=/^\s*([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/.exec(part);
        if(alias&&shellFunctions.has(alias[1])) functions.add(alias[2]||alias[1]);
      }
    }
    const location=index=>`Submitted snippet line ${content.slice(0,index).split('\n').length}`;
    let inspected=0;
    const calls=/\b([A-Za-z_]\w*)(?:\s*\.\s*([A-Za-z_]\w*))?\s*\(/g;
    for(const call of masked.matchAll(calls)) {
      if(++inspected>500||findings.length>=100) break;
      const start=call.index,first=call[1],member=call[2];
      if(start>0&&/[\w.]/.test(masked[start-1])) continue;
      const linePrefix=masked.slice(masked.lastIndexOf('\n',start-1)+1,start);
      if(/\b(?:def|class)\s*$/.test(linePrefix)) continue;
      if(!member&&(first==='eval'||first==='exec')) findings.push(finding('Possible dynamic Python evaluation','high',location(start),
        'A direct eval/exec call-like pattern was observed after comment/string masking.',
        'Lexical pattern matched; arguments and source text omitted.',
        'Trace input reachability and builtin shadowing; replace dynamic evaluation with explicit parsing.',
        'No syntax, scope, taint or reachability proof. Shadowed names or invalid code can produce false positives.'));
      const subprocessCall=(member&&modules.has(first)&&shellFunctions.has(member))||(!member&&functions.has(first));
      if(subprocessCall&&shellArgument(masked,call.index+call[0].length-1)&&findings.length<100) findings.push(finding('Possible shell-enabled process invocation','high',location(start),
        'A direct or simply imported subprocess call-like pattern has a literal top-level shell=True argument.',
        'Bounded multiline lexical pattern matched; command and source text omitted.',
        'Verify the imported binding and input reachability; prefer shell=False with an explicit argument list.',
        'Simple imports only; no scope, rebinding, dataflow or exploit validation.'));
    }
    for(const literal of strings) {
      if(findings.length>=100) break;
      if(literal.valueLength<8) continue;
      const prefix=masked.slice(masked.lastIndexOf('\n',literal.start-1)+1,literal.start);
      const assignment=/^\s*([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*[rRuUbBfF]{0,2}\s*$/.exec(prefix);
      if(assignment&&/(?:secret|password|passwd|token|api_?key|access_?key|private_?key)/i.test(assignment[1])) findings.push(finding('Possible embedded credential','medium',location(literal.start),
        'A secret-like direct assignment has a quoted string value.',
        'Possible credential assignment. Variable name and literal [REDACTED].',
        'Verify whether this is an active credential; if so revoke it and use a secret store.',
        'Value may be a placeholder or dynamic string; validity and exposure are unverified.'));
    }
    return {findings,coverage:[
      'Limited lexical regex/pattern nomination: quoted strings/comments masked for call detection, direct eval/exec, simple subprocess import aliases and bounded multiline literal shell=True arguments.',
      'No Python AST or syntax parser, scope/rebinding resolution, taint/dataflow, dependency audit, execution or exploit validation. Wildcard/dynamic imports, f-string expressions, complex assignments and computed shell flags may be missed.',
      'Maximum 500 call-like constructs, 8192 characters per subprocess call and 100 candidates. No matches do not establish security; manual review is required.'
    ]};
  }
  function alertCandidates(content) {
    let events;
    try { events = JSON.parse(content); } catch (_) { throw new Error('Alerts must be a valid JSON array.'); }
    if (!Array.isArray(events) || events.length > 500) throw new Error('Alerts must be an array of at most 500 objects.');
    const counts = new Map();
    let skipped = 0, privileges = 0, malware = 0, unattributed = 0, partial = 0;
    for (const event of events) {
      object(event);
      if (Object.keys(event).some(key => !['event','actor','source_ip'].includes(key))) throw new Error('Alert objects accept only event, actor and source_ip fields.');
      text(event.event, 'Alert event', 100);
      for (const key of ['actor','source_ip']) if (Object.hasOwn(event,key)) text(event[key], `Alert ${key}`, 200);
      if (event.event === 'login_failed') {
        const hasActor=Object.hasOwn(event,'actor'),hasSource=Object.hasOwn(event,'source_ip');
        if(!hasActor&&!hasSource){unattributed++;continue;}
        if(!hasActor||!hasSource) partial++;
        const group = JSON.stringify([event.actor ?? null, event.source_ip ?? null]);
        counts.set(group, (counts.get(group) || 0) + 1);
      } else if (event.event === 'privilege_change') privileges++;
      else if (event.event === 'malware_detected') malware++;
      else skipped++;
    }
    const findings = [];
    for (const count of counts.values()) if (count >= 5) findings.push(finding('Repeated failed logins', 'medium', 'Submitted alert batch',
      'At least five login_failed events share their provided actor/source identifiers in this batch; missing identifiers are not inferred.',
      `${count} matching failures; raw actor/source values omitted.`,
      'Check event timestamps, duplicates, account ownership, MFA and successful login correlations.',
      'Batch may contain duplicates or unrelated periods; event authenticity is unverified.'));
    for (const [count,label,title,severity] of [[privileges,'privilege_change','Privilege change requires review','medium'],[malware,'malware_detected','Malware alert requires validation','high']]) {
      if (count) findings.push(finding(title,severity,'Submitted alert batch','A supplied event label requires human security triage.',
        `${count} ${label} event(s); raw logs and identity values omitted.`,
        'Corroborate original sensor evidence, establish context and follow the approved incident response runbook.',
        'Event labels are untrusted reports; approval and actual compromise are unverified.'));
    }
    const omitted=Math.max(0,findings.length-100);
    findings.sort((a,b)=>(a.severity==='high'?0:1)-(b.severity==='high'?0:1));
    return {findings:findings.slice(0,100),coverage:[
      'Limited batch correlation of login_failed, privilege_change and malware_detected labels.',
      `${skipped} event(s) skipped because their labels are unsupported by these local rules.`,
      `${unattributed} unattributed login_failed event(s) omitted from correlation because both actor and source identifiers are missing.`,
      `${partial} login_failed event(s) have only one identifier; grouping does not establish a shared identity or source beyond the supplied field.`,
      `${omitted} candidate(s) omitted beyond the 100-finding limit; high-severity event candidates are prioritized.`,
      'No live telemetry, event authenticity, timestamp checks, deduplication or malware analysis. Raw logs and actor/source identifiers are discarded.'
    ]};
  }
  function routeScenario(content) {
    const lower = content.toLowerCase();
    for (const [category, details] of Object.entries(playbooks.scenarios)) {
      if (details.keywords.some(word => new RegExp('\\b'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\w*\\b','i').test(lower))) return category;
    }
    return 'generic';
  }
  function analyze(payload) {
    object(payload);
    const name = text(payload.name,'Name',120), scope = text(payload.scope,'Scope',2000), content = text(payload.content,'Content',64000);
    const workflow = payload.workflow, roles = payload.roles;
    if (!['code','alerts','exercise'].includes(workflow)) throw new Error('Choose code, alerts or exercise.');
    if (payload.authorization !== true) throw new Error('Explicit scope authorization is required.');
    if (!Array.isArray(roles) || !roles.length || roles.length > 5 || roles.some(role => !ROLES.includes(role)) || new Set(roles).size !== roles.length) throw new Error('Choose one to five distinct supported roles.');
    let findings,coverage,category = null;
    if (workflow === 'code') ({findings,coverage} = codeCandidates(content));
    else if (workflow === 'alerts') ({findings,coverage} = alertCandidates(content));
    else {
      category = routeScenario(content); findings = [];
      coverage = [`Tabletop keyword routing selected category: ${category}. Only this category is retained; scenario prose is discarded.`,
        'First matching keyword category wins: ransomware, supply-chain, identity/phishing, cloud; otherwise generic. No semantic/model analysis.',
        'No vulnerability findings, live tests or control validation are produced.'];
    }
    const missions = roles.map(role => {
      const [title,objective,baseSteps,baseDeliverable] = playbooks.roles[role];
      let steps = [...baseSteps], deliverable = baseDeliverable;
      if (workflow === 'exercise') { const [step,output] = playbooks.scenarios[category][role]; steps.unshift(step); deliverable=output; }
      else if (workflow === 'code') steps.unshift(`Review the ${findings.length} unresolved ledger candidate(s), inspect source in your controlled system and trace input reachability.`);
      else steps.unshift('Corroborate the alert ledger against original sensor records; establish timestamps, duplicates, actor ownership and approvals.');
      return {role,title,objective:`${objective} Workflow: ${workflow}.`,steps,deliverable,
        limitations:['Planning guidance only; requires a qualified analyst and separate approval for live actions.',
          'No executable agents, scanners, model inference or upstream security tools are running.']};
    });
    return {id:id(),name:clean(name,'Name',120,1),client:clientLabel(payload.client),workflow,scope:clean(scope,'Scope',2000,1),created_at:now(),revision:0,snapshots:[],workbook:workbookData(undefined,roles),delivery:deliveryData(),roles:[...roles],findings,missions,
      scenario_category:category,summary:`${findings.length} unresolved candidate(s) from limited browser-local checks. Human validation required; this is not a security certification.`,
      coverage,activity:[{at:now(),action:'created',note:'Scope authorization attested; bounded local analysis completed. Raw submission discarded.'}]};
  }
  function summarize(assessment) {
    const result={unresolved:0,confirmed_static:0,confirmed_runtime:0,rejected:0,open_remediation:0};
    for(const item of assessment.findings) {
      const key=item.verdict.replaceAll('-','_');
      if(Object.hasOwn(result,key)) result[key]++;
      if(['confirmed-static','confirmed-runtime'].includes(item.verdict)&&item.tracking?.status!=='resolved') result.open_remediation++;
    }
    return result;
  }
  function markdownExport(assessment) {
    function safe(value) {
      return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/[\\`*_{}\[\]()#+.!|>~-]/g,'\\$&').replace(/[\r\n]/g,' ');
    }
    const totals=summarize(assessment);
    const lines = ['# Napolean Cyber Command assessment','',`Name: ${safe(assessment.name)}`,`Scope: ${safe(assessment.scope)}`,
      `Client: ${safe(assessment.client || 'Unassigned')}`,`Workflow: ${assessment.workflow}`,`Created: ${safe(assessment.created_at)}`,
      '','## Executive summary',safe(assessment.summary),
      ...VERDICTS.map(verdict=>`${verdict}: ${totals[verdict.replaceAll('-','_')]}`),
      `High-severity candidates: ${assessment.findings.filter(item=>item.severity==='high').length}`,
      `Open remediation items: ${totals.open_remediation}`,
      'Confirmations are analyst attestations, not automated proof. Client labels organize this browser; they do not isolate tenants.',
      '','## Evidence ledger'];
    if(Object.hasOwn(assessment,'delivery')) {
      const delivery=deliveryData(assessment.delivery);
      lines.splice(lines.indexOf('## Evidence ledger'),0,'## Analyst delivery',
        `Executive summary: ${safe(delivery.executive_summary||'(not supplied)')}`,
        `Business impact: ${safe(delivery.business_impact||'(not supplied)')}`,
        `Prioritized recommendations: ${safe(delivery.recommendations||'(not supplied)')}`,'');
    }
    for (const item of assessment.findings) {
      lines.push('',`### ${safe(item.title)}`);
      for (const key of ['severity','confidence','verdict','location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation','review_note']) lines.push(`${key.replaceAll('_',' ')}: ${safe(item[key])}`);
      const review=reviewData(item.review),tracking=trackingData(item.tracking);
      for(const key of REVIEW_FIELDS) lines.push(`Review ${key}: ${safe(review[key] || '(not supplied)')}`);
      for(const key of TRACKING_FIELDS) lines.push(`Tracking ${key}: ${safe(tracking[key] || '(not supplied)')}`);
      if(item.verdict.startsWith('confirmed-') && !hasReview(review)) lines.push('Legacy attestation: structured evidence is incomplete; this verdict requires renewed review.');
    }
    lines.push('','## Missions');
    for (const mission of assessment.missions) {
      lines.push('',`### ${mission.role}: ${safe(mission.title)}`,safe(mission.objective),...mission.steps.map(step=>'- '+safe(step)),
        'Deliverable: '+safe(mission.deliverable),...mission.limitations.map(limit=>'Limitation: '+safe(limit)));
    }
    if(Object.hasOwn(assessment,'workbook')) {
      lines.push('','## Role workbook');
      for(const entry of workbookData(assessment.workbook,assessment.roles)) {
        lines.push('',`### ${entry.role}`);
        for(const field of ['owner','status','evidence','expected','observed','decision']) lines.push(`${field}: ${safe(entry[field]||'(not supplied)')}`);
      }
    }
    if(assessment.continuation) lines.push('','## Continuation provenance',
      `Parent assessment: ${assessment.continuation.parent_id}`,`Parent revision: ${assessment.continuation.parent_revision}`,
      'This is copied provenance, not an access-control or authenticity guarantee.');
    lines.push('','## Coverage',...assessment.coverage.map(item=>'- '+safe(item)),'','## Activity',
      ...assessment.activity.map(item=>`- ${safe(item.at)} ${safe(item.action)}: ${safe(item.note)}`));
    return lines.join('\n')+'\n';
  }

  function parseBackup(input) {
    if(typeof input!=='string' || input.length>5*1024*1024 || new TextEncoder().encode(input).length>5*1024*1024) throw new Error('Backup must be text no larger than 5 MB.');
    let parsed;
    try {parsed=JSON.parse(input);}catch(_){throw new Error('Backup is not valid JSON.');}
    object(parsed);
    let records;
    if(Object.hasOwn(parsed,'format')) {
      checkedObject(parsed,['format','version','records'],'Backup');
      if(parsed.format!=='napolean-cyber-command' || ![1,2].includes(parsed.version) || !Array.isArray(parsed.records)) throw new Error('Unsupported backup format or version.');
      records=parsed.records;
    } else records=[parsed];
    if(records.length>MAX_RECORDS) throw new Error('Backup exceeds the 100 assessment limit.');
    return records.map(row=>validateRecord(row));
  }
  function list(value,label,maximum,minimum=0) {
    if(!Array.isArray(value) || value.length<minimum || value.length>maximum) throw new Error(`${label} must contain ${minimum}–${maximum} entries.`);
    return value;
  }
  function isoTime(value) {
    if(typeof value!=='string' || value.length>40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid assessment/activity timestamp.');
    dueDate(value.slice(0,10));
    return value;
  }
  function recordId(value) {
    if(typeof value!=='string' || !/^[a-f0-9]{32}$/.test(value)) throw new Error('Invalid record identifier.');
    return value;
  }
  function validateRecord(value,options={}) {
    const fields=['id','name','client','workflow','scope','created_at','revision','roles','findings','missions','scenario_category','summary','coverage','activity','workbook','delivery','continuation'];
    if(options.allowSnapshots!==false) fields.push('snapshots');
    checkedObject(value,fields,'Assessment');
    if(!['code','alerts','exercise'].includes(value.workflow)) throw new Error('Unsupported workflow in backup.');
    const roles=list(value.roles,'Roles',5,1).map(role=>{
      if(!ROLES.includes(role)) throw new Error('Unsupported role in backup.');return role;
    });
    if(new Set(roles).size!==roles.length) throw new Error('Duplicate roles in backup.');
    const findings=list(value.findings,'Findings',100).map(item=>{
      checkedObject(item,['id','title','severity','confidence','verdict','location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation','review_note','review','tracking','revision','origin'],'Finding');
      if(!['high','medium','low'].includes(item.severity) || !['low','medium'].includes(item.confidence) || !VERDICTS.includes(item.verdict)) throw new Error('Unsupported finding enum in backup.');
      if(item.origin!==undefined&&!['heuristic','manual'].includes(item.origin)) throw new Error('Unsupported finding origin.');
      const result={id:recordId(item.id),severity:item.severity,confidence:item.confidence,verdict:item.verdict,revision:revision(item.revision),origin:item.origin||'heuristic'};
      for(const key of ['title','location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation','review_note']) result[key]=clean(item[key],`Finding ${key}`,key==='title'?500:4000,key==='review_note'?0:1);
      result.review=reviewData(item.review);
      result.tracking=trackingData(item.tracking);
      if(result.verdict.startsWith('confirmed-') && (!hasReview(result.review)||result.review_note.trim().length<20)) {
        if(options.snapshotData) throw new Error('Snapshot confirmations require complete structured evidence and a substantive decision note (20+ characters). Review legacy attestations before freezing this report.');
        result.verdict='unresolved';
      }
      return result;
    });
    if(new Set(findings.map(row=>row.id)).size!==findings.length) throw new Error('Duplicate finding IDs in backup.');
    const missions=list(value.missions,'Missions',5,1).map(item=>{
      checkedObject(item,['role','title','objective','steps','deliverable','limitations'],'Mission');
      if(!roles.includes(item.role)) throw new Error('Mission role is outside the selected roles.');
      return {role:item.role,title:clean(item.title,'Mission title',500,1),objective:clean(item.objective,'Mission objective',4000,1),
        steps:list(item.steps,'Mission steps',20,1).map(row=>clean(row,'Mission step',4000,1)),
        deliverable:clean(item.deliverable,'Mission deliverable',4000,1),
        limitations:list(item.limitations,'Mission limitations',20,1).map(row=>clean(row,'Mission limitation',4000,1))};
    });
    if(missions.length!==roles.length || new Set(missions.map(row=>row.role)).size!==roles.length) throw new Error('Backup missions must cover exactly the selected roles.');
    const category=value.scenario_category ?? null;
    if(value.workflow==='exercise' ? !Object.hasOwn(playbooks.scenarios,category) : category!==null) throw new Error('Invalid scenario category in backup.');
    const activity=list(value.activity,'Activity',MAX_ACTIVITY,1).map(item=>{
      checkedObject(item,['at','action','note'],'Activity');
      return {at:isoTime(item.at),action:clean(item.action,'Activity action',80,1),note:clean(item.note,'Activity note',8000,1)};
    });
    const result={id:recordId(value.id),name:clean(value.name,'Name',120,1),client:clientLabel(value.client),workflow:value.workflow,
      scope:clean(value.scope,'Scope',2000,1),created_at:isoTime(value.created_at),revision:revision(value.revision),roles,findings,missions,scenario_category:category,
      summary:clean(value.summary,'Summary',4000,1),coverage:list(value.coverage,'Coverage',20,1).map(row=>clean(row,'Coverage note',4000,1)),activity};
    if(Object.hasOwn(value,'workbook')) result.workbook=workbookData(value.workbook,roles);
    if(Object.hasOwn(value,'delivery')) result.delivery=deliveryData(value.delivery);
    if(Object.hasOwn(value,'continuation')) {
      result.continuation=continuationData(value.continuation);
      if(result.continuation.parent_id===result.id) throw new Error('A continuation cannot be its own parent.');
    }
    if(options.allowSnapshots!==false) {
      result.snapshots=list(value.snapshots===undefined?[]:value.snapshots,'Snapshots',3).map((snapshot,index)=>{
        const checked=validateSnapshot(snapshot);
        if(checked.version!==index+1) throw new Error('Snapshot versions must form the sequence 1, 2, 3.');
        return checked;
      });
      if(new Set(result.snapshots.map(row=>row.id)).size!==result.snapshots.length) throw new Error('Duplicate snapshot IDs.');
    }
    return result;
  }
  function validateSnapshot(value) {
    checkedObject(value,['id','version','created_at','source_revision','sha256','data'],'Snapshot');
    if(!Number.isSafeInteger(value.version)||value.version<1||value.version>3) throw new Error('Unsupported report snapshot version.');
    if(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error('Invalid snapshot SHA-256 digest.');
    if(!Object.hasOwn(value,'source_revision')||!Number.isSafeInteger(value.source_revision)||value.source_revision<0) throw new Error('Snapshot source revision is required.');
    if(!Object.hasOwn(object(value.data),'revision')) throw new Error('Captured report revision is required.');
    const data=validateRecord(value.data,{allowSnapshots:false,snapshotData:true});
    const source=revision(value.source_revision);
    if(data.revision!==source) throw new Error('Snapshot source revision does not match its captured report.');
    return {id:recordId(value.id),version:value.version,created_at:isoTime(value.created_at),source_revision:source,sha256:value.sha256,data};
  }
  async function hashData(data) {
    if(!root.crypto?.subtle) throw new Error('Report snapshots require secure browser SHA-256 support. Use HTTPS or localhost.');
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function verifySnapshots(records) {
    for(const record of records) for(const snapshot of record.snapshots||[]) {
      if(await hashData(snapshot.data)!==snapshot.sha256) throw new Error('Snapshot SHA-256 integrity check failed. Nothing was restored.');
    }
  }
  function recordBackupBytes(record) {
    const envelope={format:'napolean-cyber-command',version:2,records:[record]};
    return new TextEncoder().encode(JSON.stringify(envelope,null,2)).length;
  }
  function assertRecordSize(record) {
    if(recordBackupBytes(record)>5*1024*1024) throw new Error('This change would exceed the 5 MB restorable report limit. Export the current report and start a new assessment. Nothing was saved.');
  }
  function previewBackup(input) {
    const records=parseBackup(input);
    return {count:records.length,clients:[...new Set(records.map(row=>row.client))].sort()};
  }

  class IndexedDBStore {
    constructor(indexedDB = root.indexedDB) { this.indexedDB = indexedDB; this.opening = null; }
    open() {
      if (!this.indexedDB) return Promise.reject(new Error('Browser IndexedDB storage is unavailable. Results cannot be saved.'));
      if (!this.opening) this.opening = new Promise((resolve,reject) => {
        let request;
        try { request = this.indexedDB.open('napolean-cyber-command-local',1); }
        catch (_) { reject(new Error('Browser storage could not be opened. Check browser privacy settings.')); return; }
        let blocked = false;
        request.onupgradeneeded = () => request.result.createObjectStore('assessments',{keyPath:'id'});
        request.onerror = () => reject(new Error('Browser storage could not be opened. Check privacy settings or storage quota.'));
        request.onblocked = () => { blocked=true; reject(new Error('Browser storage upgrade is blocked. Close other workspace tabs and reload.')); };
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); this.opening=null; };
          resolve(db);
        };
      }).catch(error => { this.opening=null; throw error; });
      return this.opening;
    }
    async transaction(mode, operation) {
      const db = await this.open();
      return new Promise((resolve,reject) => {
        let tx, value, failure;
        try { tx=db.transaction('assessments',mode); }
        catch (_) { reject(new Error('Browser storage transaction could not start. Reload and retry.')); return; }
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(failure || new Error('Browser storage transaction failed. Changes were not saved; check available storage.'));
        tx.onerror = () => { /* onabort reports the final transactional failure. */ };
        try { operation(tx.objectStore('assessments'), result=>{value=result;}, error=>{failure=error;tx.abort();}); }
        catch (error) { failure=error; tx.abort(); }
      });
    }
    list() { return this.transaction('readonly',(store,done)=>{const req=store.getAll();req.onsuccess=()=>done(req.result);}); }
    get(id) { return this.transaction('readonly',(store,done)=>{const req=store.get(id);req.onsuccess=()=>done(req.result);}); }
    add(record, maximum) {
      return this.transaction('readwrite',(store,done,fail)=>{
        const req=store.count(); req.onsuccess=()=>{
          if(req.result>=maximum) { fail(new Error('Browser workspace limit: 100 assessments. Export and delete records before adding more.')); return; }
          store.add(record); done(record);
        };
      });
    }
    addMany(records,maximum) {
      return this.transaction('readwrite',(store,done,fail)=>{
        const req=store.count();req.onsuccess=()=>{
          if(req.result+records.length>maximum){fail(new Error('Browser workspace limit: 100 assessments. Export and delete records before restoring.'));return;}
          try {for(const record of records) store.add(record);done(records);}catch(error){fail(error);}
        };
      });
    }
    continueFrom(sourceId,expected,maximum,buildCopy) {
      return this.transaction('readwrite',(store,done,fail)=>{
        const source=store.get(sourceId);source.onsuccess=()=>{
          try {
            if(!source.result){fail(new Error('Assessment not found.'));return;}
            if(revision(source.result.revision)!==expected){fail(conflict('The source assessment changed. Reload before creating a continuation.'));return;}
            const count=store.count();count.onsuccess=()=>{
              try {
                if(count.result>=maximum){fail(new Error('Browser workspace limit: 100 assessments. Export and delete records before continuing.'));return;}
                const copy=buildCopy(source.result);store.add(copy);done(copy);
              } catch(error){fail(error);}
            };
          } catch(error){fail(error);}
        };
      });
    }
    update(id, mutate) {
      return this.transaction('readwrite',(store,done,fail)=>{
        const req=store.get(id); req.onsuccess=()=>{
          if(!req.result) {fail(new Error('Assessment not found.'));return;}
          try {const result=mutate(req.result);store.put(result);done(result);} catch(error) {fail(error);}
        };
      });
    }
    delete(id) {
      return this.transaction('readwrite',(store,done,fail)=>{
        const req=store.get(id);req.onsuccess=()=>{
          if(!req.result){fail(new Error('Assessment not found.'));return;}
          store.delete(id);done({ok:true});
        };
      });
    }
  }
  class LocalService {
    constructor(store) { this.store=store; }
    async request(path, options={}) {
      const method=(options.method || 'GET').toUpperCase();
      const route=String(path).split('?')[0];
      let payload=options.body;
      if(typeof payload==='string') {
        if(payload.length>280000) throw new Error('Request is too large.');
        try{payload=JSON.parse(payload);}catch(_){throw new Error('A JSON object is required.');}
      }
      if(route==='/api/assessments') {
        if(method==='GET') {
          const records=await this.store.list();
          records.sort((a,b)=>b.created_at.localeCompare(a.created_at));
          return {assessments:records.map(a=>({id:a.id,name:a.name,client:a.client || 'Unassigned',workflow:a.workflow,scope:a.scope,created_at:a.created_at,roles:a.roles,
            finding_count:a.findings.length,unresolved_count:a.findings.filter(f=>f.verdict==='unresolved').length}))};
        }
        if(method==='POST') return {assessment:await this.store.add(analyze(payload),MAX_RECORDS)};
      }
      const manualMatch=/^\/api\/assessments\/([a-f0-9]{32})\/findings$/.exec(route);
      if(manualMatch&&method==='POST') {
        const fields=['title','severity','location','root_cause','input_to_impact','prerequisites','mitigations','evidence','remediation'];
        checkedObject(payload,fields,'Manual finding');
        if(!['high','medium','low'].includes(payload.severity)) throw new Error('Choose a supported manual finding severity.');
        const added={id:id(),severity:payload.severity,confidence:'low',verdict:'unresolved',origin:'manual',revision:0,
          review_note:'',review:reviewData(),tracking:trackingData()};
        for(const field of fields) if(field!=='severity') added[field]=clean(payload[field],`Manual ${field}`,field==='title'?500:4000,1);
        const assessment=await this.store.update(manualMatch[1],record=>{
          record=normalizeRecord(record);
          if(record.findings.length>=100) throw new Error('Assessment limit: 100 findings. Start a new assessment before adding another.');
          if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Export this record and start a new assessment.');
          record.findings.push(added);record.revision=advanceRevision(record.revision);
          record.activity.push({at:now(),action:'manual_finding_added',note:`${added.id}: ${added.title}. Analyst-entered candidate; unresolved and low confidence.`});
          record.summary=`${record.findings.length} candidate(s); ${summarize(record).unresolved} unresolved. Manual entries are analyst observations requiring validation.`;
          assertRecordSize(record);
          return record;
        });
        return {assessment};
      }
      const workbookMatch=/^\/api\/assessments\/([a-f0-9]{32})\/workbook$/.exec(route);
      if(workbookMatch&&method==='PATCH') {
        checkedObject(payload,['expected_revision','entry'],'Workbook update');
        const expected=expectedAssessmentRevision(payload.expected_revision);
        const assessment=await this.store.update(workbookMatch[1],record=>{
          record=normalizeRecord(record);
          if(record.revision!==expected) throw conflict('This assessment changed. Reload before saving its workbook.');
          if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Create a continuation before updating the workbook.');
          const entry=workbookEntry(payload.entry,record.roles);
          record.workbook=record.workbook.map(current=>current.role===entry.role?entry:current);
          record.activity.push({at:now(),action:'workbook_updated',note:`${entry.role}: ${entry.status}; owner: ${entry.owner||'(unspecified)'}; evidence: ${entry.evidence||'(not supplied)'}; observed: ${entry.observed||'(not supplied)'}; decision: ${entry.decision||'(not supplied)'}.`});
          record.revision=advanceRevision(record.revision);assertRecordSize(record);return record;
        });
        return {assessment};
      }
      const deliveryMatch=/^\/api\/assessments\/([a-f0-9]{32})\/delivery$/.exec(route);
      if(deliveryMatch&&method==='PATCH') {
        checkedObject(payload,['expected_revision','delivery'],'Delivery update');
        if(!Object.hasOwn(payload,'delivery')) throw new Error('An explicit delivery object is required.');
        const expected=expectedAssessmentRevision(payload.expected_revision),delivery=deliveryData(payload.delivery);
        const assessment=await this.store.update(deliveryMatch[1],record=>{
          record=normalizeRecord(record);
          if(record.revision!==expected) throw conflict('This assessment changed. Reload before saving its delivery notes.');
          if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Create a continuation before updating delivery notes.');
          record.delivery=delivery;record.revision=advanceRevision(record.revision);
          record.activity.push({at:now(),action:'delivery_updated',note:'Analyst executive summary, business impact and prioritized recommendations updated. Text is analyst-authored, not verified business impact.'});
          assertRecordSize(record);return record;
        });
        return {assessment};
      }
      const continueMatch=/^\/api\/assessments\/([a-f0-9]{32})\/continue$/.exec(route);
      if(continueMatch&&method==='POST') {
        checkedObject(payload,['expected_revision'],'Continuation request');
        const expected=expectedAssessmentRevision(payload.expected_revision);
        const assessment=await this.store.continueFrom(continueMatch[1],expected,MAX_RECORDS,source=>{
          const copy=validateRecord(normalizeRecord(source));
          copy.continuation={parent_id:source.id,parent_revision:revision(source.revision)};
          copy.id=id();copy.revision=0;copy.created_at=now();copy.snapshots=[];
          for(const item of copy.findings){item.id=id();item.revision=0;}
          copy.activity=[{at:now(),action:'continuation_created',note:`Continued from ${source.id} at revision ${revision(source.revision)}. Current evidence and tracking copied; original history and snapshots remain unchanged in the source. Legacy incomplete confirmations require renewed review.`}];
          copy.summary=`Continuation with ${copy.findings.length} candidate(s); ${summarize(copy).unresolved} unresolved. Copied analyst attestations require review; source history and frozen reports were not changed.`;
          assertRecordSize(copy);return copy;
        });
        return {assessment};
      }
      const match=/^\/api\/assessments\/([a-f0-9]{32})(?:\/findings\/([a-f0-9]{32}))?$/.exec(route);
      if(!match) throw new Error('Unsupported local workspace route.');
      const [,assessmentId,findingId]=match;
      if(method==='GET' && !findingId) {
        const record=await this.store.get(assessmentId);
        if(!record) throw new Error('Assessment not found.');
        return {assessment:normalizeRecord(record)};
      }
      if(method==='DELETE' && !findingId) return this.store.delete(assessmentId);
      if(method==='PATCH' && !findingId) {
        checkedObject(payload,['from','to','note'],'Role handoff');
        const from=payload.from,to=payload.to,note=clean(payload.note,'Handoff note',2000,1);
        if(!ROLES.includes(from)||!ROLES.includes(to)||from===to) throw new Error('Choose two distinct supported roles for the handoff.');
        const assessment=await this.store.update(assessmentId,record=>{
          record=normalizeRecord(record);
          if(!record.roles.includes(from)||!record.roles.includes(to)) throw new Error('Handoff roles must be selected for this assessment.');
          if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Export this record and start a new assessment.');
          record.activity.push({at:now(),action:'role_handoff',note:`${from} → ${to}: ${note}`});
          record.revision=advanceRevision(record.revision);
          assertRecordSize(record);
          return record;
        });
        return {assessment};
      }
      if(method==='PATCH' && findingId) {
        checkedObject(payload,['verdict','note','review','tracking','expected_revision'],'Finding review');
        if(!Number.isSafeInteger(payload.expected_revision)||payload.expected_revision<0) throw conflict('An exact finding revision is required. Reload the latest finding before saving.');
        if(!VERDICTS.includes(payload.verdict)) throw new Error('Unsupported finding verdict.');
        const verdict=payload.verdict,expectedRevision=payload.expected_revision,note=clean(payload.note,'Evidence note',4000,verdict==='unresolved'?1:20);
        const reviewInput=payload.review,trackingInput=payload.tracking;
        const assessment=await this.store.update(assessmentId, record=>{
          record=normalizeRecord(record);
          const target=record.findings.find(f=>f.id===findingId);
          if(!target) throw new Error('Finding not found.');
          if(target.revision!==expectedRevision) throw conflict();
          if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Export this record and start a new assessment.');
          const review=reviewData(reviewInput,target.review),tracking=trackingData(trackingInput,target.tracking);
          if(verdict.startsWith('confirmed-')&&!hasReview(review)) throw new Error('Confirmation requires reviewer, reference, prerequisites, mitigations and a substantive method (20+ characters).');
          target.verdict=verdict;target.review_note=note;target.review=review;target.tracking=tracking;
          target.revision=advanceRevision(target.revision);record.revision=advanceRevision(record.revision);
          record.activity.push({at:now(),action:'finding_reviewed',note:`${findingId}: ${verdict}. Reviewer: ${review.reviewer || '(unspecified)'}. Reference: ${review.reference || '(unspecified)'}. Analyst evidence: ${note}`});
          record.summary=`${record.findings.length} candidate(s); ${record.findings.filter(f=>f.verdict==='unresolved').length} unresolved. Verdicts reflect browser-local analyst decisions, not automated proof.`;
          assertRecordSize(record);
          return record;
        });
        return {assessment};
      }
      throw new Error('Unsupported local workspace operation.');
    }
    async exportText(assessmentId,format) {
      if(!['json','markdown'].includes(format)) throw new Error('Export format must be json or markdown.');
      const {assessment}=await this.request('/api/assessments/'+assessmentId);
      return format==='json'?JSON.stringify(assessment,null,2):markdownExport(assessment);
    }
    async backupText(client) {
      if(client!==undefined) text(client,'Client filter',120);
      const rows=await this.store.list();
      const records=rows.filter(row=>client===undefined || (row.client || 'Unassigned')===client).map(row=>validateRecord(row));
      await verifySnapshots(records);
      const result=JSON.stringify({format:'napolean-cyber-command',version:2,records},null,2);
      if(new TextEncoder().encode(result).length>5*1024*1024) throw new Error('Backup exceeds 5 MB. Export a smaller client group or individual assessment.');
      parseBackup(result);
      return result;
    }
    previewBackup(input) {return previewBackup(input);}
    async restoreBackup(input) {
      const records=parseBackup(input);
      await verifySnapshots(records);
      for(const record of records) {
        const originalSummary=record.summary,originalHistoryLength=record.activity.length;
        const replacements=new Map([[record.id,id()]]);
        record.id=replacements.get(record.id);
        for(const item of record.findings){const old=item.id;item.id=id();replacements.set(old,item.id);}
        for(const entry of record.activity) for(const [before,after] of replacements) entry.note=entry.note.replaceAll(before,after);
        if(record.activity.length<MAX_ACTIVITY) record.activity.push({at:now(),action:'restored',note:'Imported as a new browser-local copy. Legacy confirmations without complete structured evidence were set unresolved; imported evidence is an analyst attestation, not proof.'});
        record.summary=`${record.findings.length} imported candidate(s); ${record.findings.filter(f=>f.verdict==='unresolved').length} unresolved. Imported claims require analyst review. Legacy confirmations without complete structured evidence were set unresolved. Existing activity history was retained.`;
        if(recordBackupBytes(record)>5*1024*1024) {
          // A legitimate export near the limit must remain restorable. New IDs already
          // distinguish the copy; retain history/summary rather than truncate evidence.
          record.activity.length=originalHistoryLength;record.summary=originalSummary;
        }
        assertRecordSize(record);
      }
      if(records.length) await this.store.addMany(records,MAX_RECORDS);
      return {count:records.length};
    }
    async createSnapshot(assessmentId,expected_revision) {
      if(!Number.isSafeInteger(expected_revision)||expected_revision<0) throw conflict('An exact assessment revision is required. Reload before creating a snapshot.');
      const {assessment:current}=await this.request('/api/assessments/'+assessmentId);
      if(current.revision!==expected_revision) throw conflict('This assessment changed. Reload its latest revision before creating a snapshot.');
      if(current.snapshots.length>=3) throw new Error('Assessment limit: 3 snapshots. Export existing reports before starting a new assessment.');
      if(current.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries. Snapshot creation was not saved.');
      const {snapshots:excluded,...base}=current;
      const data=validateRecord(base,{allowSnapshots:false,snapshotData:true});
      const snapshot={id:id(),version:current.snapshots.length+1,created_at:now(),source_revision:data.revision,sha256:await hashData(data),data};
      const assessment=await this.store.update(assessmentId,record=>{
        record=normalizeRecord(record);
        if(record.revision!==expected_revision) throw conflict('This assessment changed while its snapshot was prepared. Reload before retrying.');
        if(record.snapshots.length>=3) throw new Error('Assessment limit: 3 snapshots.');
        if(record.activity.length>=MAX_ACTIVITY) throw new Error('Assessment limit: 200 activity entries.');
        record.snapshots=[...record.snapshots,snapshot];record.revision=advanceRevision(record.revision);
        record.activity.push({at:now(),action:'report_snapshot_created',note:`${snapshot.id}: report version ${snapshot.version}; source revision ${snapshot.source_revision}; SHA-256 ${snapshot.sha256}. Digest detects corruption, not authorship.`});
        assertRecordSize(record);
        return record;
      });
      return {assessment,snapshot};
    }
    async exportSnapshot(assessmentId,snapshotId,format) {
      if(!['json','markdown'].includes(format)) throw new Error('Snapshot export format must be json or markdown.');
      const {assessment}=await this.request('/api/assessments/'+assessmentId);
      const source=assessment.snapshots.find(row=>row.id===snapshotId);
      if(!source) throw new Error('Report snapshot not found.');
      const snapshot=validateSnapshot(source);
      await verifySnapshots([{snapshots:[snapshot]}]);
      if(format==='json') return JSON.stringify(snapshot,null,2);
      return `# Frozen report snapshot ${snapshot.version}\n\nCreated: ${snapshot.created_at}\nSource revision: ${snapshot.source_revision}\nSHA-256: ${snapshot.sha256}\nDigest detects corruption, not authentication or authorship.\n\n${markdownExport(snapshot.data)}`;
    }
    async workspaceStatus() {
      const result={count:null,approximate_bytes:null,usage:null,quota:null};
      try {
        const rows=await this.store.list();result.count=rows.length;
        result.approximate_bytes=rows.reduce((sum,record)=>sum+new TextEncoder().encode(JSON.stringify(record)).length,0);
      } catch(_) { /* Metadata is optional and never prevents normal record access. */ }
      let timer;
      try {
        if(typeof root.navigator?.storage?.estimate==='function') {
          const estimate=await Promise.race([
            Promise.resolve().then(()=>root.navigator.storage.estimate()),
            new Promise(resolve=>{timer=root.setTimeout(()=>resolve(null),500);})
          ]);
          for(const key of ['usage','quota']) if(Number.isFinite(estimate?.[key])&&estimate[key]>=0) result[key]=estimate[key];
        }
      } catch(_) { /* Browser privacy settings may deny origin usage estimates. */ }
      finally {if(timer!==undefined) root.clearTimeout(timer);}
      return result;
    }
  }
  let singleton;
  const service=()=>singleton || (singleton=new LocalService(new IndexedDBStore()));
  return {analyze,redact,markdownExport,summarize,LocalService,IndexedDBStore,previewBackup,
    request:(path,options)=>service().request(path,options),exportText:(assessmentId,format)=>service().exportText(assessmentId,format),
    backupText:client=>service().backupText(client),restoreBackup:input=>service().restoreBackup(input),
    createSnapshot:(assessmentId,expected_revision)=>service().createSnapshot(assessmentId,expected_revision),
    exportSnapshot:(assessmentId,snapshotId,format)=>service().exportSnapshot(assessmentId,snapshotId,format),
    workspaceStatus:()=>service().workspaceStatus()};
});
