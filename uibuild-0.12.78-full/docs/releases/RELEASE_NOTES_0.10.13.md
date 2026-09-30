# Tec-Tac UI 0.10.13

- Fixes **Open in new tab** for navigation entries by constructing an explicit absolute Tec-Tac hash URL.
- Preserves and replays the initial authenticated hash target after dynamic module routes finish registering.
- Prevents the core catch-all route from permanently redirecting fresh tabs for dynamic module pages to the Tec-Tac overview.
- Retains per-user menu ordering, Favorites, cache invalidation, lifecycle progress, context actions/interactions, and authenticated raw/file module APIs.
