# Tec-Tac UI 0.12.62

Feature completion for tracker items F8-F10.

## F8 - public SSO sign-in hooks

- Public UI modules now receive a module-scoped `ssoProviders` registry from `registerPublic(context)`.
- Providers register namespaced sign-in choices that Core renders on the Tec-Tac login screen.
- The provider module owns initiation/callback behavior through its existing public route/API boundary; Core never exposes Tactical credentials to the provider hook.
- Partial SSO registrations are removed when public module registration fails.

## F9 - authenticated module header slot

- Authenticated modules now receive a module-scoped `header` registry from `register(context)`.
- Modules can contribute compact Vue components to the Core top bar with ordering, optional permission gating, visibility predicates and resolved props.
- Core renders at most six module header contributions and clears partial registrations when module startup fails.
- This is the supported surface for global module UI such as the Alerts bell.

## F10 - Clients & Sites module context actions

- The Core-owned Clients & Sites view now consumes the established `contextActions` placements `client.context-menu` and `site.context-menu`.
- Action execution receives the standard resource/selection context and honors permission, visibility, enabled-state and dangerous-action semantics from the shared registry.
- Providers continue to own backend authorization and business logic.

## Regression coverage

- `tests/extension-hooks-0.12.62.mjs` exercises SSO provider registration/initiation/cleanup, header permission/order/bounds/cleanup and client/site context action discovery/execution.
- The complete inherited UI test suite passes.
