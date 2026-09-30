#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail(){ echo "[TEST] FAIL: $*" >&2; exit 1; }
USERS="${ROOT}/src/components/access/UsersPanel.vue"
RECOVERY="${ROOT}/src/components/access/MfaRecoveryPanel.vue"
ACCESS="${ROOT}/src/access.js"

grep -q 'getUserMfaRecovery' "${ACCESS}" || fail "admin MFA status API helper missing"
grep -q 'invalidateUserMfaBackupCodes' "${ACCESS}" || fail "admin MFA invalidation API helper missing"
grep -q '/api/tfd/access/users/${encodeURIComponent(userId)}/mfa/' "${ACCESS}" || fail "admin MFA endpoint path missing"
grep -q 'MFA & recovery' "${USERS}" || fail "user-detail MFA recovery section missing"
grep -q 'Backup codes</dt><dd>{{ mfaRecovery.status.configured' "${USERS}" || fail "backup-code state missing"
grep -q 'Invalidate backup codes' "${USERS}" || fail "backup-code invalidation control missing"
grep -q 'never lets an administrator generate or reveal another user' "${USERS}" || fail "admin recovery boundary copy missing"
grep -q 'Rotate backup codes' "${RECOVERY}" || fail "self-service rotation wording missing"
grep -q 'Rotation invalidates the current set' "${RECOVERY}" || fail "rotation consequence missing"

# UsersPanel must not import/call the self-service plaintext-code generator.
if grep -q 'generateMfaBackupCodes' "${USERS}"; then fail "Users admin panel must not generate another user's backup codes"; fi

echo '[TEST] PASS MFA recovery administration UI boundary'
