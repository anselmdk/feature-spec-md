# Releasing

This package uses npm semver versions and bare git tags. Use `0.2.0`, not `v0.2.0`.

Bare semver tags are valid git tags and match the package version exactly. The `v` prefix is common in many projects because it makes tag names visually distinct from branch names, but npm does not require it. For this repository, exact package-version tags are simpler because the tag, `package.json`, `package-lock.json`, and npm version all use the same string.

## Release Candidate

Use an RC when you want a testable npm package for the next release without updating the `latest` npm dist-tag.

1. Make sure `main` contains the intended final version in `package.json` and `package-lock.json`.
   - For the next minor release from `0.1.1`, the base version should be `0.2.0`.
   - For the next major release from `0.2.0`, the base version should be `1.0.0`.
2. Open GitHub Actions.
3. Run the `Publish to npm` workflow from `main`.
4. Choose `rc` for the release type.
5. The workflow runs verification, changes the package version only inside the workflow to `<base>-rc.<run>.<attempt>`, and publishes it with the npm `rc` dist-tag.

Install the latest RC with:

```bash
npm install @anselmdk/feature-spec-md@rc
```

Install a specific RC with:

```bash
npm install @anselmdk/feature-spec-md@0.2.0-rc.123.1
```

Repeat the workflow as needed. Each run publishes a new RC and moves the `rc` dist-tag to that version.

## Stable Minor Release

Use this for backward-compatible features.

1. Start from a clean branch based on `main`.
2. Bump the package version:

   ```bash
   npm version minor --no-git-tag-version
   ```

3. Run verification locally:

   ```bash
   npm run verify
   npm run format
   ```

4. Open and merge a pull request containing the version bump and any release notes.
5. After the PR is merged, update local `main` and create a bare semver tag that exactly matches `package.json`:

   ```bash
   git checkout main
   git pull --ff-only
   git tag 0.2.0
   git push origin 0.2.0
   ```

6. Confirm the `Publish to npm` workflow succeeds.

The workflow validates that the tag is a stable semver version and exactly matches `package.json` before publishing to npm with the `latest` dist-tag.

## Stable Major Release

Use this for breaking changes.

1. Document the breaking changes in the release PR.
2. Bump the package version:

   ```bash
   npm version major --no-git-tag-version
   ```

3. Run verification locally:

   ```bash
   npm run verify
   npm run format
   ```

4. Open and merge the release PR.
5. Tag the merged commit with the exact version, for example:

   ```bash
   git checkout main
   git pull --ff-only
   git tag 1.0.0
   git push origin 1.0.0
   ```

6. Confirm the `Publish to npm` workflow succeeds.

## npm Publishing Setup

The publish workflows are ready for npm provenance. The best setup is npm trusted publishing with GitHub Actions OIDC, which avoids long-lived npm publish tokens.

On npmjs.com, configure this package with trusted publishing:

- Publisher: GitHub Actions
- Repository owner: `anselmdk`
- Repository name: `feature-spec-md`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

If trusted publishing is not configured yet, the workflow can still use the `NPM_TOKEN` repository secret. Keep RC and stable publishing in the same workflow because npm trusted publishing allows only one trusted publisher workflow per package.
