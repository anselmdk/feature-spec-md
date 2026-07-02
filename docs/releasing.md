# Releasing

This package uses npm semver versions and bare git tags. Use `0.2.0`, not `v0.2.0`.

Bare semver tags are valid git tags and match the package version exactly. The `v` prefix is common in many projects because it makes tag names visually distinct from branch names, but npm does not require it. For this repository, exact package-version tags are simpler because the tag, `package.json`, `package-lock.json`, and npm version all use the same string.

## Release Candidate

Use an RC when you want a testable npm package for the next release without updating the `latest` npm dist-tag or permanently changing the repository version.

1. Make sure `main` contains the intended stable base version in `package.json` and `package-lock.json`.
   - For a release candidate for `0.2.1`, the base version should be `0.2.1`.
   - For a release candidate for `0.3.0`, the base version should be `0.3.0`.
2. Open GitHub Actions.
3. Run the `Publish RC to npm` workflow from `main`.
4. Keep the RC number at `1` for the first release candidate, or increase it manually for later candidates.
5. The workflow runs verification, changes the package version only inside the workflow to `<base>-rc.<number>`, publishes it with the npm `rc` dist-tag, and writes the published version to the run summary.

Install the latest RC with:

```bash
npm install @anselmdk/feature-spec-md@rc
```

Install a specific RC with:

```bash
npm install @anselmdk/feature-spec-md@0.2.1-rc.1
```

Repeat the workflow as needed. Increase the RC number for each published candidate so npm receives a unique version, for example `0.2.1-rc.2`, and the workflow moves the `rc` dist-tag to that version.

## Stable Release

Use a stable release when you want to publish the next package version to the npm `latest` dist-tag.

1. Open GitHub Actions.
2. Run the `Publish Stable to npm` workflow from `main`.
3. Choose the version bump:
   - `patch`, for example `0.2.1` -> `0.2.2`.
   - `minor`, for example `0.2.1` -> `0.3.0`.
   - `major`, for example `0.2.1` -> `1.0.0`.
4. The workflow runs verification, bumps `package.json` and `package-lock.json`, commits the release version, creates a bare semver git tag, pushes the commit and tag, publishes the package with the npm `latest` dist-tag, and writes the published version to the run summary.

You do not need to manually run `npm version`, edit `package.json`, edit `package-lock.json`, or create a git tag for stable releases. The workflow does that for you.

Install the latest stable version with:

```bash
npm install @anselmdk/feature-spec-md@latest
```

Install the exact version reported by the workflow summary, for example:

```bash
npm install @anselmdk/feature-spec-md@0.2.2
```

## npm Publishing Setup

The publish workflows are ready for npm provenance. If you publish with an npm token, keep the `NPM_TOKEN` repository secret configured.

If you use npm trusted publishing instead of `NPM_TOKEN`, configure npmjs.com for the workflow files that publish this package:

- Publisher: GitHub Actions
- Repository owner: `anselmdk`
- Repository name: `feature-spec-md`
- Workflow filename: `publish-rc.yml` for RC publishing
- Workflow filename: `publish-stable.yml` for stable publishing
