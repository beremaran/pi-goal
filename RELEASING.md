# Releasing

This document is for maintainers.

## GitHub release

1. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`.
2. Run `npm ci`, `npm run check`, and `npm pack --dry-run`.
3. Merge the release commit into `main`.
4. Create a GitHub release whose tag exactly matches `v<package version>`:

   ```bash
   gh release create v0.1.1 --generate-notes
   ```

The release workflow validates the tag, runs the checks, and publishes the
package to npm when npm trusted publishing has been configured.

## One-time npm setup

Configure GitHub Actions as a trusted publisher for `@beremaran/pi-goal`:

- Organization or user: `beremaran`
- Repository: `pi-goal`
- Workflow filename: `publish.yml`
- Environment: leave blank

No long-lived npm token should be committed to this repository.
