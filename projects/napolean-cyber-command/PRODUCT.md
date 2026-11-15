# Veyra Security Workbench

<!-- impeccable:product-schema 1 -->

## Platform
web

Veyra is a browser-local security assessment workbench for analysts reviewing authorized Python snippets, structured alert logs, or exercise scenarios. Analysts inspect pattern-nominated candidates, record evidence and decisions, track remediation, maintain role workbooks, and prepare reports.

The five perspectives are human checklists. The interface does not run AI agents, execute submitted source, run attacks, certify security, or independently verify analyst attestations. Samples remain explicitly fictional and never grant authorization.

Records live in IndexedDB for the current browser profile and site origin. Raw source, alerts, and scenario input are not retained. Backups, restore previews, historical snapshots, revision checks, and recovery guidance remain functional. Browser storage is neither a shared team database nor a server backup.

## Constraints

- Preserve workflow IDs, storage keys, analysis rules, record schemas, and existing local behavior.
- No new dependencies, external font requests, fabricated results, or relaxed Content Security Policy.
- Root index.html and static/index.html offer equivalent UI through their respective asset paths.
- Preserve accessible labels, focus management, native dialogs, conditional evidence fields, reduced motion, mobile inputs, and printable report content.
- Audience: working security analysts who need readable evidence and explicit decision status during repeated daily use.

The user requested the security product rename after rejecting literal circular logos. Veyra is the implementation choice; its descriptor is Security workbench. Existing storage and backup identifiers remain compatible with Napolean Cyber Command.
