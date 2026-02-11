# Rowguard - RLS Policy DSL Tester

> **Experimental Library** - This is an experimental project for testing out ideas. It is not official and not intended for production use.

An interactive demo application for testing and generating PostgreSQL Row Level Security (RLS) policies using the [`rowguard`](https://github.com/supabase-community/rowguard) TypeScript library.

This demo is located in the `/demo` directory of the main [rowguard repository](https://github.com/supabase-community/rowguard).

- **Live Demo:** https://rowguard-demo.vercel.app/
- **Documentation:** https://supabase-community.github.io/rowguard/

## Features

### Core Features

- 🎨 **Monaco Editor** with TypeScript intellisense and autocomplete
- 🚀 Write TypeScript code using the RLS DSL with real-time syntax highlighting
- 📝 Generate PostgreSQL RLS policy SQL instantly
- 📋 Copy to clipboard functionality
- 💡 Error display with helpful messages
- 🔍 Function reference panel

### ⚠️ Security Note

The **migration file features** (save/delete) are **development-only** and work exclusively with `pnpm demo:dev` on localhost. The public demo at https://rowguard-demo.vercel.app is a static build with no backend - it only generates SQL and does not have filesystem access. See [SECURITY.md](../SECURITY.md) for details.

### 🆕 Live Testing Features (Migration-Based Workflow)

- 🗄️ **Database Schema Viewer** - Browse tables and columns from your local Supabase instance
- 📁 **Migration File Workflow** - Learn real Supabase development practices by generating migration files
- 🧪 **Policy Tester** - Test policies with actual RLS enforcement using standard Supabase client
- 👥 **Multi-User Testing** - Sign in as different test users to verify RLS behavior
- ⚡ **Real-Time Validation** - See exactly what data each user can access with RLS active
- 🔄 **Connection Status** - Clear indication of database connectivity

### Built-in Examples

14+ examples covering common use cases:

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

- **Node.js 18+**
- **pnpm** - Package manager
- **Docker** - Required for local Supabase
- **Supabase CLI** - For database management

Install Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux/macOS (alternative)
npm install -g supabase
```

### Quick Start

**Option 1: Full Setup (with live testing)**

```bash
# From the root of the monorepo
pnpm demo:dev:full
```

This command will:

1. Start local Supabase (PostgreSQL + Auth)
2. Run migrations and seed test data
3. Generate TypeScript types from schema
4. Start the demo dev server

**Option 2: SQL-Only Mode (no database)**

```bash
# From the root of the monorepo
pnpm demo:dev
```

Use this if you only want to generate SQL without testing against a live database.

### Step-by-Step Setup

#### 1. Install Dependencies

```bash
# From the root of the monorepo
pnpm install
```

#### 2. Start Supabase (for live testing)

```bash
# Start Docker, then:
pnpm supabase:setup
```

This runs `supabase start` and generates types. You should see output like:

```
Started supabase local development setup.

API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```

#### 3. Start the Demo

```bash
pnpm demo:dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

You should see a **green "Connected to Local Supabase"** badge if the database is running, or a **yellow "Disconnected - SQL Only"** badge if not.

## Features Guide

### 1. Schema Viewer

When connected to Supabase, a sidebar shows all database tables:

- **Click a table name** to insert it into the editor
- **Click a column name** to insert it into the editor
- **Expand/collapse** tables to view columns and types
- **RLS indicator** shows which tables have Row Level Security enabled

### 2. Policy Tester (Migration-Based Workflow)

The Policy Tester teaches you the real Supabase development workflow using migration files. After generating SQL:

#### Step 1: Save as Migration File

1. **Click "Save as Migration"** - Creates a timestamped migration file in `/supabase/migrations/`
2. The file is saved as `YYYYMMDDHHMMSS_policy_<policy_name>.sql`
3. Active migrations are listed in the Policy Tester panel

#### Step 2: Apply Migration

1. **Run in terminal**: `pnpm supabase:reset`
2. This resets the database and applies all migrations (including your new policy)
3. The policy is now active in your local database!

#### Step 3: Test with User Context

1. **Select Test User** - Choose from Alice, Bob, Charlie, or Diana
2. **Enter Test Query** - Write a SELECT query (e.g., `SELECT * FROM documents`)
3. **Click "Run Test Query"** - Signs in as the selected user and executes the query
4. **View Results** - See which rows are accessible to that user (RLS is automatically enforced!)

#### Step 4: Clean Up

1. **Click the trash icon** next to a migration file to remove it
2. **Run `pnpm supabase:reset`** again to revert the changes

**Why Migration Files?**

- ✅ Teaches the real Supabase workflow (how you'd deploy policies in production)
- ✅ No security bypasses or privileged database functions needed
- ✅ Migration files are version-controllable
- ✅ Standard Supabase client automatically enforces RLS
- ✅ Matches how you'll actually work with Supabase projects

#### Test Users

The demo includes 4 pre-seeded test users:

| User    | Email               | User ID (UUID)                         |
| ------- | ------------------- | -------------------------------------- |
| Alice   | alice@example.com   | `11111111-1111-1111-1111-111111111111` |
| Bob     | bob@example.com     | `22222222-2222-2222-2222-222222222222` |
| Charlie | charlie@example.com | `33333333-3333-3333-3333-333333333333` |
| Diana   | diana@example.com   | `44444444-4444-4444-4444-444444444444` |

#### Sample Test Queries

```sql
-- Test document ownership
SELECT * FROM documents;

-- Test published posts visibility
SELECT * FROM posts WHERE is_published = true;

-- Test project membership
SELECT * FROM projects WHERE id IN (
  SELECT project_id FROM project_members WHERE user_id = auth.uid()
);
```

### 3. Complete Example Workflow

**Testing a User Ownership Policy:**

1. **Load Example**: Click "User Ownership" from the examples
2. **Generate SQL**: Click "Generate" to see the CREATE POLICY statement
3. **Save Migration**: Click "Save as Migration" in the Policy Tester
4. **Apply in Terminal**: Run `pnpm supabase:reset`
5. **Test as Alice**:
   - Select "Alice (alice@example.com)" from dropdown
   - Enter query: `SELECT * FROM documents`
   - Click "Run Test Query"
   - Result: Alice sees only her 2 documents ✅
6. **Test as Bob**:
   - Select "Bob (bob@example.com)" from dropdown
   - Click "Run Test Query" again
   - Result: Bob sees only his 2 different documents ✅
7. **Verify RLS Works**: Different users see different data - policy is working!
8. **Clean Up**:
   - Click trash icon to remove migration file
   - Run `pnpm supabase:reset` to revert changes

## Database Schema

The local Supabase instance includes 8 demo tables:

| Table                  | Description                       | Sample Policies                  |
| ---------------------- | --------------------------------- | -------------------------------- |
| `documents`            | User-owned documents              | User ownership, private access   |
| `posts`                | Public/private posts              | Published content, draft privacy |
| `tenant_data`          | Multi-tenant data                 | Tenant isolation                 |
| `projects`             | Projects with ownership           | Owner + member access            |
| `project_members`      | Project membership (many-to-many) | Membership verification          |
| `user_roles`           | User role assignments             | Role-based access control        |
| `organizations`        | Organization entities             | Organization ownership           |
| `organization_members` | Organization membership           | Org-level access                 |

All tables have RLS enabled by default and include test data for all 4 users.

## Database Management

### View Database in Studio

```bash
# Open Supabase Studio in browser
open http://localhost:54323
```

Browse tables, view data, and manually test policies in the SQL editor.

### Reset Database

```bash
# Reset database and regenerate types
pnpm supabase:reset
```

This will:

1. Drop all tables
2. Re-run migrations
3. Re-seed test data
4. Regenerate TypeScript types

### Generate Types Only

```bash
# Update database.types.ts from current schema
pnpm supabase:types
```

### Stop Supabase

```bash
# Stop all Supabase services
pnpm supabase:stop
```

## Troubleshooting

### "Disconnected - SQL Only" Badge

**Cause**: Supabase is not running or Docker is not started

**Fix**:

```bash
# Check if Docker is running
docker ps

# Start Supabase
pnpm supabase:setup
```

### Port Conflicts

**Cause**: Ports 54321-54323 are already in use

**Fix**: Edit `supabase/config.toml` to change ports:

```toml
[api]
port = 54321  # Change this

[db]
port = 54322  # And this

[studio]
port = 54323  # And this
```

### Migration File Creation Fails

**Cause**: File system permissions or Vite dev server not running properly

**Fix**:

```bash
# Restart the dev server
pnpm demo:dev

# Ensure supabase/migrations/ directory exists
ls supabase/migrations/
```

**Alternative**: If the automated migration save doesn't work, you can create migrations manually:

```bash
# Create a new migration file
supabase migration new policy_name

# Paste your generated SQL into the file
# Then apply with:
pnpm supabase:reset
```

### Type Generation Errors

**Cause**: Supabase CLI version or migration issues

**Fix**:

```bash
# Update Supabase CLI
brew upgrade supabase

# Or with npm
npm install -g supabase@latest

# Reset database
pnpm supabase:reset
```

## Development

### Building

```bash
# Build both library and demo
pnpm demo:build
```

### Preview Production Build

```bash
pnpm demo:preview
```

### Type Checking

```bash
cd demo
pnpm typecheck
```

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Monaco Editor** - Code editor with IntelliSense
- **Supabase JS** - Database client
- **rowguard** - RLS policy DSL

## Environment Variables

Create `demo/.env` from `demo/.env.example`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

For local development, the default values work out of the box.

## Architecture

### Local Development

```
┌─────────────────────────────────────────┐
│ Local Supabase (Docker)                 │
│ - PostgreSQL with RLS                   │
│ - Auth (4 test users)                   │
│ - Studio UI (localhost:54323)           │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴─────┐
         │           │
    ┌────▼────┐  ┌──▼──────────────────┐
    │  Demo   │  │  Vite Dev Server    │
    │   UI    │  │  (localhost:5173)   │
    │         │  │  + Migration API    │
    └─────────┘  └─────────────────────┘
```

### Production Deployment (Vercel/Netlify)

```
┌─────────────────────────────────────────┐
│ Static Files Only                       │
│ - HTML, CSS, JS                         │
│ - No backend server                     │
│ - No migration API                      │
│ - SQL generation only                   │
└─────────────────────────────────────────┘
```

**Important**: Migration file features only work in local development. Production deployments are static and safe.

## Future Enhancements

Planned features (not yet implemented):

- Remote Supabase project connection
- Policy comparison (before/after)
- Performance metrics
- Policy library (save and share)
- Migration file export
- AI-powered policy suggestions

## License

MIT

## Contributing

This is an experimental demo. Contributions welcome! Please open issues or PRs in the main [rowguard repository](https://github.com/supabase-community/rowguard).
