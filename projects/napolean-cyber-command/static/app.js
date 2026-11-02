'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const state = {
  assessments: [], assessment: null, finding: null, tab: 'ledger', client: '', ledgerSearch: '', verdict: '', severity: '', restoreText: '', originalReview: ''
};
const roles = [ ['red', '01', 'Red hat', 'Test assumptions', 'Authorized adversary perspective.'], ['blue', '02', 'Blue hat', 'Strengthen defense', 'Triage signals and plan response.'], ['white', '03', 'White hat', 'Validate evidence', 'Review causes and remediation.'], ['black', '04', 'Black hat', 'Think like an attacker', 'Bounded threat modeling only.'], ['purple', '05', 'Purple hat', 'Close the loop', 'Connect scenarios to detection.'] ];
const workflows = {
  code: 'Code review', alerts: 'Alert triage', exercise: 'Team exercise'
};
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (cls) node.className = cls;
  return node;
}
function append(parent, ...children) {
  children.filter(Boolean).forEach(child => parent.append(child));
  return parent;
}
function button(text, fn, cls = '') {
  const node = el('button', text, cls);
  node.type = 'button';
  node.addEventListener('click', fn);
  return node;
}
function notify(message, error = false) {
  const n = $('#notice');
  n.textContent = message;
  n.className = `visible${error ? ' error' : ''}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    n.className = '';
  }, error ? 9000 : 4500);
}
async function api(path, options = {}) {
  if (!globalThis.CyberLocal || typeof CyberLocal.request !== 'function') {
    throw new Error('The local workspace could not start. Reload this page or check that its local scripts are available.');
  }
  const result = await CyberLocal.request(path, options);
  if (options.method && options.method !== 'GET') {
    const assessmentId = result.assessment?.id || path.split('/')[3];
    broadcastChange(assessmentId);
  }
  return result;
}
function formError(form, message) {
  const inline = form.querySelector('.error-inline');
  if (!inline) {
    notify(message, true);
    return;
  }
  inline.textContent = message;
  inline.hidden = false;
  inline.tabIndex = -1;
  inline.focus();
}

async function busy(form, fn) {
  const inline = form.querySelector('.error-inline');
  if (inline) {
    inline.hidden = true;
    inline.textContent = '';
  }
  const controls = [...form.querySelectorAll('button, input, select, textarea')];
  const disabledStates = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  form.setAttribute('aria-busy', 'true');
  try {
    await fn();
  }
  catch (error) {
    if (error.code === 'CONFLICT' && form.id === 'verdict-form') $('#reload-finding').hidden = false;
    if (error.code === 'CONFLICT' && form.id === 'workbook-form') $('#reload-workbook').hidden = false;
    if (error.code === 'CONFLICT' && form.id === 'delivery-form') $('#reload-delivery').hidden = false;
    if (inline && !form.closest('[hidden]') && (!form.closest('dialog') || form.closest('dialog').open)) {
      inline.textContent = error.message;
      inline.hidden = false;
      inline.tabIndex = -1;
      inline.focus();
    }
    else {
      notify(error.message, true);
    }
  }
  finally {
    controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    form.removeAttribute('aria-busy');
  }
}
function date(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value || '—') : d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}
function activate() {
  $('#nav-overview').classList.add('active');
  $('#nav-new').classList.remove('active');
}
function strip(selected) {
  const container = el('section', undefined, 'mission-strip');
  container.setAttribute('aria-label', 'Five security perspectives');
  roles.forEach(([id, num, title, , description]) => {
    const cell = el('div', undefined, 'hat');
    const meta = el('div', undefined, 'hat-number mono');
    append(meta, el('span', num), el('span', selected ? (selected.includes(id) ? 'ASSIGNED' : '—') : 'PERSPECTIVE'));
    append(cell, meta, el('h3', title), el('p', description));
    container.append(cell);
  });
  return container;
}
function heading(kicker, title, description, action) {
  const row = el('div', undefined, 'page-heading');
  const copy = el('div');
  append(copy, el('p', kicker, 'eyebrow'), el('h1', title), el('p', description, 'muted'));
  append(row, copy, action);
  return row;
}
function empty(title, text, action) {
  const box = el('div', undefined, 'empty');
  append(box, el('span', '∅', 'empty-index'), el('h2', title), el('p', text), action);
  return box;
}
function openCreate() {
  if (!allowDeliveryDiscard()) return;
  $('#nav-new').classList.add('active');
  if (state.client && !$('#client').value.trim()) $('#client').value = state.client;
  $('#create-dialog').showModal();
  $('#assessment-name').focus();
}
async function loadOverview() {
  if (!allowDeliveryDiscard()) return;
  activate();
  state.assessment = null;
  $('#view').replaceChildren(el('p', 'Opening browser storage…', 'muted'));
  try {
    state.assessments = (await api('/api/assessments')).assessments;
    renderOverview();
  }
  catch (error) {
    $('#view').replaceChildren(empty('Browser storage is unavailable', `${error.message} Enable site storage and retry. Records belong to this browser and origin; this app has no server backup.`, button('Try again', loadOverview)));
    notify(error.message, true);
  }
}
function renderOverview() {
  const view = $('#view');
  if (state.client && !state.assessments.some(a => (a.client || 'Unassigned') === state.client)) state.client = '';
  view.replaceChildren();
  append(view, heading('COMMAND CENTER / OVERVIEW', 'Your security work, in evidence.', 'Scope a review. Challenge the findings. Record the decision.', button('+ New assessment', openCreate, 'primary')), strip());
  const title = el('div', undefined, 'section-title');
  append(title, el('h2', 'Assessment register'), el('span', `${String(state.assessments.length).padStart(2, '0')} ENGAGEMENTS`, 'count'));
  view.append(title);
  const workspaceActions = el('div', undefined, 'detail-actions');
  const backupAction = button('↓ Backup all clients JSON', backupWorkspace);
  append(workspaceActions, backupAction, button('↑ Restore backup', openRestore), button('Client remediation', openClientRemediation), button('Recovery guide', openRecovery), button('Refresh register', loadOverview));
  view.append(workspaceActions);
  const statusPanel = el('section', 'Loading local storage status (100 assessment limit)…', 'workspace-status fine');
  statusPanel.id = 'workspace-status';
  statusPanel.setAttribute('aria-live', 'polite');
  view.append(statusPanel);
  renderWorkspaceStatus(statusPanel);
  if (!state.assessments.length) {
    const box = empty('Start with a defined scope.', 'Review a Python snippet, triage structured alerts, or prepare a five-perspective security exercise.', button('Create first assessment ↗', openCreate, 'primary'));
    box.append(el('small', 'No source connections or scans run automatically.'));
    view.append(box);
    return;
  }
  const toolbar = el('div', undefined, 'toolbar');
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Search assessments…';
  search.setAttribute('aria-label', 'Search assessments');
  const count = el('span', '', 'count');
  const clients = selectControl('Filter by client', [['', 'All clients'], ...[...new Set(state.assessments.map(a => a.client || 'Unassigned'))].sort().map(client => [client, client])]);
  clients.value = state.client;
  clients.addEventListener('change', () => { state.client = clients.value; draw(); });
  append(toolbar, search, clients, count);
  view.append(toolbar);
  const wrap = el('div', undefined, 'table-wrap');
  view.append(wrap);
  function draw() {
    backupAction.textContent = state.client ? `↓ Backup ${state.client} JSON` : '↓ Backup all clients JSON';
    const query = search.value.toLowerCase();
    const matches = state.assessments.filter(a => (!state.client || (a.client || 'Unassigned') === state.client) && `${a.name} ${a.scope} ${a.workflow} ${a.client || 'Unassigned'}`.toLowerCase().includes(query));
    count.textContent = `${matches.length} of ${state.assessments.length}`;
    const table = el('table');
    const head = el('tr');
    ['Assessment / scope', 'Workflow', 'Created', 'Candidates', 'Open'].forEach(t => head.append(el('th', t)));
    append(table, append(el('thead'), head));
    const body = el('tbody');
    matches.forEach(a => {
      const row = el('tr');
      const identity = el('td');
      append(identity, button(a.name, () => openAssessment(a.id), 'row-button'), el('span', `${a.client || 'Unassigned'} / ${a.scope}`, 'subline'));
      append(row, identity, el('td', workflows[a.workflow] || a.workflow), el('td', date(a.created_at), 'mono'), el('td', a.finding_count, 'mono'), el('td', a.unresolved_count, 'mono'));
      labelCells(row, ['Assessment / scope', 'Workflow', 'Created', 'Candidates', 'Open']);
      body.append(row);
    });
    table.append(body);
    wrap.replaceChildren(table);
    if (!matches.length) wrap.append(el('p', 'No matching assessments.', 'muted'));
  }
  search.addEventListener('input', draw);
  draw();
}
async function openAssessment(id) {
  $('#view').replaceChildren(el('p', 'Loading evidence…', 'muted'));
  try {
    state.assessment = (await api(`/api/assessments/${encodeURIComponent(id)}`)).assessment;
    state.externalChange = false;
    state.tab = 'ledger';
    state.ledgerSearch = state.verdict = state.severity = '';
    renderAssessment();
  }
  catch (error) {
    notify(error.message, true);
    await loadOverview();
  }
}
function renderAssessment() {
  activate();
  const a = state.assessment;
  const view = $('#view');
  view.replaceChildren(button('← Assessment register', loadOverview, 'text-button back'));
  append(view, heading(`${workflows[a.workflow] || a.workflow} / ${date(a.created_at)}`, a.name, `${a.client || 'Unassigned'} / ${a.scope}`), strip(a.roles));
  const actions = el('div', undefined, 'detail-actions');
  append(actions, button('↓ Export JSON', () => download('json')), button('↓ Export Markdown', () => download('markdown')), button('Print executive report', printCurrentReport), button('Add analyst finding', openManual), button('Refresh saved assessment', refreshAssessment, 'refresh-assessment'), button('Continue engagement', continueEngagement, 'continue-engagement'), button('Record handoff', openHandoff), button('Delete assessment', () => $('#delete-dialog').showModal(), 'text-button'));
  view.append(actions);
  $('.refresh-assessment', actions).id = 'refresh-assessment';
  $('.continue-engagement', actions).id = 'continue-engagement';
  const changeHint = el('p', '', 'change-hint fine');
  changeHint.id = 'change-hint';
  changeHint.setAttribute('role', 'status');
  changeHint.hidden = !state.externalChange;
  changeHint.textContent = 'Saved workspace data changed in another tab. Use Refresh saved assessment to load it. Unsaved dialog inputs are preserved until you choose to discard.';
  view.append(changeHint);
  const stats = el('div', undefined, 'stats');
  [['Candidates', a.findings.length], ['Awaiting decision', a.findings.filter(f => f.verdict === 'unresolved').length], ['Perspectives assigned', a.roles.length]].forEach(([label, value]) => {
    const cell = el('div', undefined, 'stat');
    append(cell, el('span', label), el('strong', String(value).padStart(2, '0')));
    stats.append(cell);
  });
  append(view, stats, el('p', a.summary, 'muted'));
  const recordBytes = new TextEncoder().encode(JSON.stringify(a)).length;
  view.append(el('p', `Record limits: ${(a.activity || []).length} / 200 events · ${(a.snapshots || []).length} / 3 report snapshots · approximately ${recordBytes.toLocaleString()} serialized bytes. Continue the engagement to start fresh event/report capacity; export backups before retention changes.`, 'fine'));
  if ((a.activity || []).length >= 180 || (a.snapshots || []).length >= 3 || recordBytes >= 4 * 1024 * 1024) view.append(el('p', 'This engagement is nearing an event, frozen-report, or backup-size limit. Export a backup and continue the engagement for fresh history/report capacity.', 'fine')); 
  const tabs = el('div', undefined, 'tabs');
  tabs.setAttribute('role', 'tablist');
  const panel = el('section');
  panel.id = 'assessment-panel';
  panel.setAttribute('role', 'tabpanel');
  [['ledger', 'Evidence ledger'], ['queue', 'Remediation'], ['reports', 'Reports'], ['delivery', 'Delivery'], ['missions', 'Missions'], ['coverage', 'Coverage & activity']].forEach(([key, label]) => {
    const node = button(label, () => {
      if (!allowDeliveryDiscard()) return;
      state.tab = key;
      renderAssessment();
    }, `tab${state.tab === key ? ' active' : ''}`);
    node.id = `tab-${key}`;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(state.tab === key));
    node.setAttribute('aria-controls', panel.id);
    tabs.append(node);
  });
  panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!allowDeliveryDiscard()) return;
    const keys = ['ledger', 'queue', 'reports', 'delivery', 'missions', 'coverage'];
    const index = keys.indexOf(state.tab);
    state.tab = keys[event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    renderAssessment();
    $(`#tab-${state.tab}`).focus();
  });
  tabs.querySelectorAll('[role=tab]').forEach(tab => {
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
  });
  append(view, tabs, panel);
  if (state.tab === 'ledger') renderLedger(panel, a);
  if (state.tab === 'queue') renderQueue(panel, a);
  if (state.tab === 'reports') renderReports(panel, a);
  if (state.tab === 'delivery') renderDelivery(panel, a);
  if (state.tab === 'missions') a.missions.forEach(m => {
    const article = el('article', undefined, 'mission');
    const head = el('div', undefined, 'mission-header');
    append(head, el('p', `${m.role.toUpperCase()} HAT`, 'eyebrow'), el('h3', m.title));
    append(article, head, el('p', m.objective));
    const steps = el('ol');
    m.steps.forEach(s => steps.append(el('li', s)));
    append(article, steps, el('p', `Deliverable: ${m.deliverable}`));
    m.limitations.forEach(l => article.append(el('p', `Limit: ${l}`, 'fine')));
    const entry = (a.workbook || []).find(item => item.role === m.role) || workbookDefault(m.role);
    article.append(el('p', `Workbook: ${entry.status} / Owner: ${entry.owner || 'Unassigned'}`, 'fine'));
    article.append(button(`Edit ${m.role} workbook`, () => openWorkbook(entry)));
    panel.append(article);
  });
  if (state.tab === 'coverage') {
    const section = el('div', undefined, 'coverage');
    append(section, el('h3', 'Checked boundaries & limitations'));
    const list = el('ul');
    a.coverage.forEach(c => list.append(el('li', typeof c === 'string' ? c : JSON.stringify(c))));
    append(section, list, el('h3', 'Decision history'));
    a.activity.forEach(item => {
      const record = el('div', undefined, 'record-section');
      append(record, el('h3', `${date(item.at)} · ${item.action}`), el('p', item.note));
      section.append(record);
    });
    panel.append(section);
  }
}
function renderLedger(panel, a) {
  const title = el('div', undefined, 'section-title');
  append(title, el('h2', 'Candidate findings'), el('span', 'ANALYST VERDICT REQUIRED', 'count'));
  panel.append(title);
  if (!a.findings.length) {
    panel.append(empty('No candidates from this input.', 'This result covers only the limited checks listed under Coverage. Use the assigned missions to continue the review.'));
    return;
  }
  const toolbar = el('div', undefined, 'toolbar');
  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Search evidence, location, verdict…';
  search.value = state.ledgerSearch;
  search.setAttribute('aria-label', 'Search findings');
  const count = el('span', '', 'count');
  const verdictFilter = selectControl('Filter by verdict', [['', 'All verdicts'], ...['unresolved', 'confirmed-static', 'confirmed-runtime', 'rejected'].map(v => [v, v])]);
  const severityFilter = selectControl('Filter by severity', [['', 'All severities'], ...['high', 'medium', 'low'].map(v => [v, v])]);
  verdictFilter.value = state.verdict;
  severityFilter.value = state.severity;
  verdictFilter.addEventListener('change', () => { state.verdict = verdictFilter.value; draw(); });
  severityFilter.addEventListener('change', () => { state.severity = severityFilter.value; draw(); });
  append(toolbar, search, verdictFilter, severityFilter, count);
  panel.append(toolbar);
  const wrap = el('div', undefined, 'table-wrap');
  panel.append(wrap);
  function draw() {
    state.ledgerSearch = search.value;
    const q = search.value.toLowerCase();
    const matches = a.findings.filter(f => (!state.verdict || f.verdict === state.verdict) && (!state.severity || f.severity === state.severity) && `${f.title} ${f.location} ${f.verdict} ${f.evidence}`.toLowerCase().includes(q));
    count.textContent = `${matches.length} records`;
    const table = el('table');
    const head = el('tr');
    ['Candidate / location', 'Severity', 'Confidence', 'Verdict'].forEach(t => head.append(el('th', t)));
    table.append(append(el('thead'), head));
    const body = el('tbody');
    matches.forEach(f => {
      const row = el('tr');
      const identity = el('td');
      const findingButton = button(f.title, () => openFinding(f), 'row-button');
      findingButton.dataset.finding = f.id;
      append(identity, findingButton, el('span', f.location, 'subline mono'));
      append(row, identity, el('td', f.severity, 'tag'), el('td', f.confidence, 'tag'), el('td', f.verdict, 'tag'));
      labelCells(row, ['Candidate / location', 'Severity', 'Confidence', 'Verdict']);
      body.append(row);
    });
    table.append(body);
    wrap.replaceChildren(table);
    if (!matches.length) wrap.append(el('p', 'No matching findings.', 'muted'));
  }
  search.addEventListener('input', draw);
  draw();
}
function displayValue(value) {
  if (Array.isArray(value)) return value.join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value || 'None recorded.');
}
function openFinding(f) {
  clearFindingError();
  state.finding = f;
  const body = $('#finding-body');
  body.replaceChildren(el('h2', f.title), el('p', `${f.severity.toUpperCase()} SEVERITY / ${f.confidence.toUpperCase()} CONFIDENCE`, 'eyebrow'));
  [['Location', f.location], ['Root cause', f.root_cause], ['Input to impact', f.input_to_impact], ['Prerequisites', f.prerequisites], ['Mitigations inspected', f.mitigations], ['Evidence', f.evidence], ['Remediation', f.remediation]].forEach(([title, value]) => {
    const section = el('div', undefined, 'record-section');
    append(section, el('h3', title), el('p', displayValue(value)));
    body.append(section);
  });
  $('#finding-body h2').id = 'finding-title';
  $('#verdict').value = f.verdict;
  $('#review-note').value = f.review_note || '';
  const review = f.review || {};
  const tracking = f.tracking || {};
  for (const [key, id] of Object.entries(reviewFields)) $(`#${id}`).value = review[key] || '';
  for (const [key, id] of Object.entries(trackingFields)) $(`#${id}`).value = tracking[key] || (key === 'status' ? 'open' : '');
  updateReviewRequirements();
  state.originalReview = reviewSnapshot();
  if (!$('#finding-dialog').open) $('#finding-dialog').showModal();
  $('#verdict').focus();
}
async function download(format) {
  try {
    const text = await CyberLocal.exportText(state.assessment.id, format);
    const blob = new Blob([text], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url;
    link.download = `assessment-${state.assessment.id}.${format === 'json' ? 'json' : 'md'}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Export created locally. Store backups in an approved location.');
  } catch (error) {
    notify(error.message, true);
  }
}
$('#nav-overview').addEventListener('click', loadOverview);
$('.brand').addEventListener('click', e => {
  e.preventDefault();
  loadOverview();
});
$('#nav-new').addEventListener('click', openCreate);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  const dialog = b.closest('dialog');
  if (dialog.id === 'finding-dialog' && !allowFindingDiscard()) return;
  if (dialog.id === 'manual-dialog' && !allowManualDiscard()) return;
  if (dialog.id === 'handoff-dialog' && !allowHandoffDiscard()) return;
  if (dialog.id === 'workbook-dialog' && !allowWorkbookDiscard()) return;
  dialog.close();
}));
$('#finding-dialog').addEventListener('cancel', event => {
  if (!allowFindingDiscard()) event.preventDefault();
});
$('#manual-dialog').addEventListener('cancel', event => {
  if (!allowManualDiscard()) event.preventDefault();
});
$('#handoff-dialog').addEventListener('cancel', event => {
  if (!allowHandoffDiscard()) event.preventDefault();
});
$('#create-dialog').addEventListener('close', () => $('#nav-new').classList.remove('active'));
const help = {
  code: ['Python source', 'Paste a Python snippet for limited text-pattern checks. This is not a Python parser or data-flow analysis. Input is never executed.'], alerts: ['Alert events / JSON array', 'Use up to 500 JSON objects with event, actor, and optional source_ip. Supported signals: repeated login_failed, privilege_change, malware_detected.'], exercise: ['Exercise scenario', 'Describe the business, assets, constraints, and scenario. The workbench creates bounded mission plans; it does not simulate an attack.']
};
let previousWorkflow = 'code';
$('#workflow').addEventListener('change', () => {
  if ($('#content').value.trim() && !window.confirm('Changing workflow will clear your current input. Continue?')) {
    $('#workflow').value = previousWorkflow;
    return;
  }
  previousWorkflow = $('#workflow').value;
  const [label, description] = help[$('#workflow').value];
  $('#input-label').textContent = label;
  $('#input-help').textContent = description;
  $('#content').value = '';
});
$('#sample').addEventListener('click', () => {
  if ($('#content').value.trim() && !window.confirm('Replace the current input with the sample?')) return;
  const w = $('#workflow').value;
  const samples = {
    code: 'import subprocess\n\ndef run_diagnostic(user_input):\n    return subprocess.run(user_input, shell=True)\n', alerts: JSON.stringify(Array.from({
      length: 5
    }, () => ({
      event: 'login_failed', actor: 'sample-user', source_ip: '192.0.2.10'
    })), null, 2), exercise: 'A fictional retailer must respond to a suspected account takeover affecting its customer support portal. Scope: tabletop discussion only. Test escalation, identity verification, evidence preservation, and detection handoffs. No production systems or external targets.'
  };
  $('#content').value = samples[w];
  if (!$('#assessment-name').value) $('#assessment-name').value = `Sample ${workflows[w].toLowerCase()}`;
  if (!$('#scope').value) $('#scope').value = 'Fictional sample input only; no external systems';
  notify('Sample input loaded. Review scope and authorization before creating.');
});
$('#create-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const selected = [...form.querySelectorAll('[name="roles"]:checked')].map(n => n.value);
  if (!selected.length) {
    formError(form, 'Select at least one perspective.');
    return;
  }
  busy(form, async () => {
    const result = await api('/api/assessments', {
      method: 'POST', body: JSON.stringify({
        name: $('#assessment-name').value.trim(), client: $('#client').value.trim(), workflow: $('#workflow').value, scope: $('#scope').value.trim(), authorization: $('#authorization').checked, content: $('#content').value, roles: selected
      })
    });
    form.reset();
    previousWorkflow = 'code';
    $('#content').value = '';
    $('#input-label').textContent = help.code[0];
    $('#input-help').textContent = help.code[1];
    $('#create-dialog').close();
    state.assessment = result.assessment;
    state.tab = 'ledger';
    state.ledgerSearch = state.verdict = state.severity = '';
    renderAssessment();
    notify('Assessment created. Candidates await analyst review.');
  });
});
$('#verdict-form').addEventListener('submit', event => {
  event.preventDefault();
  const note = $('#review-note').value.trim();
  if (note.length < 20) {
    formError(event.currentTarget, 'Add a substantive decision note of at least 20 characters.');
    return;
  }
  busy(event.currentTarget, async () => {
    state.assessment = (await api(`/api/assessments/${encodeURIComponent(state.assessment.id)}/findings/${encodeURIComponent(state.finding.id)}`, {
      method: 'PATCH', body: JSON.stringify({
        expected_revision: state.finding.revision || 0, verdict: $('#verdict').value, note, review: fieldValues(reviewFields), tracking: fieldValues(trackingFields)
      })
    })).assessment;
    const savedId = state.finding.id;
    $('#finding-dialog').close();
    renderAssessment();
    const target = [...document.querySelectorAll('[data-finding]')].find(node => node.dataset.finding === savedId);
    (target || $(`#tab-${state.tab}`)).focus();
    notify('Analyst decision recorded.');
  });
});
$('#confirm-delete').addEventListener('click', () => busy($('#delete-dialog'), async () => {
  await api(`/api/assessments/${encodeURIComponent(state.assessment.id)}`, {
    method: 'DELETE'
  });
  $('#delete-dialog').close();
  await loadOverview();
  notify('Assessment deleted.');
}));
window.addEventListener('beforeunload', event => {
  const draft = $('#client').value.trim() || $('#assessment-name').value.trim() || $('#scope').value.trim() || $('#content').value.trim();
  const noteChanged = $('#finding-dialog').open && state.finding && reviewSnapshot() !== state.originalReview;
  const handoffDraft = $('#handoff-dialog').open && $('#handoff-note').value.trim();
  const manualDraft = $('#manual-dialog').open && manualSnapshot() !== state.manualOriginal;
  const workbookDraft = $('#workbook-dialog').open && workbookSnapshot() !== state.workbookOriginal;
  if (draft || noteChanged || handoffDraft || manualDraft || workbookDraft || deliveryDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

const reviewFields = {
  reviewer: 'reviewer', reference: 'reference', prerequisites: 'review-prerequisites',
  mitigations: 'review-mitigations', method: 'review-method'
};
const trackingFields = {
  owner: 'tracking-owner', due_date: 'tracking-due', status: 'tracking-status', retest: 'tracking-retest'
};
function fieldValues(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, $(`#${id}`).value.trim()]));
}
function reviewSnapshot() {
  return JSON.stringify({ verdict: $('#verdict').value, note: $('#review-note').value, review: fieldValues(reviewFields), tracking: fieldValues(trackingFields) });
}
function updateReviewRequirements() {
  const confirmed = $('#verdict').value.startsWith('confirmed-');
  Object.values(reviewFields).forEach(id => { $(`#${id}`).required = confirmed; });
  const method = $('#review-method');
  method.minLength = confirmed ? 20 : 0;
  const substantive = method.value.trim().length >= 20 && (method.value.match(/[\p{L}\p{N}]/gu) || []).length >= 10;
  method.setCustomValidity(confirmed && method.value && !substantive ? 'Describe the method in at least 20 characters, including 10 letters or digits.' : '');
}
$('#verdict').addEventListener('change', updateReviewRequirements);
$('#review-method').addEventListener('input', updateReviewRequirements);
function selectControl(label, entries) {
  const select = el('select');
  select.setAttribute('aria-label', label);
  entries.forEach(([value, text]) => {
    const option = el('option', text);
    option.value = value;
    select.append(option);
  });
  return select;
}
function labelCells(row, labels) {
  [...row.children].forEach((cell, i) => { cell.dataset.label = labels[i]; });
}
function saveText(text, filename, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function backupWorkspace() {
  try {
    const text = await CyberLocal.backupText(state.client || undefined);
    saveText(text, `napolean-backup-${new Date().toISOString().slice(0, 10)}.json`);
    recordBackupInitiated();
    notify(`Backup export initiated for ${state.client || 'all clients'}. This app cannot confirm that the file was saved.`);
  } catch (error) { notify(error.message, true); }
}
function openRestore() {
  state.restoreText = '';
  $('#restore-form').reset();
  $('#restore-preview').replaceChildren();
  $('#restore-form .error-inline').hidden = true;
  $('#restore-submit').disabled = true;
  $('#restore-dialog').showModal();
}
let previewSequence = 0;
$('#restore-file').addEventListener('change', async () => {
  const sequence = ++previewSequence;
  state.restoreText = '';
  $('#restore-submit').disabled = true;
  $('#restore-confirm').checked = false;
  $('#restore-preview').textContent = '';
  const file = $('#restore-file').files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Backup exceeds the 5 MB file limit.');
    const text = await file.text();
    const preview = await CyberLocal.previewBackup(text);
    if (sequence !== previewSequence) return;
    state.restoreText = text;
    const clientLabels = (preview.clients || []).slice(0, 15).join(', ');
    $('#restore-preview').textContent = `${preview.count} assessment copies will be added. Clients: ${clientLabels || 'Unassigned'}${(preview.clients || []).length > 15 ? '…' : ''}. Existing records remain unchanged. Snapshot digests are checked during restore. This preview does not verify analyst identity or authenticate evidence.`;
    $('#restore-form .error-inline').hidden = true;
    $('#restore-submit').disabled = false;
  } catch (error) {
    if (sequence === previewSequence) formError($('#restore-form'), error.message);
  }
});
$('#restore-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!state.restoreText) { formError(event.currentTarget, 'Choose and validate a backup first.'); return; }
  busy(event.currentTarget, async () => {
    const result = await CyberLocal.restoreBackup(state.restoreText);
    state.restoreText = '';
    state.client = '';
    $('#restore-dialog').close();
    await loadOverview();
    notify(`${result.count} assessment copies restored. Existing records were preserved.`);
  });
});
$('#restore-dialog').addEventListener('close', () => {
  previewSequence++;
  state.restoreText = '';
  $('#restore-file').value = '';
});
function openHandoff() {
  if (!allowDeliveryDiscard()) return;
  if (state.assessment.roles.length < 2) { notify('A role handoff requires at least two assigned perspectives.'); return; }
  $('#handoff-form').reset();
  $('#handoff-form .error-inline').hidden = true;
  ['#handoff-from', '#handoff-to'].forEach(id => {
    const select = $(id);
    select.replaceChildren();
    state.assessment.roles.forEach(role => {
      const option = el('option', `${role} hat`);
      option.value = role;
      select.append(option);
    });
  });
  if (state.assessment.roles.length > 1) $('#handoff-to').selectedIndex = 1;
  $('#handoff-dialog').showModal();
}
$('#handoff-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('#handoff-from').value === $('#handoff-to').value) { formError(event.currentTarget, 'Choose two different assigned perspectives.'); return; }
  busy(event.currentTarget, async () => {
    state.assessment = (await api(`/api/assessments/${state.assessment.id}`, {
      method: 'PATCH', body: JSON.stringify({ from: $('#handoff-from').value, to: $('#handoff-to').value, note: $('#handoff-note').value.trim() })
    })).assessment;
    $('#handoff-dialog').close();
    state.tab = 'coverage';
    renderAssessment();
    $('#tab-coverage').focus();
    notify('Role handoff recorded locally.');
  });
});
$('#next-unresolved').addEventListener('click', () => {
  if (reviewSnapshot() !== state.originalReview && !window.confirm('Discard unsaved changes and open the next unresolved finding?')) return;
  const findings = state.assessment.findings;
  const index = findings.findIndex(f => f.id === state.finding.id);
  const next = [...findings.slice(index + 1), ...findings.slice(0, index)].find(f => f.verdict === 'unresolved');
  if (!next) { notify('There are no other unresolved findings.'); return; }
  openFinding(next);
  $('#finding-dialog').scrollTop = 0;
});
function printReport(data = state.assessment, snapshot = null) {
  const a = data;
  const report = $('#print-report');
  const reportLogo = el('img', undefined, 'report-logo');
  reportLogo.src = new URL('logo-print.svg', $('.brand-logo').src).href;
  reportLogo.alt = 'Napolean Cyber Command';
  reportLogo.width = 210;
  reportLogo.height = 80;
  report.replaceChildren(reportLogo, el('p', 'CLIENT ASSESSMENT', 'eyebrow'), el('h1', a.name));
  append(report, el('p', `Client: ${a.client || 'Unassigned'} · Scope: ${a.scope}`), el('p', `Assessment: ${a.id} · Created: ${date(a.created_at)} · Report: ${date(new Date().toISOString())}`));
  const totals = CyberLocal.summarize(a);
  if (a.delivery) {
    report.append(el('h2', 'Analyst delivery summary'));
    for (const [key, title] of Object.entries(deliveryLabels)) report.append(el('h3', title), el('p', a.delivery[key] || 'Not supplied.'));
  }
  const counts = `Unresolved validation: ${totals.unresolved} / Confirmed static: ${totals.confirmed_static} / Confirmed runtime: ${totals.confirmed_runtime} / Rejected: ${totals.rejected} / Open remediation: ${totals.open_remediation}`;
  if (snapshot) report.append(el('p', `Frozen report v${snapshot.version} · ${snapshot.created_at} · Source revision ${snapshot.source_revision} · SHA-256 ${snapshot.sha256}. Digest detects corruption; it does not authenticate identity or evidence.`));
  append(report, el('h2', 'Executive summary'), el('p', counts), el('p', 'Verdicts and reviewer labels are analyst attestations. They are not independently verified evidence, verified identities, or a security certification. Pattern checks do not execute source or prove exploitability. Remediation status is analyst-maintained.'));
  const groups = [ ['Confirmed findings', f => f.verdict.startsWith('confirmed-')], ['Unresolved candidates', f => f.verdict === 'unresolved'], ['Rejected candidates', f => f.verdict === 'rejected'] ];
  groups.forEach(([title, test]) => {
    report.append(el('h2', title));
    const findings = a.findings.filter(test);
    if (!findings.length) report.append(el('p', 'None recorded.'));
    findings.forEach(f => {
      const section = el('article', undefined, 'print-finding');
      append(section, el('h3', `${f.title} · ${f.severity} / ${f.verdict}`));
      const review = f.review || {};
      const completeReview = Object.keys(reviewFields).every(key => typeof review[key] === 'string' && review[key].trim().length > 0)
        && (review.method || '').trim().length >= 20
        && ((review.method || '').match(/[\p{L}\p{N}]/gu) || []).length >= 10;
      if (f.verdict.startsWith('confirmed-') && !completeReview) {
        section.append(el('p', 'Legacy attestation: structured evidence is incomplete; this verdict requires renewed review.'));
      }
      for (const [label, value] of [['Location', f.location], ['Root cause', f.root_cause], ['Input-to-impact path', f.input_to_impact], ['Prerequisites', f.prerequisites], ['Mitigations inspected', f.mitigations], ['Evidence', f.evidence], ['Remediation', f.remediation], ['Analyst note', f.review_note], ...Object.entries(f.review || {}).map(([key, value]) => [`Review ${key}`, value]), ...Object.entries(f.tracking || {}).map(([key, value]) => [`Tracking ${key}`, value])]) {
        section.append(el('p', `${label}: ${displayValue(value)}`));
      }
      report.append(section);
    });
  });
  report.append(el('h2', 'Mission guidance and role workbook'));
  (a.missions || []).forEach(mission => {
    report.append(el('h3', `${mission.role} / ${mission.title}`), el('p', mission.objective));
    mission.steps.forEach((step, index) => report.append(el('p', `${index + 1}. ${step}`)));
    report.append(el('p', `Deliverable: ${mission.deliverable}`));
    mission.limitations.forEach(limit => report.append(el('p', `Limitation: ${limit}`)));
    const entry = (a.workbook || []).find(item => item.role === mission.role);
    if (entry) Object.entries(entry).forEach(([key, value]) => report.append(el('p', `Workbook ${key}: ${value || 'Not supplied.'}`)));
  });
  report.append(el('h2', 'Coverage and limitations'));
  a.coverage.forEach(item => report.append(el('p', displayValue(item))));
  report.append(el('h2', 'Activity and handoffs'));
  a.activity.forEach(item => report.append(el('p', `${item.at} · ${item.action}: ${item.note}`)));
  window.print();
}

