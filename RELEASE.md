# Release Process

This document explains how releases are managed for `rowguard`.

## Overview

Releases are fully automated using [release-please](https://github.com/googleapis/release-please), a Google-maintained GitHub Action that automates changelog generation, version management, and npm publishing.

## How It Works

### 1. Commit with Conventional Commits

When you commit to the `main` branch, use [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature (triggers **minor** version bump)
- `fix`: Bug fix (triggers **patch** version bump)
- `docs`: Documentation changes only (no release)
- `test`: Adding or updating tests (no release)
- `chore`: Maintenance tasks, dependency updates (no release)
- `refactor`: Code changes that neither fix bugs nor add features (no release)
- `perf`: Performance improvements (triggers **patch** version bump)
- `ci`: CI/CD configuration changes (no release)

**Breaking changes:**

- Use `feat!:` or `fix!:` for breaking changes (triggers **major** version bump)
- Or include `BREAKING CHANGE:` in the commit footer

**Examples:**

```bash
feat: add support for array operators
fix: handle null values in column conditions
feat(templates): add role-based policy template
docs: update README with new examples
test: add integration tests for subqueries
feat!: change policy builder API

BREAKING CHANGE: policy builder now requires explicit operation type
```

### 2. Release-Please Creates a Release PR

After you push commits to `main`, release-please will automatically:

1. **Analyze your commits** using conventional commit messages
2. **Calculate the next version** based on the commit types:
   - `feat:` → Minor version bump (0.1.0 → 0.2.0)
   - `fix:` → Patch version bump (0.1.0 → 0.1.1)
   - `feat!:` or `BREAKING CHANGE:` → Major version bump (0.1.0 → 1.0.0)
3. **Create or update a release PR** that includes:
   - Version bump in `package.json`
   - Auto-generated `CHANGELOG.md` with all changes
   - Release notes formatted from commit messages

The release PR is titled something like: `chore(main): release 0.2.0`

### 3. Merge the Release PR

When you're ready to publish a new version:

1. **Review the release PR** - check the changelog and version bump
2. **Merge the release PR** to `main`

That's it! The rest is automatic.

### 4. Automatic Publishing

Once the release PR is merged, the [release workflow](.github/workflows/release.yml) automatically:

1. **Creates a Git tag** (e.g., `v0.2.0`)
2. **Creates a GitHub Release** with the changelog
3. **Builds the package** (`pnpm build`)
4. **Publishes to npm** with:
   - Public access
   - [Provenance](https://docs.npmjs.com/generating-provenance-statements) via OIDC (trusted publishing)
   - No need for npm tokens - uses GitHub's OIDC provider

## Version Bumping Rules

We follow [Semantic Versioning](https://semver.org/):

| Commit Type                                    | Version Change | Example       |
| ---------------------------------------------- | -------------- | ------------- |
| `feat:`                                        | Minor          | 0.1.0 → 0.2.0 |
| `fix:`, `perf:`                                | Patch          | 0.1.0 → 0.1.1 |
| `feat!:`, `fix!:`, `BREAKING CHANGE:`          | Major          | 0.1.0 → 1.0.0 |
| `docs:`, `test:`, `chore:`, `refactor:`, `ci:` | None           | No release    |

### Pre-1.0 Behavior

For versions before 1.0.0, the project is configured with:

- `bump-minor-pre-major: true` - `feat:` commits bump minor version (0.1.0 → 0.2.0)
- `bump-patch-for-minor-pre-major: false` - Breaking changes still bump major (0.x.x → 1.0.0)

After 1.0.0, standard semver rules apply.

## Testing Before Release

### Preview Packages (pkg-pr-new)

Every PR automatically publishes a preview package via [pkg-pr-new](https://pkg.pr.new). Users can test your changes before they're released:

```bash
npm install https://pkg.pr.new/supabase-community/rowguard@{commit-sha}
```

The package URL is posted as a comment on each PR.

### Demo Site (Vercel)

Every PR also deploys a preview of the demo site to Vercel. Check the Vercel bot comment on your PR for the preview URL.

## Troubleshooting

### Release PR Not Created

If a release PR isn't created after merging to `main`, check:

1. **Are your commits using conventional format?** (`feat:`, `fix:`, etc.)
2. **Are there only non-release commits?** (`docs:`, `test:`, `chore:` don't trigger releases on their own)
3. **Check GitHub Actions** - look for errors in the [release workflow](https://github.com/supabase-community/rowguard/actions/workflows/release.yml)

### Failed Publishing

If the release is created but publishing fails:

1. **Check the GitHub Actions logs** for the failed workflow
2. **Verify npm publishing is configured** - the repository needs npm trusted publishing set up
3. **Check for build errors** - the package must build successfully

## Manual Intervention (Maintainers Only)

In rare cases, you might need to manually intervene:

### Fixing a Bad Release

If a release was published with issues:

1. **DO NOT delete tags or releases** - this breaks users who already installed
2. **Publish a patch release** with the fix:
   ```bash
   git commit -m "fix: correct issue from previous release"
   git push origin main
   ```
3. Update the release notes on GitHub to note the issue

### Skipping Release-Please

If you need to bypass release-please (extremely rare):

1. **Manually update** `package.json` and `CHANGELOG.md`
2. **Update** `.release-please-manifest.json` with the new version
3. **Create a git tag** manually and push it
4. **Run `npm publish`** manually (requires npm access)

This should only be done in exceptional circumstances.

## For Maintainers

### Repository Setup

The release process requires:

1. **npm Trusted Publishing** configured for the repository
   - Go to npm → package settings → Publishing access → configure Trusted Publishing
   - Add GitHub Actions as a trusted publisher

2. **GitHub Actions permissions**
   - The release workflow needs `contents: write` to create releases
   - The release workflow needs `id-token: write` for OIDC publishing
   - These are configured in [`.github/workflows/release.yml`](.github/workflows/release.yml)

3. **Protected main branch**
   - Recommended: require PRs for all changes to `main`
   - This ensures all commits are reviewed before release

### Release Schedule

There's no fixed release schedule. Releases happen when:

1. **Features are ready** - maintainers merge the release PR when features are stable
2. **Critical bugs are fixed** - can release quickly by merging the release PR
3. **Breaking changes are finalized** - coordinate major version bumps

## Questions?

For questions about the release process:

- Open an [issue](https://github.com/supabase-community/rowguard/issues)
- Check the [release-please documentation](https://github.com/googleapis/release-please)
- Review recent [releases](https://github.com/supabase-community/rowguard/releases) to see the format
