"""Local, bounded candidate nomination. Never executes submissions or calls a model."""

import ast
from collections import Counter
from datetime import datetime, timezone
import json
import re
import uuid


ROLES = ('red', 'blue', 'white', 'black', 'purple')
WORKFLOWS = ('code', 'alerts', 'exercise')
VERDICTS = ('unresolved', 'confirmed-static', 'confirmed-runtime', 'rejected')


def now():
    return datetime.now(timezone.utc).isoformat()


def bounded_text(value, label, maximum, minimum=1):
    if not isinstance(value, str) or len(value) > maximum or len(value.strip()) < minimum:
        raise ValueError(f'{label} must contain {minimum}–{maximum} characters.')
    if any(ord(char) < 32 and char not in '\n\r\t' for char in value):
        raise ValueError(f'{label} contains unsupported control characters.')
    return value.strip()


SECRET_NAME = re.compile(r'(?:secret|password|passwd|token|api_?key|access_?key|private_?key)', re.I)
SECRET_INLINE = re.compile(r'''(?i)(\b[\w.-]*(?:secret|password|passwd|token|api_?key|access_?key|private_?key)[\w.-]*\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n]+)''')
BEARER = re.compile(r'(?i)(\b(?:authorization\s*:\s*)?bearer\s+)[A-Za-z0-9._~+/=-]+')
KNOWN_TOKEN = re.compile(r'\b(?:hf_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b')


def redact(value):
    """Best-effort metadata sanitization; generated evidence never includes raw lines."""
    value = SECRET_INLINE.sub(r'\1[REDACTED]', value)
    return KNOWN_TOKEN.sub('[REDACTED]', BEARER.sub(r'\1[REDACTED]', value))


def finding(title, severity, location, root_cause, evidence, remediation, prerequisites):
    return dict(id=uuid.uuid4().hex, title=title, severity=severity, confidence='low',
                verdict='unresolved', location=location, root_cause=root_cause,
                input_to_impact='Analyst must trace input control, reachable code, and business impact.',
                prerequisites=prerequisites,
                mitigations='Not evaluated. Inspect validation, authorization, isolation and compensating controls.',
                evidence=evidence, remediation=remediation, review_note='')


def code_candidates(content):
    try:
        tree = ast.parse(content)
    except (SyntaxError, ValueError, RecursionError, MemoryError) as exc:
        raise ValueError('Code must be a syntactically valid, bounded Python snippet.') from exc
    candidates = []
    # Resolve simple import aliases for subprocess APIs; do not infer arbitrary data flow.
    modules = {'subprocess'}
    shell_functions = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.asname or alias.name for alias in node.names if alias.name == 'subprocess')
        if isinstance(node, ast.ImportFrom) and node.module == 'subprocess':
            shell_functions.update(alias.asname or alias.name for alias in node.names)
    for node in ast.walk(tree):
        location = f'Python snippet line {getattr(node, "lineno", "?")}'
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in ('eval', 'exec'):
                candidates.append(finding('Dynamic Python evaluation', 'high', location,
                    'A call to a dynamic evaluation builtin may accept untrusted code.',
                    'AST identified an eval/exec call; arguments and source text omitted.',
                    'Replace dynamic evaluation with explicit parsing or a bounded dispatch table.',
                    'Untrusted input must reach this call; builtin shadowing and reachability are unverified.'))
            subprocess_call = (isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                               and node.func.value.id in modules and node.func.attr in ('run', 'call', 'Popen', 'check_call', 'check_output', 'getoutput', 'getstatusoutput'))
            imported_call = isinstance(node.func, ast.Name) and node.func.id in shell_functions
            shell_true = any(k.arg == 'shell' and isinstance(k.value, ast.Constant) and k.value.value is True for k in node.keywords)
            if (subprocess_call or imported_call) and shell_true:
                candidates.append(finding('Shell-enabled process invocation', 'high', location,
                    'A subprocess call explicitly enables shell interpretation.',
                    'AST identified a subprocess invocation with shell=True; command omitted.',
                    'Use shell=False with an argument list; constrain executable and arguments.',
                    'An attacker must influence the command or environment; source-to-sink flow is unverified.'))
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names = [child.id for target in targets for child in ast.walk(target) if isinstance(child, ast.Name)]
            value = node.value
            if any(SECRET_NAME.search(name) for name in names) and isinstance(value, ast.Constant) and isinstance(value.value, str) and len(value.value) >= 8:
                candidates.append(finding('Possible embedded credential', 'medium', location,
                    'A secret-like variable is assigned a string literal.',
                    'Secret-like literal assignment detected. Value and variable name [REDACTED].',
                    'Verify whether this is an active secret; if so revoke it and use a secret store.',
                    'Literal may be a placeholder; validity and exposure have not been checked.'))
        if len(candidates) >= 100:
            break
    return candidates, [
        'Limited Python AST nomination: direct eval/exec, simple subprocess imports with literal shell=True, and secret-like literal assignments.',
        'Maximum 100 candidates; overflow is not analyzed. No execution, dependency audit, cross-file analysis, taint tracking, alias rebinding or exploit validation.',
        'No matches do not establish security; inspect authentication, authorization, tenant isolation and framework-specific behavior separately.'
    ]


