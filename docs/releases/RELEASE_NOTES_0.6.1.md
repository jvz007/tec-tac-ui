# Tec-Tac UI 0.6.1

Module visibility precedence hotfix.

- UI module synchronization now resolves visibility as: operator override -> package default -> visible.
- The generated navigation descriptor is normalized to the resolved visibility, so a package that defaults hidden can be explicitly shown later.
- Existing Hide/Show controls remain unchanged.
