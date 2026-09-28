# Tec-Tac UI 0.12.36

## Active login-session scaling

- Access > Login Sessions now consumes 50-row server-side pages instead of loading the complete active Tactical Knox session inventory.
- Added total/page state and Previous/Next navigation.
- Username/IP search is now server-side and debounced by 300 ms.
- Existing rows remain visible while a page or filter refresh is in progress.
- Revocation reloads the current valid page and safely falls back when deleting the last row on the final page.
- Added UI regression coverage for the paged active-session contract.

## Compatibility

No route or permission change. The UI requires the additive paged active-session response introduced by Core 1.15.83.
