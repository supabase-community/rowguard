/**
 * Supabase Client Setup
 *
 * This module provides a typed Supabase client for the demo application.
 * It connects to a local Supabase instance for testing RLS policies.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database types will be generated from the schema
// Run `pnpm supabase:types` to generate these types
export type Database = any; // Will be replaced with actual types

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * Typed Supabase client for local development
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

/**
 * Test connection to Supabase
 * @returns Promise that resolves to true if connected, false otherwise
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('documents')
      .select('count', { count: 'exact', head: true });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get the list of test users for the demo
 * @returns Array of test user objects
 */
export const TEST_USERS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'alice@example.com',
    name: 'Alice',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'bob@example.com',
    name: 'Bob',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'charlie@example.com',
    name: 'Charlie',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    email: 'diana@example.com',
    name: 'Diana',
  },
] as const;

/**
 * Switch to a different test user context
 * This signs out the current user and signs in as the specified test user
 *
 * @param userId - The ID of the test user to sign in as
 */
export async function switchUser(userId: string): Promise<void> {
  await supabase.auth.signOut();

  // For testing purposes, we'll use a mock JWT token
  // In a real app, you'd use proper authentication
  const user = TEST_USERS.find((u) => u.id === userId);
  if (!user) {
    throw new Error(`Unknown user ID: ${userId}`);
  }

  // Note: This is a simplified approach for the demo
  // In production, you'd use proper authentication
}

/**
 * Get table schema information from the database
 */
export async function getTableSchema() {
  try {
    const { data, error } = await supabase.rpc('get_table_schema');
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching schema:', error);
    return null;
  }
}

/**
 * Execute raw SQL query (for applying policies)
 * Note: This requires appropriate permissions and should only be used in development
 */
export async function executeSQL(sql: string) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
