# Tec-Tac UI 0.10.10

Adds the Core-owned `contextInteractions` browser runtime registry for safe cross-module drag/drop contributions. Modules can publish provider-namespaced interactions by surface, source type and target type with optional permission and `canDrop` gating. Module-scoped ownership prevents one provider from unregistering another provider's interactions, and failed module registration clears partial contributions. Public Contracts now enumerates the live interaction registry.

Retains 0.10.9 lifecycle progress bars and the five-second post-success reload countdown, 0.10.8 context actions, 0.10.7 cache invalidation, and 0.10.6 dynamic-module cache/route ownership hardening.
