/**
 * Policy composition utilities
 */

import { PolicyBuilder, collectUniqueIndexStatements } from './policy-builder';
import { policies } from './templates';
import { session } from './context';
import { SQLGenerationOptions } from './types';
import { enableRLS } from './apply';

export interface PolicyGroup {
  name: string;
  policies: PolicyBuilder[];
  description?: string;
}

export function createPolicyGroup(
  name: string,
  policiesList: PolicyBuilder[],
  description?: string
): PolicyGroup {
  return { name, policies: policiesList, description };
}

/**
 * Full CRUD ownership policy group — one call, all four operations.
 *
 * SELECT and DELETE use USING, INSERT uses WITH CHECK, UPDATE uses both.
 * Pass the result to `applyPolicyGroup()` or `policyGroupToSQL()`.
 *
 * @example
 * ```typescript
 * await applyPolicyGroup(crud('documents'), client);
 * await applyPolicyGroup(crud('posts', 'author_id'), client);
 * ```
 */
export function crud(table: string, userIdColumn: string = 'user_id'): PolicyGroup {
  return createPolicyGroup(
    `${table}_crud`,
    policies.owned({ tables: [table], userColumn: userIdColumn, operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] })
  );
}

/**
 * Tenant isolation policy group — wraps `policies.tenantIsolation()` as a group
 * ready for `applyPolicyGroup()`.
 *
 * Contains only the RESTRICTIVE policy. Without a companion PERMISSIVE policy all
 * rows will be invisible — `policyGroupToSQL` will warn if you use this group alone.
 * Combine with `crud()` or your own policies to grant access within the tenant.
 *
 * @example
 * ```typescript
 * await applyPolicyGroup(tenantGroup('documents'), client);
 * await applyPolicyGroup(crud('documents'), client);
 * ```
 */
export function tenantGroup(
  table: string,
  tenantColumn: string = 'tenant_id',
  sessionKey: string = 'app.current_tenant_id'
): PolicyGroup {
  return createPolicyGroup(
    `${table}_tenant_group`,
    policies.tenant({ tables: [table], column: tenantColumn, source: session.get(sessionKey, 'integer'), ownerPolicies: false })
  );
}

/**
 * Generate SQL for a policy group.
 *
 * Emits `CREATE INDEX IF NOT EXISTS` statements for every column referenced in a
 * policy condition by default. Pass `{ includeIndexes: false }` to suppress them.
 *
 * Emits warning comments when:
 * - A RESTRICTIVE policy has no companion PERMISSIVE policy in the group
 * - A policy uses an IN subquery whose source table has no SELECT policy in the group
 */
export function policyGroupToSQL(
  group: PolicyGroup,
  options?: SQLGenerationOptions
): string {
  const opts = { includeIndexes: true, ...options };
  const { restrictiveWarnings, membershipHints } = buildGroupWarnings(group);
  const warnings = [...restrictiveWarnings, ...membershipHints];

  const tables = new Set<string>();
  for (const p of group.policies) {
    try { tables.add(p.toDefinition().table); } catch { /* incomplete */ }
  }

  const sections: string[] = [];

  if (group.description) {
    sections.push(`-- ${group.description}`);
  }

  if (warnings.length > 0) {
    sections.push(warnings.join('\n'));
  }

  sections.push(`-- Enable RLS\n` + enableRLS([...tables]));

  sections.push(`-- Create policies\n` + group.policies.map((p) => p.toSQL() + ';').join('\n'));

  if (opts.includeIndexes) {
    const indexLines = collectUniqueIndexStatements(group.policies);
    if (indexLines.length > 0) {
      sections.push(`-- Create indexes\n` + indexLines.join('\n'));
    }
  }

  return sections.join('\n\n');
}

/**
 * Apply a policy group to a database client inside a transaction.
 *
 * All policies are applied atomically — if any statement fails the entire
 * group is rolled back and the error is re-thrown.
 *
 * @param group Policy group to apply
 * @param client A pg `Client` or `PoolClient`
 * @param options SQL generation options (default: `{ includeIndexes: true }`)
 *
 * @example
 * ```typescript
 * const client = await pool.connect();
 * try {
 *   await applyPolicyGroup(crud('documents'), client);
 * } finally {
 *   client.release();
 * }
 * ```
 */
export async function applyPolicyGroup(
  group: PolicyGroup,
  client: { query(sql: string): Promise<unknown> },
  options: SQLGenerationOptions = { includeIndexes: true }
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const stmt of groupToStatements(group, options)) {
      await client.query(stmt);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function groupToStatements(group: PolicyGroup, options?: SQLGenerationOptions): string[] {
  return group.policies.flatMap((p) => {
    const stmts = [p.toSQL()];
    if (options?.includeIndexes !== false) stmts.push(...p.indexStatements());
    return stmts;
  });
}

function buildGroupWarnings(group: PolicyGroup): {
  restrictiveWarnings: string[];
  membershipHints: string[];
} {
  const restrictiveTables = new Set<string>();
  const permissiveTables = new Set<string>();
  const membershipTablesByPolicy: string[][] = [];

  for (const p of group.policies) {
    try {
      const def = p.toDefinition();
      if (def.type === 'RESTRICTIVE') {
        restrictiveTables.add(def.table);
      } else {
        permissiveTables.add(def.table);
      }
    } catch { /* incomplete policy */ }
    membershipTablesByPolicy.push(p.membershipTables());
  }

  const restrictiveWarnings: string[] = [];
  for (const table of restrictiveTables) {
    if (!permissiveTables.has(table)) {
      restrictiveWarnings.push(
        `-- Warning: "${table}" has a RESTRICTIVE policy but no PERMISSIVE policy in this group.\n` +
        `-- All rows will be invisible until a PERMISSIVE policy is also applied.`
      );
    }
  }

  const seenHints = new Set<string>();
  const membershipHints: string[] = [];
  for (const tables of membershipTablesByPolicy) {
    for (const joinTable of tables) {
      if (!permissiveTables.has(joinTable) && !seenHints.has(joinTable)) {
        seenHints.add(joinTable);
        membershipHints.push(
          `-- Note: "${joinTable}" needs a SELECT policy for IN subqueries to return rows.`
        );
      }
    }
  }

  return { restrictiveWarnings, membershipHints };
}
