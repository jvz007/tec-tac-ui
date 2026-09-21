# Tec-Tac UI 0.11.11

- Keeps GitHub release-integrity validation focused on package/version/release-note correctness.
- Allows the current and immediately previous root release notes while requiring the current `VERSION` release note.
- Keeps the release workflow on Node.js 24.
- Preserves `npm test`, the Vite production build, compiled UI ZIP creation, existing-release detection, and non-`v` release tags.
