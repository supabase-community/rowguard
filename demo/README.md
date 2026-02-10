# RLS Policy DSL Tester

> **Experimental Library** - This is an experimental project for testing out ideas. It is not official and not intended for production use.

An interactive demo application for testing and generating PostgreSQL Row Level Security (RLS) policies using the [`ts-to-rls`](https://github.com/supabase/ts-to-rls) TypeScript library.

This demo is located in the `/demo` directory of the main [ts-to-rls repository](https://github.com/supabase/ts-to-rls).

* **Live Demo:** https://ts-to-rls-demo.vercel.app/
* **Documentation:** https://supabase.github.io/ts-to-rls/

## Features

- 🎨 **Monaco Editor** with TypeScript intellisense and autocomplete
- 🚀 Write TypeScript code using the RLS DSL with real-time syntax highlighting
- 📝 Generate PostgreSQL RLS policy SQL instantly
- 📋 Copy to clipboard functionality
- 💡 Error display with helpful messages
- 🔍 Function reference panel
- 14+ built-in examples covering common use cases:
  - User ownership policies
  - Multi-tenant isolation
  - Owner or member access
  - Complex OR conditions
  - Pattern matching (LIKE/ILIKE)
  - Null checks (isNull/isNotNull)
  - DELETE operations
  - Policies with index suggestions
  - INSERT/UPDATE validations with check expressions
  - Pre-built policy templates (userOwned, publicAccess, roleAccess)
  - Helper methods (isOwner, isPublic)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm

### Installation

From the root of the monorepo:

```bash
pnpm install
```

### Development

From the root of the monorepo:

```bash
pnpm demo:dev
```

Or from within the demo directory:

```bash
cd demo
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. The demo automatically uses the local version of the `ts-to-rls` library via pnpm workspace, so any changes to the library are immediately reflected in the demo.

### Build

From the root of the monorepo:

```bash
pnpm demo:build
```

This builds the library first, then builds the demo.

## Usage

The tester provides an editor where you can write TypeScript code using the RLS DSL. Click "Generate" to compile the policy into SQL.

### Example

```typescript
const p = policy('user_documents')
  .on('documents')
  .read()
  .when(column('user_id').isOwner());

return p.toSQL();
```

Generates:

```sql
CREATE POLICY "user_documents"
ON "documents"
FOR SELECT
USING ("user_id" = auth.uid());
```

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- [ts-to-rls](https://github.com/supabase/ts-to-rls) - TypeScript DSL for PostgreSQL RLS policies

## License

MIT
