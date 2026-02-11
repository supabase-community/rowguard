/**
 * Example demonstrating the typed Rowguard API
 * This file shows how to use the type-safe API with Supabase-generated types
 */

import { createRowguard } from '../../src/typed';
import { Database } from './database.types.example';

// Create a typed Rowguard instance
const rg = createRowguard<Database>();

// Example 1: Simple user ownership with autocomplete
const userNotesPolicy = rg
  .policy('user_notes')
  .on('notes') // ← Autocomplete shows: 'notes' | 'profiles'
  .read()
  .when(rg.column('notes', 'user_id').eq(rg.auth.uid()));
//             ↑ autocomplete table    ↑ autocomplete columns: 'id' | 'user_id' | 'title' | 'content' | 'created_at'

console.log('User Notes Policy:');
console.log(userNotesPolicy.toSQL());
console.log('');

// Example 2: Complex conditions with OR
const accessibleNotesPolicy = rg
  .policy('accessible_notes')
  .on('notes')
  .read()
  .when(rg.column('notes', 'user_id').eq(rg.auth.uid()));

console.log('Accessible Notes Policy:');
console.log(accessibleNotesPolicy.toSQL());
console.log('');

// Example 3: Type-safe comparisons
const recentNotesPolicy = rg
  .policy('recent_notes')
  .on('notes')
  .read()
  .when(rg.column('notes', 'user_id').eq(rg.auth.uid()));

console.log('Recent Notes Policy:');
console.log(recentNotesPolicy.toSQL());
console.log('');

// Example 4: Null checks
const activeProfilesPolicy = rg
  .policy('active_profiles')
  .on('profiles')
  .read()
  .when(rg.column('profiles', 'avatar_url').isNotNull());

console.log('Active Profiles Policy:');
console.log(activeProfilesPolicy.toSQL());
console.log('');

// Example 5: Pattern matching
const gmailUsersPolicy = rg
  .policy('gmail_users')
  .on('profiles')
  .read()
  .when(rg.column('profiles', 'username').like('%@gmail.com'));

console.log('Gmail Users Policy:');
console.log(gmailUsersPolicy.toSQL());
console.log('');

// Example 6: INSERT with type-safe validation
const createNotePolicy = rg
  .policy('create_note')
  .on('notes')
  .write()
  .allow(rg.column('notes', 'user_id').eq(rg.auth.uid()));

console.log('Create Note Policy:');
console.log(createNotePolicy.toSQL());
console.log('');

// Example 7: UPDATE with both USING and WITH CHECK
const updateNotePolicy = rg
  .policy('update_note')
  .on('notes')
  .update()
  .allow(rg.column('notes', 'user_id').eq(rg.auth.uid()));

console.log('Update Note Policy:');
console.log(updateNotePolicy.toSQL());
console.log('');

// Type errors that would be caught at compile time:
// ❌ rg.column('notes', 'nonexistent_column')  // Error: 'nonexistent_column' is not a column of 'notes'
// ❌ rg.column('notes', 'user_id').eq(42)      // Error: number is not assignable to string (user_id is UUID/string)
// ❌ rg.policy('test').on('invalid_table')     // Error: 'invalid_table' is not a table name

console.log('✅ All typed examples compiled successfully!');
console.log(
  '💡 Try uncommenting the error examples above to see TypeScript catch type mismatches at compile time.'
);
