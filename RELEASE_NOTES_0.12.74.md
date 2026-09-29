# Tec-Tac UI 0.12.74

## D3 seamless restore acceptance

Recovery-signer trust from Backup & Restore now runs through a dedicated workflow used by the production view. The workflow confirms the exact key id and SHA-256 fingerprint shown to the operator, submits that exact signer identity to Core, waits for the asynchronous trust job, and only re-validates the selected backup after trust succeeds. Failed trust never re-validates.

The backup list and validation view continue to show source server, installation id, signer key, signer fingerprint and signing time.

Companion Core: 1.15.183.