def alert_candidates(content):
    try:
        events = json.loads(content)
    except (ValueError, RecursionError) as exc:
        raise ValueError('Alerts must be a valid JSON array.') from exc
    if not isinstance(events, list) or len(events) > 500:
        raise ValueError('Alerts must be a JSON array of at most 500 objects.')
    for event in events:
        if not isinstance(event, dict) or set(event) - {'event', 'actor', 'source_ip'}:
            raise ValueError('Alert objects accept only event, actor and source_ip fields.')
        bounded_text(event.get('event'), 'Alert event', 100)
        for field in ('actor', 'source_ip'):
            if field in event:
                bounded_text(event[field], f'Alert {field}', 200)
    counts = Counter((event.get('actor', '(unknown)'), event.get('source_ip', '(unknown)'))
                     for event in events if event['event'] == 'login_failed')
    candidates = []
    for (actor, source), count in counts.items():
        if count >= 5:
            candidates.append(finding('Repeated failed logins', 'medium', 'Submitted alert batch',
                'Five or more login_failed events share actor and source identifiers in this batch.',
                f'{count} matching failures; actor/source identifiers omitted to minimize retained log data.',
                'Check the time window, account ownership and MFA; correlate with successful logins.',
                'Batch events may be duplicated or span unrelated periods; no timestamp or identity validation.'))
    for label, title in (('privilege_change', 'Privilege change requires review'), ('malware_detected', 'Malware alert requires validation')):
        count = sum(event['event'] == label for event in events)
        if count:
            candidates.append(finding(title, 'high' if label == 'malware_detected' else 'medium',
                'Submitted alert batch', 'An event label calls for human security triage.',
                f'{count} {label} event(s); raw log and identity values omitted.',
                'Validate the sensor evidence, establish business context and follow the incident response runbook.',
                'Event labels are untrusted reports; authenticity, approval and actual compromise are unverified.'))
    skipped = sum(event['event'] not in ('login_failed', 'privilege_change', 'malware_detected') for event in events)
    return candidates, ['Limited batch correlation of login_failed, privilege_change and malware_detected labels.',
        f'{skipped} event(s) skipped because their labels are not supported by these local rules.',
        'No live telemetry, event authenticity checks, timestamp analysis, deduplication or malware analysis.',
        'Raw logs and actor/source identifiers are not retained; collect corroborating evidence in your controlled incident system.']


ROLE_PLANS = {
    'red': ('Adversary simulation', 'Evaluate scoped attack hypotheses against approved assets.',
            ['Confirm asset ownership, written scope, stop conditions and test window.',
             'Describe plausible attack paths and required access; use only isolated fixtures.',
             'Challenge each hypothesis against existing controls and submit evidence to the commander.'],
            'A scoped simulation plan with prerequisites, control checks and evidence requests.'),
    'blue': ('Defense and incident triage', 'Identify defensive evidence and proportionate response actions.',
             ['Establish baseline telemetry, asset criticality and incident ownership.',
              'Correlate candidate indicators with independent evidence and document competing explanations.',
              'Propose containment and detection changes for human approval; submit gaps for adjudication.'],
             'A triage checklist, proposed detections and response decision record.'),
    'white': ('Independent application review', 'Validate source-level candidates and document remediation.',
              ['Trace inputs through authentication, authorization and trust boundaries.',
               'Attempt to refute each candidate using validation, reachability and compensating controls.',
               'Record a verdict with evidence and a scoped regression test before declaring a fix.'],
              'An evidence-backed review ledger and remediation checklist.'),
    'black': ('Attacker-perspective laboratory', 'Model attacker objectives in an isolated, authorized training environment.',
              ['Use fictional targets or explicitly owned laboratory assets; document prohibited actions.',
               'Describe attacker incentives, prerequisites and boundary crossings without performing exploitation.',
               'Challenge the modeled path against mitigations; give defenders evidence requirements for adjudication.'],
              'A bounded threat model and tabletop scenario with defensive checkpoints.'),
    'purple': ('Joint control validation', 'Connect adversary hypotheses to observable detection and response outcomes.',
               ['Pair each hypothesis with a defensive owner and expected telemetry.',
                'Define an isolated exercise, measurable success criteria and benign evidence fixtures.',
                'Compare expected and observed signals; challenge attribution and adjudicate coverage gaps jointly.'],
               'A joint exercise plan and detection-coverage improvement backlog.'),
}


