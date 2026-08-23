# Release-evidence templates

These files define the minimum envelope for independently reviewed evidence.
Copy a template only after the referenced test or approval has actually been
completed. Store private dumps, logs, credentials, screenshots containing
personal data, and raw test artifacts outside Git; commit only sanitized hashes,
counts, conclusions, and private references.

A template, example, locally generated informational report, or self-approval
cannot close a release gate. The release candidate must also be a clean,
immutable Git revision, the reviewer must differ from the operator, and
`Artifact-SHA256` must identify the exact private bundle that was reviewed.
