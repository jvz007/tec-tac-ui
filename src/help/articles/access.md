# Access

Access management uses Tactical identities and roles together with Tec-Tac extension permissions.

## Authority

Tactical remains the authority for users, authentication and native role permissions. Tec-Tac attaches extension permissions to the same role identities rather than maintaining a second user database.

## Changes

Role editing protects unsaved changes. If you try to navigate away with pending edits, Tec-Tac asks whether to save, discard or stay.

## Security boundary

UI visibility is not authorization. Backend permission checks remain authoritative even when an action is hidden or disabled in the browser.
