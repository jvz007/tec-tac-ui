# UI 0.12.80

## AD-3 seamless restore

- Backup & Restore no longer exposes recovery-signer trust or fingerprint actions.
- Backup inventory shows source server, installation ID, backup date and Core version.
- Restore validation shows whether the adjacent SHA-256 companion verified the archive or whether an older backup is `not_verified`.
- Missing SHA-256 companions are clearly warned but do not block restore; mismatches remain a Core-side hard failure.
- Restore confirmation shows source provenance, Core transition and integrity status.

Unsigned source delivery.
