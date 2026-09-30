# Tec-Tac UI 0.12.78

## F8 SSO closure

- Preserves backward compatibility with the published `ui.public.sso-providers` contract: legacy module `begin()` handlers still register and run when `provider_id` is absent.
- When a module supplies both `provider_id` and `begin()`, Core uses Tactical's native allauth flow and ignores the deprecated module handler instead of removing the provider.
- Extracts the production login SSO buttons into the shared `LoginSsoProviders` component used by `LoginPanel.vue`.
- Adds an integration regression that loads a real public test module through `loadPublicUiModules`, renders the production SSO button, clicks it, follows Tactical's native allauth redirect form, completes `/accounts/ssoproviders/token/`, verifies the Knox token, and crosses `/api/tfd/ui/context/`.
- Documents `provider_id` as the preferred contract and `begin()` as a deprecated compatibility path until a future public-contract major version.

This build is unsigned.
