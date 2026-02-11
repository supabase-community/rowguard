# Security Considerations

## Migration API (Development Only)

### ⚠️ Important Security Notice

The Rowguard demo includes a **migration file API** (`/api/migrations`) that provides filesystem access for educational purposes. This feature has the following security characteristics:

### ✅ Safe Use Cases (Intended)

1. **Local Development** (`pnpm demo:dev`)
   - Runs on `localhost:5173` only
   - Not accessible from the internet
   - Safe for learning and testing

2. **Static Deployments** (Vercel, Netlify, etc.)
   - Production builds are **static files only**
   - Vite plugin does NOT run in production builds
   - Migration API is completely absent from deployed version
   - Users see "SQL Only" mode (no filesystem access)

### 🚨 Unsafe Use Cases (DO NOT DO THIS)

1. **Exposing Dev Server to Internet**

   ```bash
   # ❌ DANGEROUS - DO NOT DO THIS
   vite dev --host 0.0.0.0
   ```

   This exposes filesystem write/delete access to anyone who can reach your IP.

2. **Running Dev Server in Production**

   ```bash
   # ❌ DANGEROUS - DO NOT DO THIS
   NODE_ENV=production vite dev
   ```

   The dev server is not designed for production use.

3. **Using Vite Preview in Production**
   ```bash
   # ❌ DANGEROUS - DO NOT USE FOR PRODUCTION HOSTING
   vite preview --host 0.0.0.0
   ```
   While the migration API won't work in preview, this is still not a production server.

## Security Measures Implemented

### 1. Development-Only Plugin

The migration plugin **only runs in Vite dev server** and is excluded from production builds:

```typescript
// Automatically disabled in production
if (config.command !== 'serve') {
  console.warn('Plugin will not run in production builds.');
}
```

### 2. Filename Validation

All filenames are validated to prevent directory traversal attacks:

```typescript
// Blocks: ../../../etc/passwd, /absolute/path, etc.
if (
  filename.includes('..') ||
  filename.includes('/') ||
  filename.includes('\\')
) {
  return error('Invalid filename');
}
```

### 3. CORS Headers (Development Only)

CORS is permissive in development for localhost testing but doesn't matter in production since the API doesn't exist.

### 4. Production Build Behavior

When you run `pnpm demo:build`:

- Vite bundles to static files (HTML, CSS, JS)
- The migrations plugin **never executes**
- No backend endpoints exist
- No filesystem access possible

## Public Deployment Safety

### The Live Demo (rowguard-demo.vercel.app)

The public demo at https://rowguard-demo.vercel.app is **completely safe** because:

1. ✅ It's a **static build** deployed to Vercel
2. ✅ No backend server is running
3. ✅ No filesystem access exists
4. ✅ Migration API is **not present** in the build
5. ✅ Users can only generate SQL (read-only operation)

### What Users See on Public Demo

- **Without Local Supabase**: "Disconnected - SQL Only" badge
  - Can generate SQL policies
  - Cannot test against a database
  - Cannot create migration files

- **With Local Supabase** (if they clone and run locally):
  - Full migration workflow
  - Filesystem API (localhost only)
  - Safe because it's on their own machine

## Recommended Deployment Practices

### ✅ Correct Way to Deploy

```bash
# Build for production (static files only)
pnpm demo:build

# Deploy the dist/ folder to:
# - Vercel
# - Netlify
# - GitHub Pages
# - Any static hosting

# Or use Vercel CLI:
vercel deploy
```

### ❌ Incorrect Ways to Deploy

```bash
# Never do these in production:
vite dev --host 0.0.0.0           # Exposes dev server
NODE_ENV=production vite dev       # Still a dev server
vite preview --host 0.0.0.0       # Not a production server
```

## For Developers: Adding Extra Safety

### Additional Safeguards (Optional)

If you want to add extra protection, you can:

1. **Check for localhost only**:

```typescript
// In the plugin
if (req.headers.host && !req.headers.host.startsWith('localhost')) {
  return res.writeHead(403).end('Forbidden: Development only');
}
```

2. **Add environment variable check**:

```typescript
if (process.env.DEMO_MIGRATION_API_ENABLED !== 'true') {
  return; // Disable the API
}
```

3. **Add rate limiting** (for extra paranoia):

```typescript
// Limit to 10 requests per minute
```

## Vulnerability Disclosure

If you discover a security vulnerability in Rowguard, please report it to:

- GitHub Security Advisory: https://github.com/supabase-community/rowguard/security/advisories
- Or open an issue with "Security:" prefix

## Summary

✅ **The public demo is safe** - it's a static build with no backend
✅ **Local development is safe** - only accessible on localhost
🚨 **Dev server should never be exposed to internet**
🚨 **Never use `vite dev` or `vite preview` in production**

The migration API is a **learning tool for local development only** and does not pose a security risk when used as intended or when deployed as a static site.