SCENARIOS = {
    'ransomware': {
        'keywords': ('ransomware', 'encrypt', 'extortion'),
        'red': ('Model a lab-only path from a fictional foothold to payroll encryption; define stop conditions before any simulation.', 'Ransomware attack-path worksheet and approved lab boundaries.'),
        'blue': ('Walk through endpoint isolation, incident declaration, backup integrity checks and restoration priorities without changing live systems.', 'Ransomware triage and recovery decision checklist.'),
        'white': ('Review least privilege, backup separation and restore evidence; challenge whether encryption paths remain reachable.', 'Backup-control and privilege review with requested evidence.'),
        'black': ('Model extortion incentives, access prerequisites and data exposure using fictional documents only.', 'Fictional extortion threat model with prevention checkpoints.'),
        'purple': ('Pair each modeled encryption stage with endpoint telemetry and a recovery exercise acceptance criterion.', 'Ransomware detection matrix and timed restore exercise plan.'),
    },
    'supply-chain': {
        'keywords': ('supply-chain', 'supply chain', 'third-party', 'dependency', 'package', 'vendor'),
        'red': ('Model how a fictional compromised package could cross a build-to-release boundary without introducing malicious code.', 'Supply-chain attack-path worksheet for an isolated fixture.'),
        'blue': ('Identify build logs, artifact provenance and release owners needed to corroborate a package-compromise report.', 'Package incident triage and release containment checklist.'),
        'white': ('Review dependency pinning, artifact signatures, build permissions and reproducibility evidence.', 'Dependency and build integrity review checklist.'),
        'black': ('Describe a fictional supplier adversary objective and required trust relationships; use no real poisoned packages.', 'Supplier threat model and trust-boundary inventory.'),
        'purple': ('Map a benign dependency-change fixture to build alerts, release gates and response owners.', 'Supply-chain control exercise with observable release gates.'),
    },
    'identity/phishing': {
        'keywords': ('phishing', 'identity', 'identities', 'credential', 'password', 'mfa', 'login'),
        'red': ('Model a fictional credential-capture-to-account-access path; use dummy identities and no messages to real users.', 'Authorized identity simulation outline with dummy-account boundaries.'),
        'blue': ('Identify authentication logs, MFA events and session revocation decisions needed for an account-takeover tabletop.', 'Identity incident triage and session containment checklist.'),
        'white': ('Review MFA enrollment, recovery flows, session expiry and privilege approval evidence.', 'Identity-control review and recovery-flow evidence requests.'),
        'black': ('Describe attacker incentives and prerequisites for a fictional account takeover without creating lures or collecting credentials.', 'Fictional account-takeover threat model.'),
        'purple': ('Map a benign failed-login fixture and dummy privilege change to detections and account recovery criteria.', 'Identity detection matrix and recovery exercise plan.'),
    },
    'cloud': {
        'keywords': ('cloud', 'aws', 'azure', 'gcp', 'bucket', 'kubernetes', 'iam'),
        'red': ('Model an isolated cloud trust-boundary crossing using a fictional role and test resource; prohibit production changes.', 'Cloud role-path worksheet and test-resource scope.'),
        'blue': ('Identify cloud audit logs, role-session provenance and resource ownership before proposing containment.', 'Cloud alert triage and role-containment decision checklist.'),
        'white': ('Review IAM policies, public exposure, secret access and tenant boundaries using supplied policy evidence.', 'Cloud policy and isolation review checklist.'),
        'black': ('Model fictional cloud-role abuse incentives and prerequisites without obtaining credentials or touching live resources.', 'Cloud trust-boundary threat model.'),
        'purple': ('Pair a benign test-role action with audit events, alert ownership and a rollback acceptance criterion.', 'Cloud control exercise with audit-log expectations.'),
    },
    'generic': {
        'keywords': (),
        'red': ('Select one fictional business asset and model a scoped adversary hypothesis with explicit prerequisites.', 'Generic adversary hypothesis and laboratory scope worksheet.'),
        'blue': ('Establish incident owners, business-critical assets and evidence collection priorities for the tabletop.', 'Business incident triage and escalation worksheet.'),
        'white': ('Inventory trust boundaries, approvals and compensating controls that an analyst must validate.', 'Business control evidence checklist.'),
        'black': ('Describe a fictional adversary objective and resource constraints using only approved tabletop facts.', 'Fictional business threat model.'),
        'purple': ('Connect one tabletop hypothesis to a detection owner, expected evidence and measurable response target.', 'Joint tabletop control validation worksheet.'),
    },
}


