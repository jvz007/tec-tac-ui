# Tec-Tac UI 0.12.64

Module-development contract catalog release. Requires Core 1.15.170.

## Static browser contract catalog
- Public Contracts now renders the Core-provided `browser` catalog separately from live runtime registrations.
- Module developers can discover stable browser services even when no installed module currently contributes an action, widget, view or SSO provider.
- Browser contracts are searchable by contract ID, phase, service, operation, audience, purpose and canonical documentation path.
- Live context actions/interactions, resource views, widgets, Quick Actions and Help registrations remain visible in their existing runtime sections.

## Documentation integrity
- Regression coverage verifies the canonical UI documentation targets referenced by the browser catalog exist in the UI source tree.

## Core compatibility
- Minimum Core is `>=1.15.170,<2.0.0` so the Public Contracts page can rely on the `browser` catalog payload.

## Regression coverage
- `tests/browser-contract-catalog-0.12.64.mjs`
- complete inherited `npm test` suite
