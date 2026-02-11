/**
 * PolicyTester Component - Migration-Based Workflow
 *
 * Teaches users the real Supabase development workflow:
 * 1. Generate policy SQL
 * 2. Save as migration file
 * 3. Apply with `pnpm supabase:reset`
 * 4. Test with actual auth context and standard Supabase client
 * 5. Clean up by removing migration
 *
 * Uses the Vite migrations plugin API for filesystem operations.
 */

import { useState, useEffect } from 'react';
import {
  Save,
  Play,
  Trash2,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { supabase, TEST_USERS } from '../lib/supabase';

interface PolicyTesterProps {
  generatedSQL: string;
  policyName?: string;
  isConnected: boolean;
}

interface TestResult {
  userId: string;
  userName: string;
  rows: unknown[];
  rowCount: number;
  error?: string;
}

type TestUserId = (typeof TEST_USERS)[number]['id'];

export default function PolicyTester({
  generatedSQL,
  policyName = 'test_policy',
  isConnected,
}: PolicyTesterProps) {
  const [testQuery, setTestQuery] = useState('SELECT * FROM documents');
  const [selectedUser, setSelectedUser] = useState<TestUserId>(
    TEST_USERS[0].id
  );
  const [currentUser, setCurrentUser] = useState<TestUserId | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [migrations, setMigrations] = useState<string[]>([]);
  const [loadingMigrations, setLoadingMigrations] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'success' | 'error'
  >('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);

  // Load migrations on mount and when connection status changes
  useEffect(() => {
    if (isConnected) {
      loadMigrations();
    }
  }, [isConnected]);

  const loadMigrations = async () => {
    try {
      setLoadingMigrations(true);
      const response = await fetch('/api/migrations');
      if (!response.ok) {
        throw new Error('Failed to load migrations');
      }
      const data = await response.json();
      setMigrations(data.files || []);
    } catch (error) {
      console.error('Error loading migrations:', error);
    } finally {
      setLoadingMigrations(false);
    }
  };

  const saveMigration = async () => {
    if (!generatedSQL) {
      setSaveError('No SQL to save. Generate a policy first.');
      setSaveStatus('error');
      return;
    }

    try {
      setSaveStatus('saving');
      setSaveError(null);

      // Extract policy name from SQL (e.g., "CREATE POLICY user_documents ON...")
      const policyNameMatch = generatedSQL.match(
        /CREATE POLICY\s+"?([^"\s]+)"?/i
      );
      const extractedName = policyNameMatch ? policyNameMatch[1] : policyName;

      // Generate timestamped filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .replace(/\.\d{3}Z$/, '');
      const sanitizedName = extractedName
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      const filename = `${timestamp}_policy_${sanitizedName}.sql`;

      // Call Vite plugin API to create migration file
      const response = await fetch('/api/migrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: generatedSQL }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save migration');
      }

      setSaveStatus('success');
      await loadMigrations(); // Reload migration list
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving migration:', error);
      setSaveStatus('error');
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save migration'
      );
    }
  };

  const removeMigration = async (filename: string) => {
    try {
      const response = await fetch('/api/migrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove migration');
      }

      await loadMigrations(); // Reload migration list
    } catch (error) {
      console.error('Error removing migration:', error);
      alert(
        error instanceof Error ? error.message : 'Failed to remove migration'
      );
    }
  };

  const signInAsUser = async (userId: TestUserId) => {
    try {
      const user = TEST_USERS.find((u) => u.id === userId);
      if (!user) {
        throw new Error(`Unknown user: ${userId}`);
      }

      // Sign out current user
      await supabase.auth.signOut();

      // Sign in as test user
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: 'password123',
      });

      if (error) {
        throw error;
      }

      setCurrentUser(userId);
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const runTestQuery = async () => {
    if (!testQuery.trim()) {
      return;
    }

    try {
      setTesting(true);
      setResults([]);

      // Sign in as selected user
      await signInAsUser(selectedUser);

      // Parse simple SELECT queries
      // Example: "SELECT * FROM documents" or "SELECT id, title FROM posts"
      const match = testQuery.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
      if (!match) {
        throw new Error(
          'Only simple SELECT queries are supported (SELECT ... FROM table)'
        );
      }

      const [, columns, table] = match;
      const selectColumns = columns.trim() === '*' ? '*' : columns.trim();

      // Execute query using standard Supabase client - RLS is automatically enforced!
      const { data, error, count } = await supabase
        .from(table)
        .select(selectColumns, { count: 'exact' });

      const user = TEST_USERS.find((u) => u.id === selectedUser);

      if (error) {
        setResults([
          {
            userId: selectedUser,
            userName: user?.name || 'Unknown',
            rows: [],
            rowCount: 0,
            error: error.message,
          },
        ]);
      } else {
        setResults([
          {
            userId: selectedUser,
            userName: user?.name || 'Unknown',
            rows: data || [],
            rowCount: count || (data?.length ?? 0),
          },
        ]);
      }
    } catch (error) {
      console.error('Error running test query:', error);
      const user = TEST_USERS.find((u) => u.id === selectedUser);
      setResults([
        {
          userId: selectedUser,
          userName: user?.name || 'Unknown',
          rows: [],
          rowCount: 0,
          error: error instanceof Error ? error.message : 'Query failed',
        },
      ]);
    } finally {
      setTesting(false);
    }
  };

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border p-6">
        <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Play size={20} />
          Policy Tester
        </h2>
        <div className="text-sm text-text-tertiary py-8">
          <AlertCircle
            size={48}
            className="mx-auto mb-4 opacity-50 text-yellow-400"
          />
          <div className="text-center mb-4">
            <p className="font-semibold text-text-primary">
              Database Connection Required
            </p>
            <p className="text-xs mt-1">
              Policy testing features require a local Supabase instance
            </p>
          </div>

          <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 text-left">
            <p className="text-sm text-blue-300 font-semibold mb-2">
              💡 This deployed version is SQL-generation only
            </p>
            <p className="text-xs text-blue-200 mb-3">
              The migration workflow, schema viewer, and policy testing features
              only work when running locally with Supabase.
            </p>
            <div className="text-xs text-blue-200 space-y-2">
              <p className="font-semibold">To enable full features:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>
                  Clone:{' '}
                  <code className="px-1 py-0.5 bg-blue-900/50 rounded font-mono">
                    git clone https://github.com/supabase-community/rowguard.git
                  </code>
                </li>
                <li>
                  Install:{' '}
                  <code className="px-1 py-0.5 bg-blue-900/50 rounded font-mono">
                    pnpm install
                  </code>
                </li>
                <li>
                  Run:{' '}
                  <code className="px-1 py-0.5 bg-blue-900/50 rounded font-mono">
                    pnpm demo:dev:full
                  </code>
                </li>
              </ol>
              <p className="mt-3 pt-3 border-t border-blue-800/50">
                See{' '}
                <a
                  href="https://github.com/supabase-community/rowguard/tree/main/demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-supabase-lime hover:underline"
                >
                  demo/README.md
                </a>{' '}
                for detailed setup instructions.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border overflow-hidden">
      <div className="bg-slate-800 text-white px-6 py-4 flex items-center gap-2">
        <Terminal size={20} />
        <h2 className="font-semibold">Migration-Based Testing</h2>
        {currentUser && (
          <span className="ml-auto text-xs bg-blue-950/50 text-blue-400 px-2 py-1 rounded-full flex items-center gap-1">
            <User size={12} />
            Signed in as {TEST_USERS.find((u) => u.id === currentUser)?.name}
          </span>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Step 1: Save as Migration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">
              1
            </span>
            <label className="text-sm font-medium text-text-primary">
              Save Policy as Migration File
            </label>
          </div>

          <button
            onClick={saveMigration}
            disabled={!generatedSQL || saveStatus === 'saving'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving Migration...
              </>
            ) : saveStatus === 'success' ? (
              <>
                <CheckCircle2 size={16} />
                Migration Saved!
              </>
            ) : (
              <>
                <Save size={16} />
                Save as Migration
              </>
            )}
          </button>

          {saveError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800 rounded-lg text-sm">
              <AlertCircle
                size={16}
                className="text-red-400 flex-shrink-0 mt-0.5"
              />
              <div className="text-red-400">
                <p className="font-semibold">Error</p>
                <p className="text-xs font-mono mt-1">{saveError}</p>
              </div>
            </div>
          )}

          {/* Active Migrations List */}
          {migrations.length > 0 && (
            <div className="p-3 bg-dark-surface-2 border border-dark-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-secondary">
                  Active Policy Migrations ({migrations.length})
                </span>
                <button
                  onClick={loadMigrations}
                  disabled={loadingMigrations}
                  className="text-xs text-supabase-lime hover:text-supabase-lime-hover"
                >
                  <RefreshCw
                    size={12}
                    className={loadingMigrations ? 'animate-spin' : ''}
                  />
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {migrations.map((filename) => (
                  <div
                    key={filename}
                    className="flex items-center justify-between text-xs font-mono text-text-tertiary bg-dark-bg px-2 py-1.5 rounded"
                  >
                    <span className="truncate flex-1">{filename}</span>
                    <button
                      onClick={() => removeMigration(filename)}
                      className="ml-2 text-red-400 hover:text-red-300 flex-shrink-0"
                      title="Remove migration"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Apply Migration */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-sm font-bold">
              2
            </span>
            <label className="text-sm font-medium text-text-primary">
              Apply Migration in Terminal
            </label>
          </div>

          <div className="p-4 bg-dark-surface-2 border border-dark-border rounded-lg space-y-2">
            <p className="text-xs text-text-secondary">
              Run this command in your terminal to apply all migrations:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-dark-bg text-supabase-lime font-mono text-sm rounded">
                pnpm supabase:reset
              </code>
              <button
                onClick={() => copyCommand('pnpm supabase:reset')}
                className="p-2 hover:bg-dark-border rounded transition-colors"
                title="Copy command"
              >
                {copiedCommand ? (
                  <Check size={16} className="text-green-400" />
                ) : (
                  <Copy size={16} className="text-text-tertiary" />
                )}
              </button>
            </div>
            <p className="text-xs text-text-tertiary">
              💡 This resets the database and applies all migrations, including
              your new policy.
            </p>
          </div>
        </div>

        {/* Step 3: Test with User Context */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">
              3
            </span>
            <label className="text-sm font-medium text-text-primary">
              Test Policy with RLS
            </label>
          </div>

          {/* User Selector */}
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Select Test User
            </label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value as TestUserId)}
              className="w-full px-3 py-2 bg-dark-surface-2 border border-dark-border rounded-lg text-text-primary focus:outline-none focus:border-supabase-lime text-sm"
            >
              {TEST_USERS.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          {/* Test Query */}
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Test Query
            </label>
            <textarea
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="SELECT * FROM documents"
              className="w-full px-3 py-2 bg-dark-surface-2 border border-dark-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-supabase-lime resize-none"
              rows={2}
            />
          </div>

          <button
            onClick={runTestQuery}
            disabled={!testQuery.trim() || testing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Running Query...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Test Query
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary">
              Query Results
            </label>
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.userId}
                  className="bg-dark-surface-2 rounded-lg border border-dark-border p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <User size={16} className="text-supabase-lime" />
                    <span className="font-medium text-text-primary">
                      {result.userName}
                    </span>
                    <span className="text-xs text-text-tertiary ml-auto">
                      {result.error ? (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle size={12} />
                          Error
                        </span>
                      ) : (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          {result.rowCount}{' '}
                          {result.rowCount === 1 ? 'row' : 'rows'}
                        </span>
                      )}
                    </span>
                  </div>

                  {result.error ? (
                    <div className="text-sm text-red-400 font-mono bg-red-950/20 p-3 rounded border border-red-900/50">
                      {result.error}
                    </div>
                  ) : result.rows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <pre className="text-xs text-text-secondary font-mono bg-dark-bg p-3 rounded border border-dark-border">
                        {JSON.stringify(result.rows, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-text-tertiary italic p-3 bg-dark-bg rounded border border-dark-border">
                      No rows returned (RLS may be blocking access)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="pt-4 border-t border-dark-border">
          <p className="text-xs text-text-tertiary leading-relaxed">
            💡 <strong>How it works:</strong> Save your policy as a migration
            file, apply it with{' '}
            <code className="px-1 py-0.5 bg-dark-surface-2 rounded">
              pnpm supabase:reset
            </code>
            , then test queries as different users. RLS is automatically
            enforced by the Supabase client! Remove migrations and reset again
            to clean up.
          </p>
        </div>
      </div>
    </div>
  );
}
