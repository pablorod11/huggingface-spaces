/* Original bounded role and scenario guidance shared with the reference engine. */
(function (root, factory) {
  'use strict';
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CyberPlaybooks = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
  "roles": {
    "red": [
      "Adversary simulation",
      "Evaluate scoped attack hypotheses against approved assets.",
      [
        "Confirm asset ownership, written scope, stop conditions and test window.",
        "Describe plausible attack paths and required access; use only isolated fixtures.",
        "Challenge each hypothesis against existing controls and submit evidence to the commander."
      ],
      "A scoped simulation plan with prerequisites, control checks and evidence requests."
    ],
    "blue": [
      "Defense and incident triage",
      "Identify defensive evidence and proportionate response actions.",
      [
        "Establish baseline telemetry, asset criticality and incident ownership.",
        "Correlate candidate indicators with independent evidence and document competing explanations.",
        "Propose containment and detection changes for human approval; submit gaps for adjudication."
      ],
      "A triage checklist, proposed detections and response decision record."
    ],
    "white": [
      "Independent application review",
      "Validate source-level candidates and document remediation.",
      [
        "Trace inputs through authentication, authorization and trust boundaries.",
        "Attempt to refute each candidate using validation, reachability and compensating controls.",
        "Record a verdict with evidence and a scoped regression test before declaring a fix."
      ],
      "An evidence-backed review ledger and remediation checklist."
    ],
    "black": [
      "Attacker-perspective laboratory",
      "Model attacker objectives in an isolated, authorized training environment.",
      [
        "Use fictional targets or explicitly owned laboratory assets; document prohibited actions.",
        "Describe attacker incentives, prerequisites and boundary crossings without performing exploitation.",
        "Challenge the modeled path against mitigations; give defenders evidence requirements for adjudication."
      ],
      "A bounded threat model and tabletop scenario with defensive checkpoints."
    ],
    "purple": [
      "Joint control validation",
      "Connect adversary hypotheses to observable detection and response outcomes.",
      [
        "Pair each hypothesis with a defensive owner and expected telemetry.",
        "Define an isolated exercise, measurable success criteria and benign evidence fixtures.",
        "Compare expected and observed signals; challenge attribution and adjudicate coverage gaps jointly."
      ],
      "A joint exercise plan and detection-coverage improvement backlog."
    ]
  },
  "scenarios": {
    "ransomware": {
      "keywords": [
        "ransomware",
        "encrypt",
        "extortion"
      ],
      "red": [
        "Model a lab-only path from a fictional foothold to payroll encryption; define stop conditions before any simulation.",
        "Ransomware attack-path worksheet and approved lab boundaries."
      ],
      "blue": [
        "Walk through endpoint isolation, incident declaration, backup integrity checks and restoration priorities without changing live systems.",
        "Ransomware triage and recovery decision checklist."
      ],
      "white": [
        "Review least privilege, backup separation and restore evidence; challenge whether encryption paths remain reachable.",
        "Backup-control and privilege review with requested evidence."
      ],
      "black": [
        "Model extortion incentives, access prerequisites and data exposure using fictional documents only.",
        "Fictional extortion threat model with prevention checkpoints."
      ],
      "purple": [
        "Pair each modeled encryption stage with endpoint telemetry and a recovery exercise acceptance criterion.",
        "Ransomware detection matrix and timed restore exercise plan."
      ]
    },
    "supply-chain": {
      "keywords": [
        "supply-chain",
        "supply chain",
        "third-party",
        "dependency",
        "package",
        "vendor"
      ],
      "red": [
        "Model how a fictional compromised package could cross a build-to-release boundary without introducing malicious code.",
        "Supply-chain attack-path worksheet for an isolated fixture."
      ],
      "blue": [
        "Identify build logs, artifact provenance and release owners needed to corroborate a package-compromise report.",
        "Package incident triage and release containment checklist."
      ],
      "white": [
        "Review dependency pinning, artifact signatures, build permissions and reproducibility evidence.",
        "Dependency and build integrity review checklist."
      ],
      "black": [
        "Describe a fictional supplier adversary objective and required trust relationships; use no real poisoned packages.",
        "Supplier threat model and trust-boundary inventory."
      ],
      "purple": [
        "Map a benign dependency-change fixture to build alerts, release gates and response owners.",
        "Supply-chain control exercise with observable release gates."
      ]
    },
    "identity/phishing": {
      "keywords": [
        "phishing",
        "identity",
        "identities",
        "credential",
        "password",
        "mfa",
        "login"
      ],
      "red": [
        "Model a fictional credential-capture-to-account-access path; use dummy identities and no messages to real users.",
        "Authorized identity simulation outline with dummy-account boundaries."
      ],
      "blue": [
        "Identify authentication logs, MFA events and session revocation decisions needed for an account-takeover tabletop.",
        "Identity incident triage and session containment checklist."
      ],
      "white": [
        "Review MFA enrollment, recovery flows, session expiry and privilege approval evidence.",
        "Identity-control review and recovery-flow evidence requests."
      ],
      "black": [
        "Describe attacker incentives and prerequisites for a fictional account takeover without creating lures or collecting credentials.",
        "Fictional account-takeover threat model."
      ],
      "purple": [
        "Map a benign failed-login fixture and dummy privilege change to detections and account recovery criteria.",
        "Identity detection matrix and recovery exercise plan."
      ]
    },
    "cloud": {
      "keywords": [
        "cloud",
        "aws",
        "azure",
        "gcp",
        "bucket",
        "kubernetes",
        "iam"
      ],
      "red": [
        "Model an isolated cloud trust-boundary crossing using a fictional role and test resource; prohibit production changes.",
        "Cloud role-path worksheet and test-resource scope."
      ],
      "blue": [
        "Identify cloud audit logs, role-session provenance and resource ownership before proposing containment.",
        "Cloud alert triage and role-containment decision checklist."
      ],
      "white": [
        "Review IAM policies, public exposure, secret access and tenant boundaries using supplied policy evidence.",
        "Cloud policy and isolation review checklist."
      ],
      "black": [
        "Model fictional cloud-role abuse incentives and prerequisites without obtaining credentials or touching live resources.",
        "Cloud trust-boundary threat model."
      ],
      "purple": [
        "Pair a benign test-role action with audit events, alert ownership and a rollback acceptance criterion.",
        "Cloud control exercise with audit-log expectations."
      ]
    },
    "generic": {
      "keywords": [],
      "red": [
        "Select one fictional business asset and model a scoped adversary hypothesis with explicit prerequisites.",
        "Generic adversary hypothesis and laboratory scope worksheet."
      ],
      "blue": [
        "Establish incident owners, business-critical assets and evidence collection priorities for the tabletop.",
        "Business incident triage and escalation worksheet."
      ],
      "white": [
        "Inventory trust boundaries, approvals and compensating controls that an analyst must validate.",
        "Business control evidence checklist."
      ],
      "black": [
        "Describe a fictional adversary objective and resource constraints using only approved tabletop facts.",
        "Fictional business threat model."
      ],
      "purple": [
        "Connect one tabletop hypothesis to a detection owner, expected evidence and measurable response target.",
        "Joint tabletop control validation worksheet."
      ]
    }
  }
};
});
