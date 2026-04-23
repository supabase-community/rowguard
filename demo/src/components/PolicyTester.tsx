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
      <div className="p-5">
        <p className="text-sm font-medium text-text-primary mb-1">Live testing requires a local database</p>
        <p className="text-sm text-text-secondary mb-4">Run locally to connect Supabase and test policies against real data.</p>
        <div className="bg-dark-surface-2 border border-dark-border rounded-md p-4 text-xs font-mono space-y-1.5">
          <div className="text-text-tertiary">git clone https://github.com/supabase-community/rowguard.git</div>
          <div className="text-text-tertiary">pnpm install</div>
          <div className="text-supabase-lime">pnpm demo:dev:full</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <div className="px-6 py-3 flex items-center gap-2 border-b border-dark-border">
        <Terminal size={16} className="text-text-tertiary" />
        {currentUser && (
          <span className="ml-auto text-xs bg-blue-950/50 text-blue-400 px-2 py-1 rounded-full flex items-center gap-1">
            <User size={12} />
            Signed in as {TEST_USERS.find((u) => u.id === currentUser)?.name}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* Step 1 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">01 — Save</p>
          <button
            onClick={saveMigration}
            disabled={!generatedSQL || saveStatus === 'saving'}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg rounded-md transition-all duration-150 text-sm font-semibold active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving' ? (
              <><Loader2 size={14} className="animate-spin" />Saving…</>
            ) : saveStatus === 'success' ? (
              <><CheckCircle2 size={14} />Saved</>
            ) : (
              <><Save size={14} />Save as migration</>
            )}
          </button>
          {saveError && (
            <p className="text-xs text-red-400 font-mono pl-1">{saveError}</p>
          )}
          {migrations.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Pending ({migrations.length})</span>
                <button onClick={loadMigrations} disabled={loadingMigrations} className="text-text-tertiary hover:text-text-secondary transition-colors">
                  <RefreshCw size={11} className={loadingMigrations ? 'animate-spin' : ''} />
                </button>
              </div>
              {migrations.map((filename) => (
                <div key={filename} className="flex items-center gap-2 text-xs font-mono text-text-tertiary py-1 border-b border-dark-border last:border-0">
                  <span className="truncate flex-1">{filename}</span>
                  <button onClick={() => removeMigration(filename)} className="text-text-tertiary hover:text-red-400 transition-colors flex-shrink-0" title="Remove">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">02 — Apply</p>
          <p className="text-xs text-text-secondary">Resets the database and applies all saved migrations.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-dark-surface border border-dark-border text-supabase-lime font-mono text-sm rounded-md">
              pnpm supabase:reset
            </code>
            <button onClick={() => copyCommand('pnpm supabase:reset')} className="p-2 text-text-tertiary hover:text-text-secondary transition-colors" title="Copy">
              {copiedCommand ? <Check size={14} className="text-supabase-lime" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">03 — Test</p>
          <div className="flex gap-2">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value as TestUserId)}
              className="flex-1 px-3 py-2 bg-dark-surface border border-dark-border rounded-md text-text-primary text-sm focus:outline-none focus:border-supabase-lime"
            >
              {TEST_USERS.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            <button
              onClick={runTestQuery}
              disabled={!testQuery.trim() || testing}
              className="flex items-center gap-1.5 px-4 py-2 bg-supabase-lime/10 hover:bg-supabase-lime/20 text-supabase-lime rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
              {testing ? 'Running…' : 'Run'}
            </button>
          </div>
          <textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="SELECT * FROM documents"
            className="w-full px-3 py-2 bg-dark-surface border border-dark-border rounded-md text-text-primary font-mono text-xs focus:outline-none focus:border-supabase-lime resize-none"
            rows={2}
          />
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2 pt-1">
            {results.map((result) => (
              <div key={result.userId}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-text-secondary">{result.userName}</span>
                  <span className="ml-auto text-xs">
                    {result.error
                      ? <span className="text-red-400">error</span>
                      : <span className="text-supabase-lime">{result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}</span>
                    }
                  </span>
                </div>
                {result.error ? (
                  <p className="text-xs text-red-400 font-mono bg-red-950/20 p-2.5 rounded border border-red-900/40">{result.error}</p>
                ) : result.rows.length > 0 ? (
                  <pre className="text-xs text-text-secondary font-mono bg-dark-bg p-2.5 rounded border border-dark-border overflow-x-auto">{JSON.stringify(result.rows, null, 2)}</pre>
                ) : (
                  <p className="text-xs text-text-tertiary italic p-2.5 bg-dark-bg rounded border border-dark-border">No rows — this user's policy grants no access here.</p>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
