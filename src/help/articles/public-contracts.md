# Public Contracts

Public Contracts is the developer-facing registry of integration points modules may safely build against.

It includes Core Python contracts, capabilities, Scheduler actions, extension permissions, HTTP routes and browser runtime contribution registries.

## Optional integrations

Optional module integrations must degrade cleanly. The browser can use the module availability runtime for presentation decisions, while backend capability checks remain authoritative for execution and data access.

## Browser contracts

Current browser contracts include context actions, interactions, resource views, code editor services, dashboard widgets, Quick Actions, notifications, module availability and Help article contributions.
