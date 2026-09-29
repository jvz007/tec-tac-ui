# Tec-Tac UI 0.12.72

## F8 Core-owned SSO completion

Adds the Core-owned `/account/provider/callback` nginx bridge and `#/sso/callback` browser flow. Tec-Tac exchanges Tactical's pending SSO session with credentials and CSRF, stores the returned Knox token inside Core UI code, verifies it, crosses the normal `/api/tfd/ui/context/` session-security boundary, and only then loads the operational shell. Public modules remain initiation-only and never receive the token.

Requires Core 1.15.180 for the matching public contract.
