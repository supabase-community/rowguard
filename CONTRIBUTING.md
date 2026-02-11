# Contributing to `rowguard`

Thank you for your interest in contributing to `rowguard`! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Testing Your Changes](#testing-your-changes)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Getting Started

`rowguard` is a TypeScript DSL for defining PostgreSQL Row Level Security (RLS) policies. Before contributing, please:

1. Read the [README.md](./README.md) to understand the project's scope and goals
2. Read our [Code of Conduct](https://github.com/supabase/.github/blob/main/CODE_OF_CONDUCT.md)
3. Check existing [issues](https://github.com/supabase-community/rowguard/issues) and [pull requests](https://github.com/supabase-community/rowguard/pulls) to avoid duplicate work

## Development Setup

### Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: Latest version (we use pnpm 10.x)
- **Supabase CLI**: For running integration tests (optional)

### Installation

1. Fork and clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/rowguard.git
cd rowguard
```

2. Install dependencies:

```bash
pnpm install
```

3. Build the project to verify setup:

```bash
pnpm run build
```

## Project Structure

```text
rowguard/
├── src/                          # Source code
│   ├── builder/                  # Policy builder API
│   ├── conditions/               # Column conditions and operators
│   ├── context/                  # Auth and session context functions
│   ├── subquery/                 # Subquery support
│   ├── templates/                # Pre-built policy templates
│   ├── types/                    # TypeScript type definitions
│   └── index.ts                  # Public API exports
├── tests/                        # Unit tests
│   ├── unit/                     # Unit tests for all components
│   └── integration/              # Integration tests with real database
├── demo/                         # Interactive demo site (Vite + React)
│   ├── src/                      # Demo application source
│   └── vercel.json               # Vercel deployment config
├── scripts/                      # Build and test scripts
├── dist/                         # Compiled output (generated)
├── .github/workflows/            # CI/CD configuration
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.ts              # Test configuration
├── eslint.config.js              # Linting configuration
└── typedoc.json                  # Documentation generation config
```

## Development Workflow

### Building

Build the library for distribution:

```bash
pnpm run build
```

This compiles TypeScript and generates type definitions.

### Linting

Run ESLint to check for code issues:

```bash
pnpm run lint
```

### Type Checking

Run TypeScript type checking without emitting files:

```bash
pnpm run type-check
```

Note: Type checking is done automatically during the build process.

### Demo Site

The demo site lets you interactively test the DSL:

```bash
# Development mode (hot reload)
pnpm run demo:dev

# Build demo for production
pnpm run demo:build

# Preview production build
pnpm run demo:preview
```

The demo is automatically deployed to Vercel on every PR.

## Testing

### Unit Tests

Run unit tests with Vitest:

```bash
pnpm test
```

Watch mode for test-driven development:

```bash
pnpm test:watch
```

Run with coverage:

```bash
pnpm test:coverage
```

### Integration Tests

Integration tests run against a real Supabase database using the Supabase CLI:

```bash
# Start Supabase (required first time)
pnpm run supabase:start

# Run integration tests
pnpm run test:integration

# Run full integration test suite (with automatic Supabase lifecycle)
pnpm run test:integration:full
```

The integration tests:

1. Create real RLS policies in a test database
2. Test them with actual SQL queries
3. Verify the generated SQL is valid and functional

### Writing Tests

- Unit tests go in `tests/unit/` mirroring the structure of `src/`
- Use descriptive test names that explain the behavior being tested
- Test both the happy path and error cases
- Follow existing test patterns for consistency
- For new features, always add both unit and integration tests

Example test structure:

```typescript
import { describe, it, expect } from 'vitest';
import { policy, column, auth } from '../src';

describe('Policy Builder', () => {
  it('should generate correct SQL for user ownership', () => {
    const p = policy('user_docs')
      .on('documents')
      .read()
      .when(column('user_id').eq(auth.uid()));

    expect(p.toSQL()).toContain('CREATE POLICY');
    expect(p.toSQL()).toContain('user_id = auth.uid()');
  });
});
```

## Testing Your Changes

Before submitting a PR, test your changes thoroughly:

### 1. Local Testing

```bash
# Run all tests
pnpm test

# Run integration tests
pnpm run test:integration:full

# Build to ensure no compilation errors
pnpm build
```

### 2. Test in the Demo

```bash
# Run the demo locally
pnpm run demo:dev
```

Try your changes in the interactive demo to ensure they work as expected.

### 3. Preview Package (pkg-pr-new)

Every PR automatically publishes a preview package via [pkg-pr-new](https://pkg.pr.new). After you open a PR:

1. Wait for the "Publish Any Commit" workflow to complete
2. A bot will comment with the package URL
3. You or reviewers can test the package:

```bash
npm install https://pkg.pr.new/supabase-community/rowguard@{pr-number}
```

This lets you test the actual published package before it's released.

### 4. Vercel Preview Deployment

Every PR also deploys a preview of the demo site to Vercel:

1. Wait for Vercel bot to comment on your PR
2. Click the preview URL to test your changes live
3. Share the URL with reviewers to demonstrate new features

This is especially useful for:

- Visual/UI changes in the demo
- New DSL features that can be demonstrated interactively
- Getting feedback from non-technical reviewers

## Code Style

### TypeScript Guidelines

- Use **strict TypeScript** - all code must pass type checking
- Prefer **interfaces** for public APIs, **types** for unions/intersections
- Export types that consumers might need
- Use **explicit return types** on public methods
- Avoid `any` - use `unknown` if type is truly unknown
- Prefer **immutability** - avoid mutating objects

### Naming Conventions

- **Classes**: PascalCase (e.g., `PolicyBuilder`)
- **Interfaces/Types**: PascalCase (e.g., `ColumnCondition`)
- **Functions/Methods**: camelCase (e.g., `toSQL`)
- **Constants**: UPPER_SNAKE_CASE for true constants (e.g., `DEFAULT_OPERATION`)
- **Private members**: prefix with underscore or use private keyword

### Documentation

- All public APIs must have **TSDoc comments**
- Include `@param`, `@returns`, `@throws`, and `@example` tags where appropriate
- Examples in TSDoc should be runnable code
- Keep documentation concise but informative

Example:

````typescript
/**
 * Creates a new RLS policy with the specified name.
 *
 * @param name - The unique name for this policy
 * @returns A policy builder instance for method chaining
 *
 * @example
 * ```typescript
 * const p = policy('user_documents')
 *   .on('documents')
 *   .read()
 *   .when(column('user_id').eq(auth.uid()));
 * ```
 */
export function policy(name: string): PolicyBuilder;
````

### Error Handling

- Throw descriptive errors for invalid inputs
- Use TypeScript's type system to prevent errors at compile time
- Validate at builder construction time when possible
- Provide helpful error messages with context

## Submitting Changes

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for automated releases. Format:

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature (triggers minor version bump)
- `fix`: Bug fix (triggers patch version bump)
- `docs`: Documentation changes only
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `ci`: CI/CD configuration changes

**Breaking changes:**

- Use `feat!:` or `fix!:` for breaking changes (triggers major version bump)
- Or include `BREAKING CHANGE:` in the commit footer

**Examples:**

```bash
feat: add support for array operators in conditions
fix: handle null values correctly in column comparisons
feat(templates): add role-based policy template
docs: update README with subquery examples
test: add integration tests for complex policies
feat!: change policy builder API to use method chaining

BREAKING CHANGE: policy builder now requires explicit operation type
```

### Pull Request Process

1. **Create a branch** from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** following the guidelines above

3. **Run checks** locally:

   ```bash
   pnpm run lint
   pnpm test
   pnpm run test:integration:full
   pnpm build
   ```

4. **Commit** using conventional commit format:

   ```bash
   git commit -m "feat: add support for XYZ"
   ```

5. **Push** to your fork:

   ```bash
   git push origin feat/my-feature
   ```

6. **Open a Pull Request** with:
   - Clear title following conventional commit format
   - Description of what changed and why
   - Reference any related issues (e.g., "Fixes #123")
   - Screenshots/examples if adding user-facing features
   - Link to Vercel preview if demo changes are included

7. **Test preview deployments**:
   - Check the pkg-pr-new package works correctly
   - Test the Vercel preview deployment if applicable
   - Update the PR description with any testing notes

8. **Respond to feedback** - maintainers may request changes

9. **Wait for CI** - all tests must pass before merging

### PR Guidelines

- Keep PRs focused - one feature or fix per PR
- Update documentation if you change public APIs
- Add tests for new functionality
- Ensure all CI checks pass
- Test your changes using the preview package and Vercel deployment
- Rebase on `main` if needed to resolve conflicts
- Be responsive to review feedback

### PR Review Checklist

Before requesting review, ensure:

- [ ] All tests pass locally
- [ ] New code has tests
- [ ] Public APIs have TSDoc comments
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Demo works if applicable
- [ ] README updated if adding new features
- [ ] Conventional commit format used

## Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases. You don't need to manually manage versions or changelogs.

For detailed information, see [RELEASE.md](./RELEASE.md).

### How It Works

1. **You commit** using conventional commit format (see above)

2. **release-please creates/updates a release PR** automatically when changes are pushed to `main`
   - Updates version in `package.json`
   - Updates `CHANGELOG.md`
   - Generates release notes

3. **Maintainer merges the release PR** when ready to release
   - Creates a GitHub release and git tag
   - Automatically publishes to npm with provenance

### Version Bumps

Versions follow [Semantic Versioning](https://semver.org/):

- **Major (1.0.0 → 2.0.0)**: Breaking changes (`feat!:`, `fix!:`, or `BREAKING CHANGE:`)
- **Minor (1.0.0 → 1.1.0)**: New features (`feat:`)
- **Patch (1.0.0 → 1.0.1)**: Bug fixes (`fix:`)

Commits with types like `docs:`, `test:`, `chore:` don't trigger releases on their own.

### For Maintainers Only

Publishing is fully automated via GitHub Actions:

1. Merge the release-please PR when ready
2. GitHub Actions will automatically publish to npm with provenance
3. No manual `npm publish` needed

## Questions?

- Open an [issue](https://github.com/supabase-community/rowguard/issues) for bugs or feature requests
- Check existing issues and PRs before creating new ones
- Tag your issues appropriately (`bug`, `enhancement`, `documentation`, etc.)
- Join the [Supabase Discord](https://discord.supabase.com) for discussions

## License

By contributing to `rowguard`, you agree that your contributions will be licensed under the MIT License.