def scenario_category(content):
    """Keyword routing only; first matching category wins in the documented order."""
    lowered = content.casefold()
    for category, details in SCENARIOS.items():
        if any(re.search(r'\b' + re.escape(keyword) + r'\w*\b', lowered) for keyword in details['keywords']):
            return category
    return 'generic'


def analyze(payload):
    name = bounded_text(payload.get('name'), 'Name', 120)
    scope = bounded_text(payload.get('scope'), 'Scope', 2000)
    content = bounded_text(payload.get('content'), 'Content', 64000)
    workflow = payload.get('workflow')
    if workflow not in WORKFLOWS:
        raise ValueError('Choose code, alerts or exercise.')
    if payload.get('authorization') is not True:
        raise ValueError('Explicit scope authorization is required.')
    roles = payload.get('roles')
    if not isinstance(roles, list) or not 1 <= len(roles) <= 5 or any(not isinstance(r, str) or r not in ROLES for r in roles) or len(set(roles)) != len(roles):
        raise ValueError('Choose one to five distinct supported roles.')
    category = None
    if workflow == 'code':
        findings, coverage = code_candidates(content)
    elif workflow == 'alerts':
        findings, coverage = alert_candidates(content)
    else:
        category = scenario_category(content)
        findings, coverage = [], [f'Tabletop keyword routing selected category: {category}. Only this category is retained; raw scenario prose is discarded.',
                                  'First matching keyword category wins: ransomware, supply-chain, identity/phishing, cloud; otherwise generic. This is not semantic or model analysis.',
                                  'No vulnerability findings, live tests or control validation are produced.']
    missions = []
    for role in roles:
        title, objective, steps, deliverable = ROLE_PLANS[role]
        if workflow == 'exercise':
            scenario_step, deliverable = SCENARIOS[category][role]
            steps = [scenario_step] + steps
        elif workflow == 'code':
            steps = [f'Review the {len(findings)} unresolved ledger candidate(s); inspect the referenced snippet lines in your controlled source system and trace input reachability.'] + steps
        else:
            steps = ['Corroborate the alert ledger against original sensor records in your controlled system; establish timestamps, duplicates, actor ownership and approved changes before assigning impact.'] + steps
        missions.append(dict(role=role, title=title, objective=f'{objective} Workflow: {workflow}.',
                             steps=steps, deliverable=deliverable,
                             limitations=['Planning guidance only; requires a qualified analyst and separate approval for any live action.',
                                          'No role-specific executable agents, scanners or upstream security tools are running.']))
    return dict(id=uuid.uuid4().hex, name=redact(name), workflow=workflow, scope=redact(scope),
                created_at=now(), roles=roles, findings=findings, missions=missions,
                scenario_category=category,
                summary=f'{len(findings)} unresolved candidate(s) from limited local checks. Human validation is required; this is not a security certification.',
                coverage=coverage,
                activity=[dict(at=now(), action='created', note='Scope authorization attested; bounded local analysis completed. Raw submission discarded.')])


def markdown_export(assessment):
    # Escape markup and heading/list injection in user-authored fields.
    def safe(value):
        text = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return re.sub(r'([\\`*_{}\[\]()#+.!|>~-])', r'\\\1', text).replace('\n', ' ')
    lines = ['# Napolean Cyber Command assessment', '', f'Name: {safe(assessment["name"])}',
             f'Scope: {safe(assessment["scope"])}', f'Workflow: {assessment["workflow"]}',
             f'Created: {assessment["created_at"]}', '', safe(assessment['summary']), '', '## Evidence ledger']
    if assessment.get('scenario_category'):
        lines.insert(6, f'Scenario category: {assessment["scenario_category"]}')
    for item in assessment['findings']:
        lines += ['', f'### {safe(item["title"])}']
        for field in ('severity', 'confidence', 'verdict', 'location', 'root_cause', 'input_to_impact',
                      'prerequisites', 'mitigations', 'evidence', 'remediation', 'review_note'):
            lines.append(f'{field.replace("_", " ").title()}: {safe(item[field])}')
    lines += ['', '## Missions']
    for mission in assessment['missions']:
        lines += ['', f'### {mission["role"].title()}: {safe(mission["title"])}', safe(mission['objective'])]
        lines += [f'- {safe(step)}' for step in mission['steps']]
        lines += [f'Deliverable: {safe(mission["deliverable"])}']
        lines += [f'Limitation: {safe(limitation)}' for limitation in mission['limitations']]
    lines += ['', '## Coverage'] + [f'- {safe(item)}' for item in assessment['coverage']]
    lines += ['', '## Activity'] + [f'- {safe(item["at"])} {safe(item["action"])}: {safe(item["note"])}' for item in assessment['activity']]
    return '\n'.join(lines) + '\n'
