# Tec-Tac UI 0.12.57

## Tracker closure: L69

- Clients & Sites now routes the client-change/site-search interaction through one production `createResourceSiteSearchCoordinator`.
- A client change cancels any pending site-search debounce, clears an active site search, triggers exactly one immediate site load, and suppresses only the synthetic watcher event caused by that clear.
- The next genuine operator search is never suppressed.
- The behavioral regression executes the same coordinator used by `ResourcesView.vue` and reproduces the exact watcher sequence that previously caused the duplicate request.

## Rebuild 2

- Fixed Clients & Sites client-change ordering so the cleared site search is applied before the immediate site load.
