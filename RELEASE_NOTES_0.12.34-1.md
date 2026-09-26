# Tec-Tac UI 0.12.34-1

## Core Resource Directory scale pass

- Reworked Clients & Sites to use 50-row server-side pages instead of requesting up to 500 records at once.
- Client and site count badges now show API totals rather than only the number loaded in the browser.
- Added previous/next paging while retaining 300 ms debounced server search.
- Prevented stale client/site search responses from overwriting newer results.
- Removed the duplicate initial site fetch caused by mount plus selected-client watchers.
- Added a debounced, paged client lookup inside the site editor so moving a site still works without loading the entire client directory.
- Background refresh keeps populated tables visible while fresh data is fetched.

## Rebuild 1

- Regenerated the npm lock structure so all optional esbuild and Rollup platform packages referenced by Vite are represented in `package-lock.json`.
- This rebuild contains no functional UI change from 0.12.34.
- Verified the lock with `npm ci --package-lock-only --ignore-scripts --offline`.
