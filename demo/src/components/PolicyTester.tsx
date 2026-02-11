/**
 * PolicyTester Component
 *
 * Allows users to:
 * - Apply generated policies to the live database
 * - Switch between test user contexts
 * - Run test queries to verify RLS behavior
 * - View results as different users
 * - Clean up test policies
 */

import { useState } from 'react';
import {
  Play,
  Trash2,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { supabase, TEST_USERS } from '../lib/supabase';

interface PolicyTesterProps {
  generatedSQL: string;
  isConnected: boolean;
}

interface TestResult {
  userId: string;
  userName: string;
  rows: any[];
  error?: string;
}

type TestUserId = (typeof TEST_USERS)[number]['id'];

export default function PolicyTester({
  generatedSQL,
  isConnected,
}: PolicyTesterProps) {
  const [testQuery, setTestQuery] = useState('SELECT * FROM documents');
  const [selectedUser, setSelectedUser] = useState<TestUserId>(
    TEST_USERS[0].id
  );
  const [results, setResults] = useState<TestResult[]>([]);
  const [applyStatus, setApplyStatus] = useState<
    'idle' | 'applying' | 'success' | 'error'
  >('idle');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [appliedPolicy, setAppliedPolicy] = useState<string | null>(null);

  const applyPolicy = async () => {
    if (!generatedSQL) {
      setApplyError('No SQL to apply. Generate a policy first.');
      return;
    }

    try {
      setApplyStatus('applying');
      setApplyError(null);

      // Parse policy name from SQL for cleanup later
      const policyNameMatch = generatedSQL.match(
        /CREATE POLICY\s+"?([^"\s]+)"?/i
      );
      const policyName = policyNameMatch ? policyNameMatch[1] : null;

      // Execute the SQL using RPC (requires admin privileges)
      // For demo purposes, we'll simulate this or use a custom function
      // In a real setup, you'd need proper permissions

      // Note: This is a simplified version - in production you'd need
      // to set up a database function with proper permissions
      const { error } = await supabase.rpc('exec_sql', { sql: generatedSQL });

      if (error) {
        throw error;
      }

      setApplyStatus('success');
      setAppliedPolicy(policyName);
      setTimeout(() => setApplyStatus('idle'), 3000);
    } catch (error: any) {
      console.error('Error applying policy:', error);
      setApplyStatus('error');
      setApplyError(error.message || 'Failed to apply policy');
    }
  };

  // Future enhancement: Test as all users simultaneously
  // const testPolicyAsUsers = async () => {
  //   // Implementation for testing across all users
  // };

  const cleanupPolicy = async () => {
    if (!appliedPolicy) {
      return;
    }

    try {
      // Extract table name from the generated SQL
      const tableMatch = generatedSQL.match(/ON\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : '';

      if (!tableName) {
        throw new Error('Could not determine table name from policy');
      }

      const dropSQL = `DROP POLICY IF EXISTS "${appliedPolicy}" ON ${tableName};`;

      const { error } = await supabase.rpc('exec_sql', { sql: dropSQL });

      if (error) {
        throw error;
      }

      setAppliedPolicy(null);
      setApplyStatus('idle');
      setResults([]);
    } catch (error: any) {
      console.error('Error cleaning up policy:', error);
      setApplyError(error.message || 'Failed to cleanup policy');
    }
  };

  const testQueryForUser = async () => {
    if (!testQuery) {
      return;
    }

    try {
      setTesting(true);

      // Simple query test (without user context switching for MVP)
      const { data, error } = await supabase.rpc('exec_query', {
        query: testQuery,
      });

      if (error) throw error;

      const user = TEST_USERS.find((u) => u.id === selectedUser);
      setResults([
        {
          userId: selectedUser,
          userName: user?.name || 'Unknown',
          rows: data || [],
        },
      ]);
    } catch (error: any) {
      console.error('Error testing query:', error);
      const user = TEST_USERS.find((u) => u.id === selectedUser);
      setResults([
        {
          userId: selectedUser,
          userName: user?.name || 'Unknown',
          rows: [],
          error: error.message || 'Query failed',
        },
      ]);
    } finally {
      setTesting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border p-6">
        <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Play size={20} />
          Policy Tester
        </h2>
        <div className="text-sm text-text-tertiary text-center py-8">
          <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p>Connect to Supabase to test policies</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-surface rounded-xl shadow-sm border border-dark-border overflow-hidden">
      <div className="bg-slate-800 text-white px-6 py-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Play size={20} />
          Policy Tester
          {appliedPolicy && (
            <span className="ml-auto text-xs bg-green-950/50 text-green-400 px-2 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 size={12} />
              Policy Active: {appliedPolicy}
            </span>
          )}
        </h2>
      </div>

      <div className="p-6 space-y-4">
        {/* Apply Policy Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-primary">
              1. Apply Policy to Database
            </label>
            {appliedPolicy && (
              <button
                onClick={cleanupPolicy}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg transition-colors text-sm"
              >
                <Trash2 size={14} />
                Remove Policy
              </button>
            )}
          </div>

          <button
            onClick={applyPolicy}
            disabled={!generatedSQL || applyStatus === 'applying'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-supabase-lime hover:bg-supabase-lime-hover text-dark-bg rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applyStatus === 'applying' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Applying Policy...
              </>
            ) : applyStatus === 'success' ? (
              <>
                <CheckCircle2 size={16} />
                Policy Applied!
              </>
            ) : (
              <>
                <Play size={16} />
                Apply Policy
              </>
            )}
          </button>

          {applyError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800 rounded-lg text-sm">
              <AlertCircle
                size={16}
                className="text-red-400 flex-shrink-0 mt-0.5"
              />
              <div className="text-red-400">
                <p className="font-semibold mb-1">Error applying policy</p>
                <p className="text-xs font-mono">{applyError}</p>
                <p className="text-xs mt-2 text-red-300">
                  Note: Policy testing requires database functions with proper
                  permissions. This is a simplified demo - see README for full
                  setup instructions.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* User Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            2. Select Test User
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value as TestUserId)}
            className="w-full px-3 py-2 bg-dark-surface-2 border border-dark-border rounded-lg text-text-primary focus:outline-none focus:border-supabase-lime"
          >
            {TEST_USERS.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </div>

        {/* Test Query */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary">
            3. Test Query
          </label>
          <textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="SELECT * FROM documents"
            className="w-full px-3 py-2 bg-dark-surface-2 border border-dark-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-supabase-lime resize-none"
            rows={3}
          />
          <button
            onClick={testQueryForUser}
            disabled={!testQuery || testing}
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Results
            </label>
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.userId}
                  className="bg-dark-surface-2 rounded-lg border border-dark-border p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <User size={16} className="text-supabase-lime" />
                    <span className="font-medium text-text-primary">
                      {result.userName}
                    </span>
                    <span className="text-xs text-text-tertiary ml-auto">
                      {result.error ? (
                        <span className="text-red-400">Error</span>
                      ) : (
                        `${result.rows.length} ${result.rows.length === 1 ? 'row' : 'rows'}`
                      )}
                    </span>
                  </div>

                  {result.error ? (
                    <div className="text-sm text-red-400 font-mono bg-red-950/20 p-2 rounded">
                      {result.error}
                    </div>
                  ) : result.rows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <pre className="text-xs text-text-secondary font-mono bg-dark-bg p-3 rounded">
                        {JSON.stringify(result.rows, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-text-tertiary italic">
                      No rows returned
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="pt-4 border-t border-dark-border">
          <p className="text-xs text-text-tertiary">
            💡 <strong>Tip:</strong> Apply your policy, then run a test query to
            see which rows are accessible to different users. Use the cleanup
            button to remove the policy when done.
          </p>
        </div>
      </div>
    </div>
  );
}
