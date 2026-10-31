# Reference review and design decisions

Reviewed on October 16, 2026. These public references informed presentation and scope. The synthetic data, reconciliation rules, and business scenario were created for this portfolio case study. No employer data or employer assignment is represented.

- [GitHub frontend-project topic](https://github.com/topics/frontend-project): verified public discovery page. Adaptation: a responsive, readable case study with direct navigation and inspectable evidence. Individual topic listings are not evidence for the reconciliation methodology.
- [go-gorm/gorm](https://github.com/go-gorm/gorm): verified Go ORM repository. The supplied `go-gorm/daisyui` URL could not be verified during review and appears to combine two different projects. The canonical daisyUI repository is [saadeghi/daisyui](https://github.com/saadeghi/daisyui). Adaptation: consistent controls, semantic status labels, and readable tables; neither Go nor an ORM is required for this local SQL project.
- [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design): verified diagram-design reference. Adaptation: a sparse source-to-exception flow, limited accent colors, thin rules, and clearly labeled connections. Diagrams explain lineage rather than decorate the page. No external diagram library is required.
- [jasontaylordev/CleanArchitecture](https://github.com/jasontaylordev/CleanArchitecture): verified ASP.NET Core solution template. Adaptation: separate source fixtures, SQL business rules, execution/export, and acceptance tests. The full application framework would add unnecessary scope, so it is not adopted.
- [GitHub system-design-project topic](https://github.com/topics/system-design-project): verified public discovery page. Adaptation: document inputs, outputs, component boundaries, and assumptions. This batch case study makes no distributed-scale or production-readiness claims.
- [liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes): verified system-design study notes, including payment-system and monitoring topics. Adaptation: explicitly state record identities, reconciliation cutoffs, repeatability, and exception ownership. These notes are background inspiration rather than an authoritative billing policy.
- [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer): verified system-design learning repository. Adaptation: organize the explanation around requirements and assumptions, a high-level flow, core rules, and tradeoffs. Add infrastructure only when the workload requires it.

## Deliberate scope

The deliverable runs locally with its documented runtime and uses synthetic fixtures. SQL and exported evidence are the core of the project. The presentation reports potential exposure separately from realized loss or savings. Power BI, authentication, a hosted backend, and external services are outside this case study's current scope. Nothing has been published.

The recommendations above are our adaptations of the references, not claims that the references prescribe this particular reconciliation design. No referenced repository code or assets have been copied into the deliverable.
