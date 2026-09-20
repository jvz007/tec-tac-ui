# Tec-Tac UI 0.11.4

## Access roles workspace refresh

- Reworked the Roles & permissions workspace into a compact two-pane editor with a stronger selected-role state.
- Added a role summary header with assigned-user, Tactical-grant, extension-grant and total-grant counts.
- Added Overview, Tactical permissions and Extension permissions tabs to reduce vertical clutter.
- Added permission search and an enabled-only filter.
- Tactical permission groups are now collapsible and show enabled/total counts with quick Select all / Clear actions.
- Extension permissions are grouped by module/group with enabled/total counts and compact technical permission codes.
- Added a cleaner role settings overview and superuser warning treatment.
- Reworked the sticky action bar for clearer saved/unsaved state, discard, save and delete actions.
- Preserved the existing Tactical role and Tec-Tac extension permission APIs and unsaved-change workflow; no backend changes are required.
