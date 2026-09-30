# Public SSO sign-in providers

Tec-Tac UI modules may contribute authentication choices before a user is signed in from their public UI entry point. Authenticated `register(context)` runs too late for login integration.

A module whose manifest exposes `public.entry` receives `ssoProviders` in `registerPublic(context)`. The module's job is limited to discovering which Tactical SSO provider should be offered and registering its **Tactical `provider_id` plus display metadata**. Core UI owns the actual sign-in handshake, callback and token exchange.

```js
export default {
  async registerPublic({ ssoProviders, publicApi }) {
    const provider = await publicApi('/api/global-settings/public/sso/provider/microsoft/')

    ssoProviders.register({
      id: 'global-settings.microsoft',
      label: provider.name || 'Microsoft 365',
      description: 'Sign in with the organisation Microsoft identity provider.',
      provider_id: provider.provider_id,
      order: 100,
    })
  },
}
```

## Tactical-native handshake

Tec-Tac deliberately mirrors Tactical's own SSO flow instead of inventing a parallel protocol:

1. Before redirecting, Core UI loads Tactical's `/_allauth/browser/v1/config/` with browser credentials. The selected `provider_id` must be present in `data.socialaccount.providers`.
2. Core UI submits an HTML `POST` form to Tactical's `/_allauth/browser/v1/auth/provider/redirect/` with:
   - `provider=<provider_id>`
   - `process=login`
   - `callback_url=<Tec-Tac frontend origin>/account/provider/callback`
   - `csrfmiddlewaretoken=<browser csrftoken cookie>`
3. Tactical/django-allauth owns the provider redirect and OIDC callback. After the provider succeeds, allauth has a temporary authenticated Django session and returns the browser to `/account/provider/callback`.
4. The Tec-Tac nginx integration redirects that exact frontend callback to `#/sso/callback`.
5. Core UI posts to Tactical's `/accounts/ssoproviders/token/` using `credentials: include` and `X-CSRFToken`. Tactical validates the pending SSO session, creates the Knox access token, records Tactical's successful SSO login audit and invalidates the temporary Django session.
6. Tec-Tac stores the returned Knox token inside Core UI code, verifies it against Tactical, then crosses `/api/tfd/ui/context/`. That applies Tec-Tac's normal session-security boundary and creates the standard `session_created` audit row for a new trusted session.

## Contract

- Provider IDs exposed to the UI must be namespaced to the module (`<module-id>.<provider>`).
- `provider_id` is Tactical's django-allauth provider identifier and is the preferred production registration path.
- Core owns placement on the Tec-Tac login screen.
- The published pre-0.12.77 `begin()` registration remains supported for backward compatibility when `provider_id` is absent. It is deprecated and receives only the non-secret initiation context.
- If a module supplies both `provider_id` and `begin()`, Core ignores the deprecated handler and uses Tactical's native allauth flow. A future public-contract major version may remove the legacy handler after module migration.
- Public modules must not own `/account/provider/callback`, post to `/_allauth/browser/v1/auth/provider/redirect/`, exchange `/accounts/ssoproviders/token/`, receive a Tactical access token, or inspect Tactical/Django authentication storage.
- Core validates the selected provider against Tactical's current allauth configuration immediately before starting the redirect.
- The public module never receives Tactical credentials, authenticated Core context, CSRF values, Django session state or Knox tokens.
- SSO accounts follow Tactical's SSO MFA model: the external identity provider owns their MFA lifecycle; Tec-Tac's local-TOTP enrollment gate is not substituted for it.
- Optional synchronous `visible(context)` may hide a provider when the module knows it is unavailable.
- Failed public module registration removes providers registered during that failed startup.
- Disabled or absent modules contribute no SSO providers.

This is the supported hook for the Global Settings module and future identity-provider modules.
