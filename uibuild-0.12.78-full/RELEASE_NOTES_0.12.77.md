# Tec-Tac UI 0.12.77

## F8 Tactical-native SSO handshake

SSO initiation now mirrors Tactical RMM's native django-allauth flow instead of delegating the redirect to a public module. Global Settings or another public identity module registers only Tactical's `provider_id` and display metadata. Core UI validates that provider against Tactical's `/_allauth/browser/v1/config/`, then submits the same browser form Tactical uses to `/_allauth/browser/v1/auth/provider/redirect/` with `process=login`, the fixed `/account/provider/callback` frontend return URL and the browser CSRF proof.

After django-allauth returns, the existing Core-owned callback exchanges the temporary Tactical Django session through `/accounts/ssoproviders/token/`, verifies the returned Knox token and crosses `/api/tfd/ui/context/` for the normal Tec-Tac session-security and audit boundary. Public modules do not receive the CSRF value, Django session or Knox token.

A new behavioural regression drives the production provider registry and API helpers through config discovery, the exact form fields, callback token exchange, Tactical token verification and Core context establishment.

This release is unsigned.
