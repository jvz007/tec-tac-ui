# Public SSO sign-in providers

Tec-Tac UI modules may contribute authentication choices before a user is signed in from their public UI entry point. Authenticated `register(context)` runs too late for login integration.

A module whose manifest exposes `public.entry` receives `ssoProviders` in `registerPublic(context)`. The module may discover a provider and initiate Tactical/allauth SSO, but **Core owns the callback and token exchange**.

```js
export default {
  async registerPublic({ ssoProviders, publicApi }) {
    ssoProviders.register({
      id: 'global-settings.microsoft',
      label: 'Microsoft 365',
      description: 'Sign in with the organisation Microsoft identity provider.',
      order: 100,
    }, async () => {
      const provider = await publicApi('/api/global-settings/public/sso/provider/microsoft/')
      // Initiate the provider redirect only. Tactical/allauth must use the fixed
      // callback URL: `${location.origin}/account/provider/callback`.
      window.location.assign(provider.begin_url)
    })
  },
}
```

## Contract

- Provider IDs must be namespaced to the module (`<module-id>.<provider>`).
- A provider supplies a label and a `begin(context)` handler.
- Core owns placement on the Tec-Tac login screen.
- Public modules may initiate SSO only. They **must not own `/account/provider/callback`**, exchange `/accounts/ssoproviders/token/`, receive a Tactical access token, or inspect Tactical/Django authentication storage.
- Tactical/allauth must return the browser to `/account/provider/callback`. The Tec-Tac nginx integration redirects that exact callback to `#/sso/callback`.
- The Core callback exchanges Tactical's pending SSO session using the browser's session cookie and CSRF token, stores the returned Knox token, verifies it, then crosses `/api/tfd/ui/context/` before loading the operational shell. That establishes the normal Tec-Tac session-security boundary and creates the standard `session_created` audit row for a new trusted session.
- SSO accounts follow Tactical's SSO MFA model: the external identity provider owns their MFA lifecycle; Tec-Tac's local-TOTP enrollment gate is not substituted for it.
- `begin()` receives navigation context only; it never receives Tactical credentials, authenticated Core context, CSRF values or tokens.
- Optional synchronous `visible(context)` may hide a provider when the module knows it is unavailable.
- Failed public module registration removes providers registered during that failed startup.
- Disabled or absent modules contribute no SSO providers.

This is the supported hook for the Global Settings module and future identity-provider modules.
