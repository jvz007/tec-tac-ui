# Tec-Tac UI 0.12.28

## Core Session Security administration

- Adds a **Session security** section inside the existing Access workspace for authorized server-maintenance administrators.
- Exposes the Core-owned session trust policy: idle timeout, absolute lifetime, IP-change handling, session auditing, activity heartbeat, and trusted reverse proxies.
- Shows the current Core trusted session and its enforced idle/absolute expiry state.
- Adds lazy-loaded trusted-session inspection by username with explicit Core-trust revocation. Tactical login-token revocation remains a separate existing Access workflow.
- Adds filterable Core session-security audit visibility and live diagnostics/counts.
- Uses the existing unsaved-change guard for policy edits and a Tec-Tac modal for revocation confirmation; no native browser confirmation dialog is introduced.
- Keeps Core authoritative for permission checks and validation. The UI is gated by the same server-maintenance capability used by Core session-security administration.

Requires Tec-Tac Framework `>=1.15.59-1,<2.0.0`.
