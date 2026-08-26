# Release-evidence templates

These files define the minimum envelope for solo-developer self-reviewed evidence.
Copy a template only after the referenced test or approval has actually been
completed. Store private dumps, logs, credentials, screenshots containing
personal data, and raw test artifacts outside Git; commit only sanitized hashes,
counts, conclusions, and private references.

A template, example, or locally generated informational report cannot close a
development-readiness gate. The release candidate must be a clean, immutable
Git revision, the operator must explicitly record that independent review was
not performed, and `Artifact-SHA256` must identify the exact private bundle that
was self-reviewed. This process never authorizes production activation.

Templates are generated from the executable artifact registry with
`npm.cmd run release:generate-evidence-templates`. A generated template includes
the exact suite ID, authorized role choices, allowed environment choices, and
artifact-specific state fields. Generation never creates executed evidence.
