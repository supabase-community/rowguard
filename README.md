# Rowguard - RLS Policy DSL

[![npm version](https://img.shields.io/npm/v/rowguard.svg?style=flat-square)](https://www.npmjs.com/package/rowguard)
[![Docs](https://img.shields.io/badge/docs-API%20Reference-blue?logo=readthedocs)](https://supabase-community.github.io/rowguard/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![pkg.pr.new](https://pkg.pr.new/badge/supabase-community/rowguard)](https://pkg.pr.new/~/supabase-community/rowguard)

A TypeScript DSL for defining PostgreSQL Row Level Security (RLS) policies with a clean, type-safe API.

> **⚠️ Experimental:** This is an experimental project and not an official Supabase library. Use with caution in production.
>
> **⚠️ No Performance Evaluation:** This library does not evaluate policy performance. You should use [Supabase Performance Advisor](https://supabase.com/docs/guides/database/performance) to evaluate your RLS policy performance.

## Interactive Demo

Try the live demo at https://rowguard-demo.vercel.app/

### 🆕 Live Policy Testing (Migration-Based Workflow)

The demo now includes **live database testing** using the real Supabase migration workflow:

- 📁 **Save as Migration Files** - Generate timestamped migration files from your policies
- 🔄 **Apply with Supabase CLI** - Use standard `supabase db reset` to apply migrations
- 📊 **Browse Database Schema** - View all tables and columns from your local instance
- 👥 **Test as Different Users** - Sign in as test users to verify RLS enforcement
- ✅ **Verify in Real-Time** - See exactly which rows each user can access with RLS active

This teaches you the **real Supabase development workflow** - the same way you'll deploy policies to production!

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

- **Type-safe schema integration** - Autocomplete and compile-time validation with Supabase-generated types
- Simple & intuitive fluent API that reads like natural language
- Natural left-to-right method chaining (no polish notation)
- Zero dependencies - pure TypeScript, works everywhere
- Full TypeScript support with intelligent inference
- Universal - Node.js, Deno, Bun, browsers, edge functions
- Minimal footprint, tree-shakeable

## Installation

Install via npm:

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

### Option 1: Type-Safe Policies (Recommended) 💡

Get autocomplete and compile-time validation by generating types from your database schema.

#### Step 1: Generate Database Types

```bash
# For remote project
npx supabase gen types typescript --project-id "$PROJECT_REF" > database.types.ts

# For local development
npx supabase gen types typescript --local > database.types.ts
```

#### Step 2: Use Typed API

```typescript
import { createRowguard } from 'rowguard';
import { Database } from './database.types';

const rg = createRowguard<Database>();

// ✅ Autocomplete for tables and columns
const userDocsPolicy = rg
  .policy('user_documents')
  .on('documents') // ← IDE shows all table names
  .read()
  .when(rg.column('documents', 'user_id').eq(rg.auth.uid()));
//             ↑ autocomplete    ↑ autocomplete columns

// ❌ Type errors caught at compile time
// rg.column('documents', 'nonexistent_column')  // TypeScript error
// rg.column('documents', 'user_id').eq(42)      // Type error: string !== number

console.log(userDocsPolicy.toSQL());
```

**Benefits:**

- ✅ Autocomplete for tables and columns
- ✅ Catch typos at compile time
- ✅ Type-safe value comparisons
- ✅ Safe refactoring

### Option 2: Without Type Generation

If you don't have a Supabase project or prefer not to generate types:

```typescript
import { policy, column, auth, from, session } from 'rowguard';

// Simple user ownership (using user-focused API)
const userDocsPolicy = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').eq(auth.uid()));

// Complex conditions with method chaining
const complexPolicy = policy('project_access')
  .on('projects')
  .read()
  .when(
    column('is_public')
      .eq(true)
      .or(column('user_id').eq(auth.uid()))
      .or(column('organization_id').eq(session.get('app.org_id', 'uuid')))
  );

// Subqueries
const memberPolicy = policy('member_access')
  .on('projects')
  .read()
  .when(
    column('id').in(
      from('project_members')
        .select('project_id')
        .where(column('user_id').eq(auth.uid()))
    )
  );

console.log(userDocsPolicy.toSQL());
```

⚠️ **Note**: Without generated types, you won't get autocomplete or compile-time validation.

### Policy Templates (Works with both APIs)

```typescript
import { policies } from 'rowguard';

const [policy] = policies.userOwned('documents', 'SELECT');
const tenantPolicy = policies.tenantIsolation('tenant_data');
const publicPolicy = policies.publicAccess('projects');
```

## User-Focused vs RLS-Focused API

This library provides two API styles:

**User-Focused API (Recommended)** - Uses intuitive terms like `read()`, `write()`, `update()`, `requireAll()`:

```typescript
policy('user_docs')
  .on('documents')
  .read() // Instead of .for('SELECT')
  .requireAll() // Instead of .restrictive()
  .when(column('user_id').isOwner());
```

**RLS-Focused API** - Uses PostgreSQL RLS terminology like `for('SELECT')`, `restrictive()`:

```typescript
policy('user_docs')
  .on('documents')
  .for('SELECT') // RLS terminology
  .restrictive() // RLS terminology
  .when(column('user_id').isOwner());
```

Both APIs are fully supported and produce identical SQL. The user-focused API is recommended for better readability and developer experience.

## API Reference

### Policy Builder

```typescript
policy(name)
  .on(table)                    // Target table
  .read()                       // User-focused: allow reading (SELECT)
  .write()                      // User-focused: allow creating (INSERT)
  .update()                     // User-focused: allow updating (UPDATE)
  .delete()                     // User-focused: allow deleting (DELETE)
  .all()                        // User-focused: allow all operations (ALL)
  // Or use RLS-focused API:
  .for(operation)               // SELECT | INSERT | UPDATE | DELETE | ALL
  .to(role?)                    // Optional role restriction
  .when(condition)              // USING clause (read filter)
  .allow(condition)             // Type-safe USING/WITH CHECK based on operation
  .withCheck(condition)         // WITH CHECK clause (write validation)
  .requireAll()                 // User-focused: all policies must pass (RESTRICTIVE)
  .allowAny()                   // User-focused: any policy can grant access (PERMISSIVE, default)
  // Or use RLS-focused API:
  .restrictive()                // Mark as RESTRICTIVE
  .permissive()                 // Mark as PERMISSIVE (default)
  .description(text)            // Add documentation
  .toSQL()                      // Generate PostgreSQL statement
```

### Column Conditions

```typescript
// Comparisons
column('status').eq('active');
column('age').gt(18);
column('price').lte(100);

// Pattern matching
column('email').like('%@company.com');
column('name').ilike('john%');

// Membership
column('status').in(['active', 'pending']);
column('tags').contains(['important']);

// Null checks
column('deleted_at').isNull();
column('verified_at').isNotNull();

// Helpers
column('user_id').isOwner(); // eq(auth.uid())
column('is_public').isPublic(); // eq(true)

// Chaining
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

// With joins
column('id').in(
  from('projects', 'p')
    .select('p.id')
    .join('members', column('m.project_id').eq('p.id'), 'inner', 'm')
    .where(column('m.user_id').eq(auth.uid()))
);
```

### Context Functions

```typescript
auth.uid(); // Current authenticated user
session.get(key, type); // Type-safe session variable
currentUser(); // Current database user
```

### Policy Templates

```typescript
policies.userOwned(table, operations?)
policies.tenantIsolation(table, tenantColumn?, sessionKey?)
policies.publicAccess(table, visibilityColumn?)
policies.roleAccess(table, role, operations?)
```

### Index Generation

Automatically generate indexes for RLS performance optimization:

```typescript
// User-focused API (recommended)
const userDocsPolicy = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').eq(auth.uid()));

const sql = userDocsPolicy.toSQL({ includeIndexes: true });
```

Indexes are created for columns in equality comparisons, IN clauses, and subquery conditions.

## Examples

### User Ownership

```typescript
// User-focused API (recommended)
policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').eq(auth.uid()));

// Or using .allow() for automatic USING/WITH CHECK handling
policy('user_documents')
  .on('documents')
  .read()
  .allow(column('user_id').isOwner());
```

### Multi-Tenant Isolation

```typescript
// User-focused API (recommended)
policy('tenant_isolation')
  .on('tenant_data')
  .all()
  .requireAll()
  .when(column('tenant_id').belongsToTenant());
```

### Owner or Member Access

```typescript
// User-focused API (recommended)
policy('project_access')
  .on('projects')
  .read()
  .when(
    column('user_id')
      .eq(auth.uid())
      .or(
        column('id').in(
          from('project_members')
            .select('project_id')
            .where(column('user_id').eq(auth.uid()))
        )
      )
  );
```

### INSERT with Validation

```typescript
// User-focused API (recommended)
policy('user_documents_insert')
  .on('user_documents')
  .write()
  .allow(column('user_id').eq(auth.uid()));
```

### UPDATE with Different Conditions

```typescript
// User-focused API (recommended)
policy('user_documents_update')
  .on('user_documents')
  .update()
  .allow(column('user_id').eq(auth.uid()));
// .allow() automatically sets both USING and WITH CHECK for UPDATE
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
