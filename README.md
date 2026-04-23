# Rowguard - RLS Policy DSL

[![npm version](https://img.shields.io/npm/v/rowguard.svg?style=flat-square)](https://www.npmjs.com/package/rowguard)
[![Docs](https://img.shields.io/badge/docs-API%20Reference-blue?logo=readthedocs)](https://supabase-community.github.io/rowguard/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![pkg.pr.new](https://pkg.pr.new/badge/supabase-community/rowguard)](https://pkg.pr.new/~/supabase-community/rowguard)

One line per authorization pattern. Maximum performance by default.

A TypeScript DSL for defining PostgreSQL Row Level Security (RLS) policies — with a template system that covers the most common patterns in a single call, a typed API for compile-time validation, and performance optimizations applied automatically.

> **Warning:** This is an experimental project and not an official Supabase library. Use with caution in production.

## Interactive Demo

Try the live demo at https://rowguard-demo.vercel.app/

### Live Policy Testing (Migration-Based Workflow)

The demo includes live database testing using the real Supabase migration workflow:

- **Save as Migration Files** - Generate timestamped migration files from your policies
- **Apply with Supabase CLI** - Use standard `supabase db reset` to apply migrations
- **Browse Database Schema** - View all tables and columns from your local instance
- **Test as Different Users** - Sign in as test users to verify RLS enforcement
- **Verify in Real-Time** - See exactly which rows each user can access with RLS active

Run the full demo locally with database:

```bash
pnpm install
pnpm demo:dev:full  # Starts Supabase + demo
```

Or run in SQL-only mode (no database):

```bash
pnpm demo:dev
```

The demo source code is in the [`demo/`](./demo) directory. See [demo/README.md](./demo/README.md) for detailed setup instructions.

## Features

- **One-liner templates** — `owned`, `shared`, `membership`, `tenant`, `role`, `immutable`, `admin`, `open`
- **Type-safe schema integration** — autocomplete and compile-time validation with Supabase-generated types
- **Performance by default** — `(SELECT auth.uid())` initPlan caching and `TO authenticated` on every policy, automatically
- **Idempotent SQL** — `DROP POLICY IF EXISTS` before every `CREATE POLICY`; safe to re-run
- **Zero dependencies** — pure TypeScript, works everywhere
- **Universal** — Node.js, Deno, Bun, browsers, edge functions

## Installation

```bash
npm install rowguard
```

```bash
# pnpm
pnpm add rowguard

# yarn
yarn add rowguard

# bun
bun add rowguard
```

### Testing Unreleased Features

Preview builds are available via [pkg-pr-new](https://pkg.pr.new) for each PR/commit:

```bash
# Install a preview build from a PR (check pkg.pr.new badge for latest URL)
npm install https://pkg.pr.new/supabase-community/rowguard@{pr-number}
```

## Quick Start

### Option 1: Type-Safe (Recommended)

Generate types from your Supabase schema, then get autocomplete and compile-time validation for every table and column name.

#### Step 1: Generate Database Types

```bash
# For remote project
npx supabase gen types typescript --project-id "$PROJECT_REF" > database.types.ts

# For local development
npx supabase gen types typescript --local > database.types.ts
```

#### Step 2: Use the Typed API

```typescript
import { createRowguard, policiesToSQL } from 'rowguard';
import type { Database } from './database.types';

const rg = createRowguard<Database>();

const sql = policiesToSQL([
  ...rg.policies.owned({ tables: ['posts', 'comments'] }),
  ...rg.policies.shared({ tables: ['projects'], publicColumn: 'is_public' }),
  ...rg.policies.membership({ tables: ['projects'], via: 'project_members', key: 'project_id' }),
  ...rg.policies.tenant({ tables: ['invoices', 'orders'] }),
  ...rg.policies.role({ tables: ['admin_logs'], is: 'admin' }),
  ...rg.policies.open({ tables: ['announcements'] }),
]);
// → ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
// → DROP POLICY IF EXISTS ... (idempotent)
// → CREATE POLICY ...
```

### Option 2: Without Type Generation

```typescript
import { policies, policiesToSQL } from 'rowguard';

const sql = policiesToSQL([
  ...policies.owned({ tables: ['posts', 'comments'] }),
  ...policies.tenant({ tables: ['invoices'] }),
]);
```

## Template Reference

| Template | Purpose | Default TO |
|---|---|---|
| `owned` | User owns every row (full CRUD) | `authenticated` |
| `shared` | Owner writes; public can read via flag column | `authenticated` |
| `membership` | Access via join table (e.g. project members) | `authenticated` |
| `tenant` | Hard tenant isolation (RESTRICTIVE) + owner CRUD | `authenticated` |
| `role` | JWT claim or roles table check | `authenticated` |
| `immutable` | Append-only rows (INSERT only, no UPDATE/DELETE) | `authenticated` |
| `admin` | Admin bypass (no TO restriction by default) | *(none — all roles)* |
| `open` | Public read | `public` |

### `owned`

Full CRUD restricted to the row owner. Generates four policies (SELECT, INSERT, UPDATE, DELETE).

```typescript
policies.owned({ tables: ['posts', 'comments'] })
policies.owned({ tables: ['posts'], userColumn: 'author_id', operations: ['SELECT', 'UPDATE'] })
```

### `shared`

Owner has full write access; any user can read rows where a boolean flag column is true.

```typescript
policies.shared({ tables: ['documents'], publicColumn: 'is_public' })
```

### `membership`

Access granted through a join table. Useful for team/project membership patterns.

```typescript
policies.membership({
  tables: ['projects'],
  via: 'project_members',
  key: 'project_id',
})
```

### `tenant`

Creates a RESTRICTIVE isolation policy (tenant boundary cannot be bypassed) plus per-operation owner policies.

```typescript
policies.tenant({ tables: ['invoices', 'orders'] })
policies.tenant({ tables: ['invoices'], column: 'org_id', ownerPolicies: false })
```

### `role`

Checks a JWT claim or a roles table. Defaults to checking `auth.jwt() ->> 'user_role'`.

```typescript
policies.role({ tables: ['admin_logs'], is: 'admin', operations: ['SELECT'] })
policies.role({ tables: ['reports'], is: ['editor', 'admin'], via: { table: 'user_roles' } })
```

### `immutable`

Append-only rows. Allows INSERT; blocks UPDATE and DELETE. Optionally adds a SELECT policy for the owner.

```typescript
policies.immutable({ tables: ['audit_log'], allowRead: true })
```

### `admin`

Admin bypass — no `TO` role restriction applied by default, so all database roles can match.

```typescript
policies.admin({ tables: ['admin_settings'], is: 'admin' })
```

### `open`

Public SELECT access (no authentication required).

```typescript
policies.open({ tables: ['announcements', 'pricing'] })
```

## Type Safety

`createRowguard<Database>()` narrows all template configs to your actual schema:

```typescript
const rg = createRowguard<Database>();

// table names autocomplete; typos are compile errors
rg.policies.owned({ tables: ['posts'] });

// column names autocomplete; they're validated against the table
rg.policies.shared({ tables: ['docs'], publicColumn: 'is_public' });

// membership.key autocompletes to columns of the via table specifically
rg.policies.membership({ tables: ['projects'], via: 'project_members', key: 'project_id' });

// @ts-expect-error — 'nonexistent' is not a column of 'project_members'
rg.policies.membership({ tables: ['projects'], via: 'project_members', key: 'nonexistent' });

// the fluent builder also narrows to your schema
rg.policy('user_documents')
  .on('documents')       // ← autocomplete for all table names
  .read()
  .when(rg.column('documents', 'user_id').eq(rg.auth.uid()));
//              ↑ autocomplete columns of 'documents'
```

## Performance by Default

Two optimizations are applied automatically to every generated policy:

**`(SELECT auth.uid())` instead of `auth.uid()`** — PostgreSQL evaluates `auth.uid()` once per query (initPlan) instead of once per row. In benchmarks this produces a 94.97% speedup on large tables.

**`TO authenticated` on every policy** — unauthenticated (anon) queries skip policy evaluation entirely rather than evaluating a condition that returns false for every row. Benchmark result: 99.78% speedup for anon traffic.

Both are applied by default. No configuration needed.

## `policiesToSQL` / `applyPolicies`

```typescript
import { policiesToSQL, applyPolicies, enableRLS } from 'rowguard';

// Generate SQL string (for migration files)
const sql = policiesToSQL(builders); // idempotent by default

// Apply directly to a database client
await applyPolicies(builders, client); // runs in a transaction

// Just ENABLE RLS on tables
enableRLS(['posts', 'comments', 'projects']);
```

## Policy Builder

For custom policies that go beyond the templates, the fluent builder is available directly:

```typescript
import { policy, column, auth, from, session } from 'rowguard';

policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').eq(auth.uid()));

policy('project_access')
  .on('projects')
  .read()
  .when(
    column('is_public')
      .eq(true)
      .or(column('user_id').eq(auth.uid()))
      .or(column('organization_id').eq(session.get('app.org_id', 'uuid')))
  );

policy('member_access')
  .on('projects')
  .read()
  .when(
    column('id').in(
      from('project_members')
        .select('project_id')
        .where(column('user_id').eq(auth.uid()))
    )
  );
```

### Policy Builder API

```typescript
policy(name)
  .on(table)                    // Target table
  .read()                       // Allow reading (SELECT)
  .write()                      // Allow creating (INSERT)
  .update()                     // Allow updating (UPDATE)
  .delete()                     // Allow deleting (DELETE)
  .all()                        // Allow all operations (ALL)
  .for(operation)               // SELECT | INSERT | UPDATE | DELETE | ALL
  .to(role?)                    // Optional role restriction
  .when(condition)              // USING clause (read filter)
  .allow(condition)             // Type-safe USING/WITH CHECK based on operation
  .withCheck(condition)         // WITH CHECK clause (write validation)
  .requireAll()                 // All policies must pass (RESTRICTIVE)
  .allowAny()                   // Any policy can grant access (PERMISSIVE, default)
  .restrictive()                // Mark as RESTRICTIVE
  .permissive()                 // Mark as PERMISSIVE (default)
  .toSQL()                      // Generate PostgreSQL statement
```

### Column Conditions

```typescript
column('status').eq('active');
column('age').gt(18);
column('price').lte(100);

column('email').like('%@company.com');
column('name').ilike('john%');

column('status').in(['active', 'pending']);
column('tags').contains(['important']);

column('deleted_at').isNull();
column('verified_at').isNotNull();

column('user_id').isOwner();       // eq(auth.uid())
column('is_public').isPublic();    // eq(true)

column('user_id')
  .eq(auth.uid())
  .or(column('is_public').eq(true))
  .and(column('status').eq('active'));
```

### Subqueries

```typescript
import { column, from, auth } from 'rowguard';

column('id').in(
  from('project_members')
    .select('project_id')
    .where(column('user_id').eq(auth.uid()))
);

column('id').in(
  from('projects', 'p')
    .select('p.id')
    .join('members', column('m.project_id').eq('p.id'), 'inner', 'm')
    .where(column('m.user_id').eq(auth.uid()))
);
```

### Context Functions

```typescript
auth.uid();                     // Current authenticated user
session.get(key, type);         // Type-safe session variable
currentUser();                  // Current database user
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details on:

- Setting up your development environment
- Running tests and building the project
- Code style guidelines
- How to submit pull requests
- Testing your changes with preview deployments

### Quick Start for Contributors

```bash
# Install dependencies
pnpm install

# Build the library
pnpm run build

# Run tests
pnpm test

# Run integration tests (requires Supabase CLI)
pnpm run test:integration:full

# Run the interactive demo
pnpm run demo:dev
```

For more detailed information, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Release Process

This project uses automated releases via [release-please](https://github.com/googleapis/release-please).

- All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format
- Releases are automatically published to npm when maintainers merge the release PR
- For detailed information, see [RELEASE.md](./RELEASE.md)

## Documentation

- **[API Reference](https://supabase-community.github.io/rowguard/)** - Full API documentation
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute to the project
- **[Release Process](./RELEASE.md)** - How releases are managed

## License

MIT - see [LICENSE](./LICENSE) file for details
