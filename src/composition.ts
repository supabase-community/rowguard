/**
 * Policy composition utilities
 */

import { PolicyBuilder, policies } from './policy-builder';
import { SQLGenerationOptions } from './types';

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
    policies.userOwned(table, ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], userIdColumn)
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
    [policies.tenantIsolation(table, tenantColumn, sessionKey)]
  );
}

/**
 * Generate SQL for a policy group.
 *
 * Pass `{ includeIndexes: true }` to also emit `CREATE INDEX` statements for every
 * column referenced in a policy condition — strongly recommended for production.
 *
 * Emits warning comments when:
 * - A RESTRICTIVE policy has no companion PERMISSIVE policy in the group
 * - A policy uses an IN subquery whose source table has no SELECT policy in the group
 */
export function policyGroupToSQL(
  group: PolicyGroup,
  options?: SQLGenerationOptions
): string {
  const { restrictiveWarnings, membershipHints } = buildGroupWarnings(group);
  const warnings = [...restrictiveWarnings, ...membershipHints];
  const body = group.policies.map((p) => p.toSQL(options)).join(';\n\n') + ';';
  const header = group.description ? `-- ${group.description}\n` : '';
  const warningBlock = warnings.length > 0 ? warnings.join('\n') + '\n' : '';
  return `${header}${warningBlock}${body}`;
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
  return group.policies.flatMap((p) =>
    p.toSQL(options)
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s + ';')
  );
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
