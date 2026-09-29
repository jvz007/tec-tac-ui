# Public SSO sign-in providers

Tec-Tac UI modules that need to contribute authentication choices before a user is signed in must do so from their public UI entry point. Authenticated `register(context)` runs too late for login integration.

A module whose manifest exposes `public.entry` receives `ssoProviders` in `registerPublic(context)`:

```js
export default {
  async registerPublic({ ssoProviders, addPublicRoute, publicApi }) {
    ssoProviders.register({
      id: 'global-settings.microsoft',
      label: 'Microsoft 365',
      description: 'Sign in with the organisation Microsoft identity provider.',
      icon: 'M',
      order: 100,
    }, async ({ return_to }) => {
      // The module owns provider discovery/initiation. Use its public route/API.
      window.location.href = `/tec-tac/public/global-settings/sso/microsoft?return_to=${encodeURIComponent(return_to)}`
    })
  },
}
```

## Contract

- Provider IDs must be namespaced to the module (`<module-id>.<provider>`).
- A provider must supply a label and a `begin(context)` handler.
- Core owns placement on the Tec-Tac login screen; modules must not alter `LoginPanel.vue` or inject arbitrary login DOM.
- The public module owns the actual SSO initiation/callback workflow and may use only the public APIs/routes available to `registerPublic(context)`.
- `begin()` receives `return_to` and the current browser location. It must not receive Tactical credentials or an authenticated Core context.
- Optional synchronous `visible(context)` can hide a provider when the module knows it is unavailable.
- If public module registration fails, Core removes any SSO providers registered by that module during the failed startup.
- Disabled or absent modules contribute no SSO providers.

This is the supported hook for the Global Settings module and any future identity-provider module.
