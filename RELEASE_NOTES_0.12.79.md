# Tec-Tac UI 0.12.79

## Release workflow test repair

- Replaces the stale F8/F10 source-markup assertion that still expected the pre-0.12.78 inline SSO button.
- The regression now checks the current component boundary and real click-to-`begin` behavior of `LoginSsoProviders`.
- Audited the UI test suite for other assertions tied to the moved SSO button markup; no additional stale references were found.
- No production SSO behavior changed from 0.12.78.

This release is the publishable successor to 0.12.78, whose GitHub release workflow stopped at the stale test.
