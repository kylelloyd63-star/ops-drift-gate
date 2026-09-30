# Contributing

Run `npm run check` and `npm run package-check` with Node 24+. Provider changes need concrete evidence fixtures, a weak-signal control, and review against realistic negative controls. Never execute fixture repositories or include real secrets. Keep the deterministic offline core free of runtime dependencies and telemetry.

Schema and security changes must explain their compatibility impact and fail-closed behavior. Retain failing adversarial cases; do not loosen tests to obtain a passing run. Report sensitive vulnerabilities without secret values or public exploitation details; see SECURITY.md.

Run repository scans in a fresh isolated, quiescent checkout before target scripts. The scanner detects observed mutations but does not establish an atomic filesystem sandbox. Keep provider-rule tests synthetic and reproducible; do not change an expected result without independent source evidence.
