# Tec-Tac UI 0.12.76

## F8 SSO done-when acceptance

No SSO production behavior changes in this release. The SSO acceptance now exercises the supported Global Settings flow behaviourally from provider contribution through external redirect initiation, the Core-owned Tactical/allauth callback exchange, Knox-token verification, and the final `/api/tfd/ui/context/` crossing. It asserts that public modules receive navigation context only, never Tactical/Core credentials, and that the token exchange uses the pending browser session plus CSRF.

The companion Core 1.15.185 test proves that the `/api/tfd/ui/context/` crossing applies the real `SessionAuthenticated` MFA policy and creates the standard `session_created` audit row for a new SSO trust session.

This release is unsigned.
