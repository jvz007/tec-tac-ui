# Tec-Tac UI 0.11.10

## Release integrity and workflow maintenance

- Root release-note retention now allows the current release note plus the immediately previous release note.
- `tests/release-integrity.sh` requires `RELEASE_NOTES_${VERSION}.md` to exist.
- The integrity test fails when more than two root `RELEASE_NOTES_*.md` files are present.
- Older release notes remain archived under `docs/releases/`.
- The UI GitHub release workflow now uses Node.js 24 via `actions/setup-node@v4`.
- Release workflow behaviour is otherwise unchanged: push to `main`, `workflow_dispatch`, version read from `VERSION`, existing-release guard, tests, Vite build, compiled UI ZIP, and release creation without a `v` prefix.
