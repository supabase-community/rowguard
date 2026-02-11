/**
 * Vite Plugin for Migration File Operations
 *
 * ⚠️ SECURITY WARNING: DEVELOPMENT ONLY ⚠️
 * This plugin provides filesystem write/delete access and should ONLY be used
 * in local development. It is automatically disabled in production builds.
 *
 * Features:
 * - POST /api/migrations - Create a new migration file
 * - GET /api/migrations - List existing policy migration files
 * - DELETE /api/migrations - Remove a migration file
 *
 * Safety measures:
 * - Only runs in Vite dev server (not in production builds)
 * - Validates filenames to prevent directory traversal
 * - Only accessible on localhost by default
 */

import fs from 'fs/promises';
import path from 'path';
import type { Plugin, ViteDevServer } from 'vite';

interface MigrationRequest {
  filename: string;
  content: string;
}

interface DeleteRequest {
  filename: string;
}

export function migrationsPlugin(): Plugin {
  let migrationsDir: string;

  return {
    name: 'migrations-api',
    configResolved(config) {
      // migrations dir is in the root project, not in demo/
      migrationsDir = path.join(config.root, '..', 'supabase', 'migrations');

      // Log warning if not in development mode
      if (config.command !== 'serve') {
        console.warn(
          '[migrations-api] Plugin is designed for development only and will not run in production builds.'
        );
      }
    },
    configureServer(server: ViteDevServer) {
      // Double-check we're in development mode
      if (process.env.NODE_ENV === 'production') {
        console.error(
          '[migrations-api] SECURITY WARNING: This plugin should not run in production!'
        );
        return;
      }
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/migrations')) {
          return next();
        }

        // Set CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          if (req.method === 'POST') {
            // Create a new migration file
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', async () => {
              try {
                const { filename, content } = JSON.parse(
                  body
                ) as MigrationRequest;

                // Validate filename (prevent directory traversal)
                if (
                  filename.includes('..') ||
                  filename.includes('/') ||
                  filename.includes('\\')
                ) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: 'Invalid filename' }));
                  return;
                }

                const filepath = path.join(migrationsDir, filename);
                await fs.writeFile(filepath, content, 'utf-8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filename }));
              } catch (error) {
                console.error('Error creating migration:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Failed to create migration',
                  })
                );
              }
            });
          } else if (req.method === 'GET') {
            // List migration files (only policy migrations)
            try {
              const files = await fs.readdir(migrationsDir);
              const policyFiles = files
                .filter((f) => f.includes('_policy_') && f.endsWith('.sql'))
                .sort();

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ files: policyFiles }));
            } catch (error) {
              console.error('Error listing migrations:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Failed to list migrations',
                })
              );
            }
          } else if (req.method === 'DELETE') {
            // Delete a migration file
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', async () => {
              try {
                const { filename } = JSON.parse(body) as DeleteRequest;

                // Validate filename (prevent directory traversal)
                if (
                  filename.includes('..') ||
                  filename.includes('/') ||
                  filename.includes('\\')
                ) {
                  res.writeHead(400);
                  res.end(JSON.stringify({ error: 'Invalid filename' }));
                  return;
                }

                const filepath = path.join(migrationsDir, filename);
                await fs.unlink(filepath);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (error) {
                console.error('Error deleting migration:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Failed to delete migration',
                  })
                );
              }
            });
          } else {
            res.writeHead(405);
            res.end('Method Not Allowed');
          }
        } catch (error) {
          console.error('Middleware error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    },
  };
}