function clearFindingError() {
  const error = $('#verdict-form .error-inline');
  error.hidden = true;
  error.textContent = '';
  $('#reload-finding').hidden = true;
}
function allowFindingDiscard() {
  return !state.finding || reviewSnapshot() === state.originalReview || window.confirm('Discard unsaved changes to this finding?');
}
$('#reload-finding').addEventListener('click', async () => {
  if (!window.confirm('Reload the latest saved finding and discard your unsaved changes?')) return;
  let reloaded = false;
  await busy($('#verdict-form'), async () => {
    const id = state.finding.id;
    const current = (await api(`/api/assessments/${state.assessment.id}`)).assessment;
    const finding = current.findings.find(f => f.id === id);
    if (!finding) throw new Error('This finding no longer exists. Close the dialog and refresh the register.');
    state.assessment = current;
    renderAssessment();
    openFinding(finding);
    reloaded = true;
    notify('Latest saved finding loaded.');
  });
  if (reloaded) $('#verdict').focus();
});
const manualFields = ['location', 'root_cause', 'input_to_impact', 'prerequisites', 'mitigations', 'evidence', 'remediation'];
function manualSnapshot() {
  return JSON.stringify({ title: $('#manual-title-input').value, severity: $('#manual-severity').value, fields: manualFields.map(key => $(`#manual-${key}`).value) });
}
function allowManualDiscard() {
  return manualSnapshot() === state.manualOriginal || window.confirm('Discard unsaved analyst finding evidence?');
}
function allowHandoffDiscard() {
  return !$('#handoff-note').value.trim() || window.confirm('Discard the unsaved role handoff note?');
}
function openManual() {
  if (!allowDeliveryDiscard()) return;
  $('#manual-form').reset();
  state.manualOriginal = manualSnapshot();
  $('#manual-form .error-inline').hidden = true;
  $('#manual-dialog').showModal();
  $('#manual-title-input').focus();
}
$('#manual-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.currentTarget, async () => {
    const payload = { title: $('#manual-title-input').value.trim(), severity: $('#manual-severity').value };
    manualFields.forEach(key => { payload[key] = $(`#manual-${key}`).value.trim(); });
    state.assessment = (await api(`/api/assessments/${state.assessment.id}/findings`, { method: 'POST', body: JSON.stringify(payload) })).assessment;
    $('#manual-dialog').close();
    state.tab = 'ledger';
    state.ledgerSearch = state.verdict = state.severity = '';
    renderAssessment();
    // The successful transaction appends this submission after any concurrent additions.
    const finding = state.assessment.findings[state.assessment.findings.length - 1];
    if (finding) openFinding(finding);
    notify('Analyst candidate added as unresolved / low confidence.');
  });
});
function renderQueue(panel, assessment) {
  const totals = CyberLocal.summarize(assessment);
  append(panel, heading('CONFIRMED FINDINGS ONLY', 'Remediation queue', `${totals.open_remediation} open remediation items. Unresolved candidates require validation before remediation tracking.`));
  const confirmed = assessment.findings.filter(f => f.verdict === 'confirmed-static' || f.verdict === 'confirmed-runtime');
  const toolbar = el('div', undefined, 'toolbar');
  const owners = [...new Set(confirmed.map(f => (f.tracking || {}).owner || ''))].sort();
  const owner = selectControl('Filter remediation by owner', [['', 'All owners'], ...owners.map(value => [JSON.stringify(value), value || 'Unassigned owner'])]);
  const status = selectControl('Filter remediation by status', [['', 'All statuses'], ...['open', 'in-progress', 'resolved', 'retest'].map(value => [value, value])]);
  const label = el('label', undefined, 'inline-check');
  const overdue = el('input');
  overdue.type = 'checkbox';
  overdue.id = 'queue-overdue';
  append(label, overdue, el('span', 'Overdue only (UTC)'));
  const count = el('span', '', 'count');
  append(toolbar, owner, status, label, count);
  const wrap = el('div', undefined, 'table-wrap');
  append(panel, toolbar, wrap);
  function draw() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = confirmed.filter(f => {
      const t = f.tracking || {};
      return (!owner.value || (t.owner || '') === JSON.parse(owner.value))
        && (!status.value || (t.status || 'open') === status.value)
        && (!overdue.checked || (t.due_date && t.due_date < today && t.status !== 'resolved'));
    });
    count.textContent = `${rows.length} confirmed items`;
    const table = el('table');
    const head = el('tr');
    const labels = ['Finding', 'Owner', 'Due date (UTC)', 'Status'];
    labels.forEach(text => head.append(el('th', text)));
    table.append(append(el('thead'), head));
    const body = el('tbody');
    rows.forEach(f => {
      const t = f.tracking || {};
      const row = el('tr');
      const identity = el('td');
      const link = button(f.title, () => openFinding(f), 'row-button');
      link.dataset.finding = f.id;
      append(identity, link, el('span', `${f.severity} / ${f.verdict}`, 'subline'));
      const late = t.due_date && t.due_date < today && t.status !== 'resolved';
      append(row, identity, el('td', t.owner || 'Unassigned'), el('td', `${t.due_date || 'No target date'}${late ? ' / overdue' : ''}`, 'mono'), el('td', t.status || 'open', 'tag'));
      labelCells(row, labels);
      body.append(row);
    });
    table.append(body);
    wrap.replaceChildren(table);
    if (!rows.length) wrap.append(el('p', 'No confirmed findings match these filters.', 'muted'));
  }
  [owner, status, overdue].forEach(control => control.addEventListener('change', draw));
  draw();
}
function renderReports(panel, assessment) {
  append(panel, heading('FROZEN LOCAL RECORDS', 'Report versions', 'Capture the current saved assessment. Later edits do not change a frozen report. Maximum three versions per assessment.'));
  panel.append(el('p', 'SHA-256 checks detect data corruption. They do not authenticate analyst identity, establish evidence authenticity, or provide tamper-proof signing.', 'fine'));
  const error = el('p', '', 'error-inline');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  panel.append(error);
  const create = button('Create frozen report', () => busy(panel, async () => {
    const result = await CyberLocal.createSnapshot(assessment.id, assessment.revision || 0);
    broadcastChange(assessment.id);
    state.assessment = result.assessment;
    renderAssessment();
    $('#tab-reports').focus();
    notify(`Frozen report version ${result.snapshot.version} created.`);
  }), 'primary');
  create.id = 'create-report';
  create.disabled = (assessment.snapshots || []).length >= 3;
  panel.append(create);
  const snapshots = assessment.snapshots || [];
  if (!snapshots.length) panel.append(empty('No report versions yet.', 'Create a frozen report after saving analyst decisions and remediation tracking.'));
  snapshots.forEach(snapshot => {
    const article = el('article', undefined, 'mission');
    append(article, el('h3', `Version ${snapshot.version}`), el('p', `${snapshot.created_at} / source revision ${snapshot.source_revision}`, 'mono'), el('p', `SHA-256: ${snapshot.sha256}`, 'snapshot-hash fine'));
    const actions = el('div', undefined, 'detail-actions');
    ['json', 'markdown'].forEach(format => actions.append(button(`Download v${snapshot.version} ${format === 'json' ? 'JSON' : 'Markdown'}`, async () => {
      try {
        const text = await CyberLocal.exportSnapshot(assessment.id, snapshot.id, format);
        saveText(text, `report-${assessment.id}-v${snapshot.version}.${format === 'json' ? 'json' : 'md'}`, format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8');
      } catch (error) { notify(error.message, true); }
    })));
    actions.append(button(`Print version ${snapshot.version}`, async () => {
      try {
        await CyberLocal.exportSnapshot(assessment.id, snapshot.id, 'json');
        printReport(snapshot.data, snapshot);
      } catch (error) { notify(error.message, true); }
    }));
    append(article, actions);
    panel.append(article);
  });
}

const deliveryLabels = {
  executive_summary: 'Executive summary', business_impact: 'Business impact', recommendations: 'Prioritized recommendations'
};
const workbookKeys = ['owner', 'status', 'evidence', 'expected', 'observed', 'decision'];
let channel = null;
try { if (typeof BroadcastChannel === 'function') channel = new BroadcastChannel('interval-assessment-changes'); } catch (_) { /* Optional hints may be blocked by browser policy. Focus detection remains available. */ }
function broadcastChange(assessmentId) {
  if (typeof assessmentId === 'string' && /^[a-f0-9]{32}$/.test(assessmentId)) {
    try { channel?.postMessage({ assessmentId }); } catch (_) { /* Change hints are optional. */ }
  }
}
function showChangeHint() {
  state.externalChange = true;
  const hint = $('#change-hint');
  if (hint) hint.hidden = false;
  else notify('Saved workspace data changed. Refresh the register to load current records.');
}
if (channel) channel.onmessage = event => {
  const value = event.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !/^[a-f0-9]{32}$/.test(value.assessmentId)) return;
  if (!state.assessment || state.assessment.id === value.assessmentId) showChangeHint();
};
window.addEventListener('focus', async () => {
  try {
    if (state.assessment) {
      const latest = (await CyberLocal.request(`/api/assessments/${state.assessment.id}`)).assessment;
      if ((latest.revision || 0) !== (state.assessment.revision || 0)) showChangeHint();
    } else {
      const latest = (await CyberLocal.request('/api/assessments')).assessments;
      if (JSON.stringify(latest) !== JSON.stringify(state.assessments)) showChangeHint();
    }
  } catch (_) { /* A later explicit read surfaces unavailable/deleted records. */ }
});
async function printCurrentReport() {
  try {
    const latest = (await api(`/api/assessments/${state.assessment.id}`)).assessment;
    if (deliveryDirty()) notify('Printing the latest saved assessment. Unsaved delivery text stays in your form and is excluded.');
    printReport(latest);
  } catch (error) { notify(error.message, true); }
}
function workbookDefault(role) { return { role, owner: '', status: 'planned', evidence: '', expected: '', observed: '', decision: '' }; }
function workbookSnapshot() {
  return JSON.stringify({ role: $('#workbook-role').value, ...Object.fromEntries(workbookKeys.map(key => [key, $(`#workbook-${key}`).value])) });
}
function allowWorkbookDiscard() {
  return workbookSnapshot() === state.workbookOriginal || window.confirm('Discard unsaved role workbook changes?');
}
function openWorkbook(entry) {
  $('#workbook-form .error-inline').hidden = true;
  $('#reload-workbook').hidden = true;
  $('#workbook-role').value = entry.role;
  workbookKeys.forEach(key => { $(`#workbook-${key}`).value = entry[key] || (key === 'status' ? 'planned' : ''); });
  state.workbookRevision = state.assessment.revision || 0;
  state.workbookOriginal = workbookSnapshot();
  updateWorkbookRequired();
  if (!$('#workbook-dialog').open) $('#workbook-dialog').showModal();
  $('#workbook-owner').focus();
}
function updateWorkbookRequired() {
  const complete = $('#workbook-status').value === 'complete';
  ['evidence', 'observed', 'decision'].forEach(key => { $(`#workbook-${key}`).required = complete; });
}
$('#workbook-status').addEventListener('change', updateWorkbookRequired);
$('#workbook-dialog').addEventListener('cancel', event => { if (!allowWorkbookDiscard()) event.preventDefault(); });
$('#workbook-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.currentTarget, async () => {
    const entry = JSON.parse(workbookSnapshot());
    state.assessment = (await api(`/api/assessments/${state.assessment.id}/workbook`, { method: 'PATCH', body: JSON.stringify({ expected_revision: state.workbookRevision, entry }) })).assessment;
    $('#workbook-dialog').close();
    state.tab = 'missions';
    renderAssessment();
    $('#tab-missions').focus();
    notify('Role workbook saved.');
  });
});
$('#reload-workbook').addEventListener('click', async () => {
  if (!window.confirm('Reload the saved workbook and discard your unsaved workbook changes?')) return;
  const role = $('#workbook-role').value;
  let reloaded = false;
  await busy($('#workbook-form'), async () => {
    state.assessment = (await api(`/api/assessments/${state.assessment.id}`)).assessment;
    renderAssessment();
    openWorkbook((state.assessment.workbook || []).find(entry => entry.role === role) || workbookDefault(role));
    reloaded = true;
  });
  if (reloaded) $('#workbook-owner').focus();
});
function deliverySnapshot() {
  const form = $('#delivery-form');
  return form ? JSON.stringify(Object.fromEntries(Object.keys(deliveryLabels).map(key => [key, $(`#delivery-${key}`).value]))) : null;
}
function deliveryDirty() { return $('#delivery-form') && deliverySnapshot() !== state.deliveryOriginal; }
function allowDeliveryDiscard() { return !deliveryDirty() || window.confirm('Discard unsaved delivery summary changes?'); }
function renderDelivery(panel, assessment) {
  append(panel, heading('ANALYST WRITTEN / SAVED WITH ASSESSMENT', 'Client delivery', 'Summarize business implications and priorities. This text is an analyst statement, not an automated conclusion.'));
  const form = el('form');
  form.id = 'delivery-form';
  const error = el('p', '', 'error-inline'); error.hidden = true; error.setAttribute('role', 'alert');
  const reload = button('Reload latest delivery', reloadDelivery); reload.id = 'reload-delivery'; reload.hidden = true;
  append(form, error, reload);
  Object.entries(deliveryLabels).forEach(([key, title]) => {
    const label = el('label', title); label.htmlFor = `delivery-${key}`;
    const input = el('textarea'); input.id = `delivery-${key}`; input.rows = 5; input.maxLength = 4000; input.value = assessment.delivery?.[key] || '';
    append(form, label, input);
  });
  const actions = el('div', undefined, 'dialog-actions');
  const save = el('button', 'Save delivery summary ↗', 'primary'); save.type = 'submit'; actions.append(save); form.append(actions);
  panel.append(form);
  state.deliveryRevision = assessment.revision || 0;
  state.deliveryOriginal = deliverySnapshot();
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy(form, async () => {
      const delivery = JSON.parse(deliverySnapshot());
      state.assessment = (await api(`/api/assessments/${assessment.id}/delivery`, { method: 'PATCH', body: JSON.stringify({ expected_revision: state.deliveryRevision, delivery }) })).assessment;
      renderAssessment();
      $('#delivery-executive_summary').focus();
      notify('Delivery summary saved.');
    });
  });
}
async function reloadDelivery() {
  if (!window.confirm('Reload saved delivery text and discard your unsaved summary?')) return;
  await busy($('#delivery-form'), async () => {
    state.assessment = (await api(`/api/assessments/${state.assessment.id}`)).assessment;
    renderAssessment();
    $('#delivery-executive_summary').focus();
  });
}
async function refreshAssessment() {
  if (!allowDeliveryDiscard()) return;
  if ($('#finding-dialog').open && !allowFindingDiscard()) return;
  if ($('#workbook-dialog').open && !allowWorkbookDiscard()) return;
  if ($('#manual-dialog').open && !allowManualDiscard()) return;
  if ($('#handoff-dialog').open && !allowHandoffDiscard()) return;
  try {
    const latest = (await api(`/api/assessments/${state.assessment.id}`)).assessment;
    ['#finding-dialog', '#workbook-dialog', '#manual-dialog', '#handoff-dialog'].forEach(id => { if ($(id).open) $(id).close(); });
    state.assessment = latest;
    state.externalChange = false;
    renderAssessment();
    $('#refresh-assessment').focus();
    notify('Latest saved assessment loaded.');
  } catch (error) { notify(error.message, true); }
}
async function continueEngagement() {
  if (!allowDeliveryDiscard()) return;
  try {
    const result = await api(`/api/assessments/${state.assessment.id}/continue`, { method: 'POST', body: JSON.stringify({ expected_revision: state.assessment.revision || 0 }) });
    state.assessment = result.assessment;
    state.tab = 'ledger';
    state.externalChange = false;
    state.ledgerSearch = state.verdict = state.severity = '';
    renderAssessment();
    $('#main').focus();
    notify('Linked continuation created. Source assessment preserved.');
  } catch (error) { notify(error.message, true); }
}
function openRecovery() { $('#recovery-dialog').showModal(); }
let lastBackupInitiated = null;
let backupMetadataAvailable = true;
try { lastBackupInitiated = localStorage.getItem('interval-backup-initiated-at'); } catch (_) { backupMetadataAvailable = false; }
function recordBackupInitiated() {
  lastBackupInitiated = new Date().toISOString();
  try { localStorage.setItem('interval-backup-initiated-at', lastBackupInitiated); backupMetadataAvailable = true; } catch (_) { backupMetadataAvailable = false; }
  const panel = $('#workspace-status'); if (panel) renderWorkspaceStatus(panel);
}
async function renderWorkspaceStatus(panel) {
  try {
    const status = await CyberLocal.workspaceStatus();
    const countKnown = Number.isFinite(status.count);
    const bytesKnown = Number.isFinite(status.approximate_bytes);
    panel.replaceChildren(el('p', `Local assessments: ${countKnown ? status.count : 'Unavailable'} / 100 · Approximate serialized records: ${bytesKnown ? status.approximate_bytes.toLocaleString() + ' bytes' : 'Unavailable'}`));
    if (!countKnown || !bytesKnown) panel.append(el('p', 'Record-size metadata is unavailable. Refresh the register to retry; assessment reads and saves remain independently available.'));
    if (Number.isFinite(status.usage) && Number.isFinite(status.quota)) panel.append(el('p', `Browser-origin usage / quota estimate: ${status.usage.toLocaleString()} / ${status.quota.toLocaleString()} bytes. Includes other origin data and is not a storage guarantee.`));
    else panel.append(el('p', 'Browser-origin quota estimate is unavailable. Assessments remain usable.'));
    panel.append(el('p', `Last backup export initiated: ${lastBackupInitiated || (backupMetadataAvailable ? 'Not recorded' : 'Unavailable because browser metadata storage is blocked')}. This does not confirm that a file was saved.${backupMetadataAvailable ? '' : ' Timestamp persistence is unavailable; any timestamp shown is for this visit only.'}`));
    if ((countKnown && status.count >= 90) || (bytesKnown && status.approximate_bytes >= 4 * 1024 * 1024)) panel.append(el('p', 'Workspace nearing record or backup-size limits. Export a client-filtered backup and review local retention.'));
  } catch (error) {
    panel.textContent = `Storage metadata unavailable: ${error.message}. Assessment reads and saves remain independently available.`;
  }
}
async function openClientRemediation() {
  if (!allowDeliveryDiscard()) return;
  $('#view').replaceChildren(el('p', 'Loading saved remediation across local assessments…', 'muted'));
  try {
    const summaries = (await api('/api/assessments')).assessments;
    const records = [];
    for (const summary of summaries) records.push((await api(`/api/assessments/${summary.id}`)).assessment);
    const view = $('#view'); view.replaceChildren(button('← Assessment register', loadOverview, 'text-button back'));
    const panel = el('section'); panel.id = 'client-remediation';
    append(panel, heading('BROWSER WORKSPACE / CONFIRMED ONLY', 'Client remediation', 'Client labels organize this browser; they do not provide access control or tenant isolation.'));
    const toolbar = el('div', undefined, 'toolbar');
    const clients = selectControl('Filter workspace remediation by client', [['', 'All clients'], ...[...new Set(records.map(a => a.client || 'Unassigned'))].sort().map(value => [value, value])]); clients.value = [...clients.options].some(option => option.value === state.client) ? state.client : ''; 
    const items = records.flatMap(a => a.findings.filter(f => f.verdict.startsWith('confirmed-')).map(f => ({ a, f })));
    const owners = selectControl('Filter workspace remediation by owner', [['', 'All owners'], ...[...new Set(items.map(({ f }) => f.tracking?.owner || ''))].sort().map(value => [JSON.stringify(value), value || 'Unassigned owner'])]);
    const statuses = selectControl('Filter workspace remediation by status', [['', 'All statuses'], ...['open', 'in-progress', 'resolved', 'retest'].map(value => [value, value])]);
    const lateLabel = el('label', undefined, 'inline-check'); const late = el('input'); late.type = 'checkbox'; late.id = 'workspace-overdue'; append(lateLabel, late, el('span', 'Overdue only (UTC)'));
    append(toolbar, clients, owners, statuses, lateLabel); panel.append(toolbar);
    const results = el('div', undefined, 'table-wrap'); panel.append(results); view.append(panel);
    let queuePage = 0;
    const pageSize = 50;
    const pagination = el('nav', undefined, 'detail-actions');
    pagination.setAttribute('aria-label', 'Client remediation pages');
    const pageInfo = el('span', '', 'fine');
    pageInfo.setAttribute('role', 'status');
    const previousPage = button('Previous page', () => { queuePage--; draw(); });
    const nextPage = button('Next page', () => { queuePage++; draw(); });
    append(pagination, previousPage, pageInfo, nextPage);
    panel.append(pagination);
    function draw() {
      const today = new Date().toISOString().slice(0, 10);
      const matching = items.filter(({ a, f }) => (!clients.value || (a.client || 'Unassigned') === clients.value) && (!owners.value || (f.tracking?.owner || '') === JSON.parse(owners.value)) && (!statuses.value || (f.tracking?.status || 'open') === statuses.value) && (!late.checked || (f.tracking?.due_date && f.tracking.due_date < today && f.tracking.status !== 'resolved')));
      const labels = ['Finding / assessment', 'Client', 'Owner', 'Due date (UTC)', 'Status'];
      const table = el('table'); const head = el('tr'); labels.forEach(label => head.append(el('th', label))); table.append(append(el('thead'), head)); const body = el('tbody');
      const pages = Math.max(1, Math.ceil(matching.length / pageSize));
      queuePage = Math.max(0, Math.min(queuePage, pages - 1));
      const start = queuePage * pageSize;
      matching.slice(start, start + pageSize).forEach(({ a, f }) => {
        const row = el('tr'); const identity = el('td'); append(identity, button(f.title, async () => { await openAssessment(a.id); if (!state.assessment || state.assessment.id !== a.id) return; state.tab = 'queue'; renderAssessment(); const target = state.assessment.findings.find(item => item.id === f.id); if (target) openFinding(target); }, 'row-button'), el('span', a.name, 'subline'));
        append(row, identity, el('td', a.client || 'Unassigned'), el('td', f.tracking?.owner || 'Unassigned'), el('td', f.tracking?.due_date || 'No target date'), el('td', f.tracking?.status || 'open')); labelCells(row, labels); body.append(row);
      }); table.append(body); results.replaceChildren(el('p', `${matching.length} confirmed remediation records`, 'fine'), table);
      pageInfo.textContent = matching.length ? `${start + 1}–${Math.min(start + pageSize, matching.length)} of ${matching.length} / Page ${queuePage + 1} of ${pages}` : '0 records / Page 1 of 1';
      previousPage.disabled = queuePage === 0;
      nextPage.disabled = queuePage >= pages - 1;
    }
    clients.addEventListener('change', () => {
      const priorOwner = owners.value;
      owners.replaceChildren();
      const availableOwners = [...new Set(items.filter(({ a }) => !clients.value || (a.client || 'Unassigned') === clients.value).map(({ f }) => f.tracking?.owner || ''))].sort();
      [['', 'All owners'], ...availableOwners.map(value => [JSON.stringify(value), value || 'Unassigned owner'])].forEach(([value, text]) => { const option = el('option', text); option.value = value; owners.append(option); });
      owners.value = [...owners.options].some(option => option.value === priorOwner) ? priorOwner : '';
      queuePage = 0;
      draw();
    });
    [owners, statuses, late].forEach(control => control.addEventListener('change', () => { queuePage = 0; draw(); })); draw();
  } catch (error) { notify(error.message, true); await loadOverview(); }
}
loadOverview();
