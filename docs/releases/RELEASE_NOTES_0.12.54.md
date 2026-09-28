# Tec-Tac UI 0.12.54

## Summary

Prevents a slower hotfix-history request for a previously selected module from replacing the hotfix list or error state for the module currently selected in Module Management.

## Changes

- Added `module-hotfix-loader.js`, using the shared latest-request generation gate plus the selected module identity.
- `ModulesView.vue` now commits hotfix rows and hotfix-list errors only when the request still belongs to the currently selected module.
- Clearing the module selection and unmounting Module Management invalidate in-flight hotfix-list requests.
- Added a behavioral regression that completes module B before module A and verifies both stale success and stale error results from A are discarded.

## Compatibility

No backend contract or route changes.
