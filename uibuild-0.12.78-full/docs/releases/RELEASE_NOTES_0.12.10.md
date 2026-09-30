# Tec-Tac UI 0.12.10

## Module package signature visibility

- adds `.sig` and `.release.json` companions to Module Manager package intake instead of discarding them as unsupported files;
- sends signed-package companions to Framework 1.15.36 using the Core `signature` and `metadata` multipart fields;
- keeps unsigned normal modules supported and explicitly labels unsigned intake as allowed under the current transitional signing policy;
- shows Core package-trust results after inspection, including verified/unsigned state, publisher, publisher ID, key ID, algorithm, environment, package SHA-256, and publisher permissions;
- blocks malformed local intake combinations before upload, such as a signature without release metadata or sidecars accompanying multiple packages;
- keeps invalid, mismatched, revoked, or otherwise rejected signatures fail-closed in Core, with the returned inspection error shown by the existing Modules error surface;
- includes forward-compatible trust fields in installed-module and lifecycle-detail views when Core exposes persisted provenance there.
