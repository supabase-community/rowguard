# RLS Policy DSL

A TypeScript DSL for defining PostgreSQL Row Level Security (RLS) policies with a clean, type-safe API.

## Features

- Simple & intuitive fluent API that reads like natural language
- Natural left-to-right method chaining (no polish notation)
- Zero dependencies - pure TypeScript, works everywhere
- Full TypeScript support with intelligent inference
- Universal - Node.js, Deno, Bun, browsers, edge functions
- Minimal footprint, tree-shakeable

## Installation

```bash
npm install rls-dsl
```

## Quick Start

```typescript
import { createPolicy, column, auth, from } from 'rls-dsl';

// Simple user ownership
const policy = createPolicy('user_documents')
  .on('documents')
  .for('SELECT')
  .when(column('user_id').eq(auth.uid()));

// Complex conditions with method chaining
const complexPolicy = createPolicy('project_access')
  .on('projects')
  .for('SELECT')
  .when(
    column('is_public').eq(true)
      .or(column('user_id').eq(auth.uid()))
      .or(column('organization_id').eq(session.get('app.org_id', 'uuid')))
  );

// Subqueries
const memberPolicy = createPolicy('member_access')
  .on('projects')
  .for('SELECT')
  .when(
    column('id').in(
      from('project_members')
        .select('project_id')
        .where(column('user_id').eq(auth.uid()))
    )
  );

console.log(policy.toSQL());
```

### Policy Templates

```typescript
import { policies } from 'rls-dsl';

const [policy] = policies.userOwned('documents', 'SELECT');
const tenantPolicy = policies.tenantIsolation('tenant_data');
const publicPolicy = policies.publicAccess('projects');
```


## API Reference

### Policy Builder

```typescript
createPolicy(name)
  .on(table)                    // Target table
  .for(operation)               // SELECT | INSERT | UPDATE | DELETE | ALL
  .to(role?)                    // Optional role restriction
  .when(condition)              // USING clause (read filter)
  .allow(condition)             // Type-safe USING/WITH CHECK based on operation
  .withCheck(condition)         // WITH CHECK clause (write validation)
  .restrictive()                // Mark as RESTRICTIVE
  .description(text)            // Add documentation
  .toSQL()                      // Generate PostgreSQL statement
```

### Column Conditions

```typescript
// Comparisons
column('status').eq('active')
column('age').gt(18)
column('price').lte(100)

// Pattern matching
column('email').like('%@company.com')
column('name').ilike('john%')

// Membership
column('status').in(['active', 'pending'])
column('tags').contains(['important'])

// Null checks
column('deleted_at').isNull()
column('verified_at').isNotNull()

// Helpers
column('user_id').isOwner()      // eq(auth.uid())
column('is_public').isPublic()   // eq(true)

// Chaining
column('user_id').eq(auth.uid())
  .or(column('is_public').eq(true))
  .and(column('status').eq('active'))
```

### Subqueries

```typescript
import { column, from, auth } from 'rls-dsl';

column('id').in(
  from('project_members')
    .select('project_id')
    .where(column('user_id').eq(auth.uid()))
)

// With joins
column('id').in(
  from('projects', 'p')
    .select('p.id')
    .join('members', column('m.project_id').eq('p.id'), 'inner', 'm')
    .where(column('m.user_id').eq(auth.uid()))
)
```

### Context Functions

```typescript
auth.uid()                    // Current authenticated user
session.get(key, type)        // Type-safe session variable
currentUser()                 // Current database user
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
const policy = createPolicy('user_documents')
  .on('documents')
  .for('SELECT')
  .when(column('user_id').eq(auth.uid()));

const sql = policy.toSQL({ includeIndexes: true });
```

Indexes are created for columns in equality comparisons, IN clauses, and subquery conditions.

## Examples

### User Ownership

```typescript
createPolicy('user_documents')
  .on('documents')
  .for('SELECT')
  .when(column('user_id').eq(auth.uid()));
```

### Multi-Tenant Isolation

```typescript
createPolicy('tenant_isolation')
  .on('tenant_data')
  .for('ALL')
  .restrictive()
  .when(column('tenant_id').eq(session.get('app.current_tenant_id', 'integer')));
```

### Owner or Member Access

```typescript
createPolicy('project_access')
  .on('projects')
  .for('SELECT')
  .when(
    column('user_id').eq(auth.uid())
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
createPolicy('user_documents_insert')
  .on('user_documents')
  .for('INSERT')
  .allow(column('user_id').eq(auth.uid()));
```

### UPDATE with Different Conditions

```typescript
createPolicy('user_documents_update')
  .on('user_documents')
  .for('UPDATE')
  .when(column('user_id').eq(auth.uid()))
  .withCheck(column('user_id').eq(auth.uid()));
```



## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
