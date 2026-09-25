# Tec-Tac UI 0.12.27

## Resource Directory management

- Adds a Core Resource Directory administration view for clients and sites.
- Supports scoped client and site search/listing through the Core resource APIs.
- Adds create/edit client workflows gated by `core.resources.clients.manage`.
- Adds create/edit site workflows gated by `core.resources.sites.manage`.
- Keeps backend RBAC and Tactical scope checks authoritative; API denials and conflicts are surfaced to the operator.
- Agents remain read-only and resource deletion is intentionally not exposed in this release.
