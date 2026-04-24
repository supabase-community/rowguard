/**
 * Policy builder with fluent API
 */

import type {
  ComparisonCondition,
  Condition,
  ContextValue,
  HelperCondition,
  LogicalCondition,
  MembershipCondition,
  PolicyBuilderState,
  PolicyDefinition,
  PolicyOperation,
  SQLGenerationOptions,
  SubqueryDefinition,
} from './types';
import { escapeIdentifier, sanitizePolicyName } from './sql';

const POSTGRES_ROLE_KEYWORDS = new Set(['public', 'current_user', 'current_role', 'session_user']);

function escapeRole(role: string): string {
  return POSTGRES_ROLE_KEYWORDS.has(role.toLowerCase()) ? role : escapeIdentifier(role);
}
import { ConditionChain } from './column';
import { SubqueryBuilder } from './subquery-builder';

/**
 * Type guard to check if an object has a toCondition method
 */
function hasToCondition(obj: unknown): obj is { toCondition(): Condition } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'toCondition' in obj &&
    typeof (obj as { toCondition: unknown }).toCondition === 'function'
  );
}

/**
 * Normalize a condition input (Condition or ConditionChain) to a Condition
 */
function normalizeCondition(
  input: Condition | ConditionChain | { toCondition(): Condition }
): Condition {
  if (input instanceof ConditionChain || hasToCondition(input)) {
    return (
      input as ConditionChain | { toCondition(): Condition }
    ).toCondition();
  }
  return input as Condition;
}

/**
 * Check if a value is a context value (auth.uid(), session variable, etc.)
 */
function isContextValue(value: unknown): value is ContextValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type: string }).type === 'context'
  );
}

type ColumnAddFn = (table: string, column: string) => void;
type AliasMap = Map<string, string>;

function parseColumnReference(
  columnRef: string,
  currentTable: string,
  aliasMap: AliasMap
): { table: string; column: string } {
  const parts = columnRef.includes('.')
    ? columnRef.split('.')
    : [currentTable, columnRef];
  const table = aliasMap.get(parts[0]) || parts[0];
  return { table, column: parts[1] };
}

function registerAlias(
  alias: string | undefined,
  tableName: string,
  aliasMap: AliasMap
): void {
  if (alias) {
    aliasMap.set(alias, tableName);
  }
}

function processSubqueryJoin(
  subquery: SubqueryDefinition,
  mainTableAlias: string,
  aliasMap: AliasMap,
  processCondition: (cond: Condition, table: string) => void
): void {
  const joins = subquery.joins ?? (subquery.join ? [subquery.join] : []);
  for (const join of joins) {
    const joinTableAlias = join.alias || join.table;
    registerAlias(join.alias, join.table, aliasMap);
    processCondition(join.on, mainTableAlias);
    processCondition(join.on, joinTableAlias);
  }
}

function processSubqueryForIndexing(
  subquery: SubqueryDefinition,
  aliasMap: AliasMap,
  processCondition: (cond: Condition, table: string) => void,
  addColumn: ColumnAddFn
): void {
  const mainTableAlias = subquery.alias || subquery.from;
  registerAlias(subquery.alias, subquery.from, aliasMap);
  processSubqueryJoin(subquery, mainTableAlias, aliasMap, processCondition);
  if (subquery.where) {
    processCondition(subquery.where, mainTableAlias);
  }
  const selectCols = Array.isArray(subquery.select) ? subquery.select : [subquery.select];
  for (const col of selectCols) {
    if (col && col !== '*') addColumn(subquery.from, col);
  }
}

function processComparisonCondition(
  comp: ComparisonCondition,
  currentTable: string,
  aliasMap: AliasMap,
  addColumn: ColumnAddFn
): void {
  if (comp.operator !== 'eq') return;

  const { table, column } = parseColumnReference(
    comp.column,
    currentTable,
    aliasMap
  );

  const shouldIndex =
    isContextValue(comp.value) ||
    (typeof comp.value === 'object' &&
      comp.value !== null &&
      'toSQL' in comp.value &&
      typeof (comp.value as { toSQL(): string }).toSQL === 'function');

  if (shouldIndex) {
    addColumn(table, column);
  } else if (typeof comp.value === 'string' && comp.value.includes('.')) {
    addColumn(table, column);
    const rightSide = parseColumnReference(comp.value, currentTable, aliasMap);
    addColumn(rightSide.table, rightSide.column);
  }
}

function processMembershipCondition(
  mem: MembershipCondition,
  currentTable: string,
  aliasMap: AliasMap,
  addColumn: ColumnAddFn,
  processCondition: (cond: Condition, table: string) => void
): void {
  if (mem.operator !== 'in') return;

  const { table, column } = parseColumnReference(
    mem.column,
    currentTable,
    aliasMap
  );
  addColumn(table, column);

  if (mem.value instanceof SubqueryBuilder) {
    const subquery = mem.value.toSubquery();
    processSubqueryForIndexing(subquery, aliasMap, processCondition, addColumn);
  } else if (
    typeof mem.value === 'object' &&
    mem.value !== null &&
    'from' in mem.value
  ) {
    const subquery = mem.value as SubqueryDefinition;
    processSubqueryForIndexing(subquery, aliasMap, processCondition, addColumn);
  }
}

function processHelperCondition(
  helper: HelperCondition,
  currentTable: string,
  addColumn: ColumnAddFn
): void {
  if (helper.helperType === 'isMemberOf') {
    const localKey = helper.params.localKey as string;
    const localKeyParts = localKey.includes('.')
      ? localKey.split('.')
      : [currentTable, localKey];
    addColumn(localKeyParts[0], localKeyParts[1]);

    const joinTable = helper.params.joinTable as string;
    const foreignKey = helper.params.foreignKey as string;
    addColumn(joinTable, foreignKey);
    const userIdColumn = (helper.params.userIdColumn as string) || 'user_id';
    addColumn(joinTable, userIdColumn);
  }
}

function extractIndexableColumns(
  condition: Condition | undefined,
  tableName: string
): Map<string, Set<string>> {
  const tableColumns = new Map<string, Set<string>>();
  const aliasToTable: AliasMap = new Map<string, string>();

  if (!condition) {
    return tableColumns;
  }

  const addColumn: ColumnAddFn = (table, column) => {
    const actualTable = aliasToTable.get(table) || table;
    if (!tableColumns.has(actualTable)) {
      tableColumns.set(actualTable, new Set<string>());
    }
    tableColumns.get(actualTable)!.add(column);
  };

  function processCondition(cond: Condition, currentTable: string): void {
    switch (cond.type) {
      case 'comparison':
        processComparisonCondition(
          cond as ComparisonCondition,
          currentTable,
          aliasToTable,
          addColumn
        );
        break;

      case 'membership':
        processMembershipCondition(
          cond as MembershipCondition,
          currentTable,
          aliasToTable,
          addColumn,
          processCondition
        );
        break;

      case 'logical':
        (cond as LogicalCondition).conditions.forEach((c) =>
          processCondition(c, currentTable)
        );
        break;

      case 'subquery': {
        const subqueryCond = cond as unknown as {
          type: 'subquery';
          column: string;
          subquery: SubqueryDefinition;
        };
        const { table, column } = parseColumnReference(
          subqueryCond.column,
          currentTable,
          aliasToTable
        );
        addColumn(table, column);
        processSubqueryForIndexing(
          subqueryCond.subquery,
          aliasToTable,
          processCondition,
          addColumn
        );
        break;
      }

      case 'helper':
        processHelperCondition(
          cond as HelperCondition,
          currentTable,
          addColumn
        );
        break;
    }
  }

  processCondition(condition, tableName);
  return tableColumns;
}

/**
 * Generate CREATE INDEX statements for columns
 */
function generateIndexSQL(tableColumns: Map<string, Set<string>>): string[] {
  const indexes: string[] = [];

  tableColumns.forEach((columns, tableName) => {
    columns.forEach((columnName) => {
      const indexName = `idx_${tableName}_${columnName}`;
      indexes.push(
        `CREATE INDEX IF NOT EXISTS ${escapeIdentifier(
          indexName
        )} ON ${escapeIdentifier(tableName)} (${escapeIdentifier(columnName)});`
      );
    });
  });

  return indexes;
}

function collectMembershipTables(conditions: Condition[]): string[] {
  const tables = new Set<string>();
  function walk(c: Condition) {
    if (c.type === 'helper' && (c as HelperCondition).helperType === 'isMemberOf') {
      tables.add((c as HelperCondition).params.joinTable as string);
    }
    if (c.type === 'logical') {
      (c as LogicalCondition).conditions.forEach(walk);
    }
    if (c.type === 'membership' && (c as MembershipCondition).operator === 'in') {
      const val = (c as MembershipCondition).value;
      if (val instanceof SubqueryBuilder) {
        tables.add(val.toSubquery().from);
      }
    }
  }
  conditions.forEach(walk);
  return [...tables];
}

/**
 * Policy builder class implementing fluent API
 */
export class PolicyBuilder {
  private state: PolicyBuilderState = {};

  constructor(name?: string) {
    if (name) {
      this.state.name = name;
    }
  }

  /**
   * Specify the table for this policy
   */
  on(table: string): this {
    this.state.table = table;
    return this;
  }

  /**
   * Specify the operation(s) this policy applies to
   */
  for(operation: PolicyOperation): this {
    this.state.operation = operation;
    return this;
  }

  /**
   * User-focused alias for .for("SELECT") - allows reading rows
   *
   * @example
   * ```typescript
   * policy('view_docs')
   *   .on('documents')
   *   .read()
   *   .when(column('user_id').isOwner());
   * ```
   */
  read(): this {
    return this.for('SELECT');
  }

  /**
   * User-focused alias for .for("INSERT") - allows creating rows
   *
   * @example
   * ```typescript
   * policy('create_docs')
   *   .on('documents')
   *   .write()
   *   .withCheck(column('user_id').isOwner());
   * ```
   */
  write(): this {
    return this.for('INSERT');
  }

  /**
   * User-focused alias for .for("UPDATE") - allows updating rows
   *
   * @example
   * ```typescript
   * policy('update_docs')
   *   .on('documents')
   *   .update()
   *   .when(column('user_id').isOwner())
   *   .withCheck(column('user_id').isOwner());
   * ```
   */
  update(): this {
    return this.for('UPDATE');
  }

  /**
   * User-focused alias for .for("DELETE") - allows deleting rows
   *
   * @example
   * ```typescript
   * policy('delete_docs')
   *   .on('documents')
   *   .delete()
   *   .when(column('user_id').isOwner());
   * ```
   */
  delete(): this {
    return this.for('DELETE');
  }

  /**
   * User-focused alias for .for("ALL") - allows all operations
   *
   * @example
   * ```typescript
   * policy('full_access')
   *   .on('documents')
   *   .all()
   *   .when(column('user_id').isOwner());
   * ```
   */
  all(): this {
    return this.for('ALL');
  }

  /**
   * Specify the role this policy applies to
   */
  to(role: string): this {
    this.state.role = role;
    return this;
  }

  /**
   * Set the USING clause (read filter)
   *
   * Determines which existing rows can be seen/modified by the current user.
   *
   * @example
   * ```typescript
   * // Users can only see their own documents
   * policy('view_own_docs')
   *   .on('documents')
   *   .read()
   *   .when(column('user_id').isOwner());
   *
   * // Complex condition with OR
   * policy('view_docs')
   *   .on('documents')
   *   .read()
   *   .when(
   *     column('user_id').isOwner()
   *       .or(column('is_public').eq(true))
   *   );
   * ```
   */
  when(condition: Condition | ConditionChain): this {
    this.state.using = normalizeCondition(condition);
    return this;
  }

  /**
   * Set the WITH CHECK clause (write validation)
   *
   * Validates that new/modified rows meet the specified condition.
   *
   * @example
   * ```typescript
   * // Prevent users from creating documents for other users
   * policy('create_docs')
   *   .on('documents')
   *   .write()
   *   .withCheck(column('user_id').isOwner());
   *
   * // For UPDATE, use both when() and withCheck()
   * policy('update_docs')
   *   .on('documents')
   *   .update()
   *   .when(column('user_id').isOwner())  // Can only update own docs
   *   .withCheck(column('user_id').isOwner());  // Can't change ownership
   * ```
   */
  withCheck(condition: Condition | ConditionChain): this {
    this.state.withCheck = normalizeCondition(condition);
    return this;
  }

  /**
   * Type-safe method to set the appropriate clause(s) based on the operation.
   * - SELECT/DELETE: sets USING clause (read filter)
   * - INSERT: sets WITH CHECK clause (write validation)
   * - UPDATE/ALL: sets both USING and WITH CHECK clauses (same condition)
   *
   * @example
   * ```typescript
   * // For SELECT - sets USING only
   * policy('read_docs')
   *   .on('documents')
   *   .read()
   *   .allow(column('user_id').isOwner());
   *
   * // For INSERT - sets WITH CHECK only
   * policy('create_docs')
   *   .on('documents')
   *   .write()
   *   .allow(column('user_id').isOwner());
   *
   * // For UPDATE - sets both USING and WITH CHECK
   * policy('update_docs')
   *   .on('documents')
   *   .update()
   *   .allow(column('user_id').isOwner());
   * ```
   */
  allow(condition: Condition | ConditionChain): this {
    const operation = this.state.operation;

    if (!operation) {
      throw new Error(
        'Must call .for(), .read(), .write(), .update(), .delete(), or .all() before .allow()'
      );
    }

    const normalizedCondition = normalizeCondition(condition);

    // SELECT and DELETE only need USING (read filter)
    if (operation === 'SELECT' || operation === 'DELETE') {
      this.state.using = normalizedCondition;
    }
    // INSERT only needs WITH CHECK (write validation)
    else if (operation === 'INSERT') {
      this.state.withCheck = normalizedCondition;
    }
    // UPDATE and ALL need both USING and WITH CHECK
    else if (operation === 'UPDATE' || operation === 'ALL') {
      this.state.using = normalizedCondition;
      this.state.withCheck = normalizedCondition;
    }

    return this;
  }

  /**
   * Set policy as RESTRICTIVE
   */
  restrictive(): this {
    this.state.type = 'RESTRICTIVE';
    return this;
  }

  /**
   * Set policy as PERMISSIVE (default)
   */
  permissive(): this {
    this.state.type = 'PERMISSIVE';
    return this;
  }

  /**
   * User-focused alias for .restrictive() - all policies must pass
   *
   * Makes this policy RESTRICTIVE, meaning it must pass in addition to other policies.
   * Useful for adding constraints that apply to all operations (e.g., tenant isolation).
   *
   * @example
   * ```typescript
   * // Tenant isolation that restricts all other policies
   * policy('tenant_isolation')
   *   .on('documents')
   *   .all()
   *   .requireAll()  // This policy AND other policies must pass
   *   .when(column('tenant_id').belongsToTenant());
   *
   * // Now add a permissive policy for user access
   * policy('user_access')
   *   .on('documents')
   *   .read()
   *   .when(column('user_id').isOwner());
   * // Users can only see their own docs within their tenant
   * ```
   */
  requireAll(): this {
    return this.restrictive();
  }

  /**
   * User-focused alias for .permissive() - any policy can grant access
   *
   * Makes this policy PERMISSIVE (default), meaning if this policy passes,
   * access is granted (unless blocked by a RESTRICTIVE policy).
   *
   * @example
   * ```typescript
   * // Multiple ways to access documents
   * policy('owner_access')
   *   .on('documents')
   *   .read()
   *   .allowAny()  // Explicit, but this is the default
   *   .when(column('user_id').isOwner());
   *
   * policy('public_access')
   *   .on('documents')
   *   .read()
   *   .when(column('is_public').eq(true));
   * // User can see a document if EITHER policy passes
   * ```
   */
  allowAny(): this {
    return this.permissive();
  }

  /**
   * Add description/documentation
   */
  description(text: string): this {
    this.state.description = text;
    return this;
  }

  /**
   * Generate a policy name based on table, operation, and type
   */
  private generatePolicyName(): string {
    if (!this.state.table) {
      throw new Error('Cannot generate policy name: table is required');
    }
    if (!this.state.operation) {
      throw new Error('Cannot generate policy name: operation is required');
    }

    const table = this.state.table;
    const operation = this.state.operation.toLowerCase();
    const isRestrictive = this.state.type === 'RESTRICTIVE';

    if (isRestrictive) {
      return `${table}_${operation}_restrictive_policy`;
    }
    return `${table}_${operation}_policy`;
  }

  /**
   * Get the policy definition
   */
  toDefinition(): PolicyDefinition {
    if (!this.state.table) {
      throw new Error('Policy table is required');
    }
    if (!this.state.operation) {
      throw new Error('Policy operation is required');
    }

    // Use provided name or auto-generate one
    const rawName = this.state.name || this.generatePolicyName();
    // Sanitize the name for PostgreSQL compatibility
    const name = sanitizePolicyName(rawName);

    return {
      name,
      table: this.state.table,
      operation: this.state.operation,
      role: this.state.role,
      type: this.state.type || 'PERMISSIVE',
      using: this.state.using,
      withCheck: this.state.withCheck,
      description: this.state.description,
    };
  }

  /**
   * Generate SQL for this policy
   * Matches PostgreSQL CREATE POLICY syntax:
   * CREATE POLICY name ON table [AS PERMISSIVE|RESTRICTIVE] [FOR operation] [TO role] [USING ...] [WITH CHECK ...]
   * @param options Options for SQL generation (e.g., includeIndexes)
   */
  toSQL(options?: SQLGenerationOptions): string {
    const def = this.toDefinition();
    const parts: string[] = [];

    parts.push(`CREATE POLICY ${escapeIdentifier(def.name)}`);
    parts.push(`ON ${escapeIdentifier(def.table)}`);

    if (def.type === 'RESTRICTIVE') {
      parts.push('AS RESTRICTIVE');
    }

    parts.push(`FOR ${def.operation}`);

    if (def.role) {
      parts.push(`TO ${escapeRole(def.role)}`);
    }

    if (def.using) {
      parts.push(`USING (${def.using.toSQL()})`);
    }

    if (def.withCheck) {
      parts.push(`WITH CHECK (${def.withCheck.toSQL()})`);
    }

    const policySQL = parts.join(' ');

    if (options?.includeIndexes) {
      const stmts = this.indexStatementsFromDef(def);
      if (stmts.length > 0) return `${policySQL};\n\n${stmts.join('\n')}`;
    }

    return policySQL;
  }

  indexStatements(): string[] {
    try { return this.indexStatementsFromDef(this.toDefinition()); } catch { return []; }
  }

  private indexStatementsFromDef(def: PolicyDefinition): string[] {
    const tableColumns = new Map<string, Set<string>>();
    const mergeColumns = (condition: Condition) => {
      extractIndexableColumns(condition, def.table).forEach((cols, tbl) => {
        if (!tableColumns.has(tbl)) tableColumns.set(tbl, new Set());
        cols.forEach((col) => tableColumns.get(tbl)!.add(col));
      });
    };
    if (def.using) mergeColumns(def.using);
    if (def.withCheck && def.withCheck !== def.using) mergeColumns(def.withCheck);
    return generateIndexSQL(tableColumns);
  }

  /**
   * Returns the join/subquery tables referenced by membership conditions in this policy.
   * Used by policyGroupToSQL to emit companion-policy hints.
   * @internal
   */
  membershipTables(): string[] {
    const conditions = [this.state.using, this.state.withCheck].filter(Boolean) as Condition[];
    return collectMembershipTables(conditions);
  }

  /**
   * Validate the generated SQL against a live database without committing.
   * Wraps the check in its own transaction — do not call inside another transaction.
   *
   * Throws if the SQL is rejected by Postgres (syntax error, unknown table, etc.).
   *
   * @param client A pg Client or PoolClient
   *
   * @example
   * ```typescript
   * const client = await pool.connect();
   * await policy('p').on('documents').read().when(column('user_id').isOwner())
   *   .validate(client);
   * client.release();
   * ```
   */
  async validate(client: { query(sql: string): Promise<unknown> }): Promise<void> {
    const sql = this.toSQL();
    await client.query('BEGIN');
    try {
      await client.query(sql);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    await client.query('ROLLBACK');
  }
}

/**
 * Create a new policy builder
 *
 * @param name Optional name for the policy. If not provided, a name will be auto-generated
 *             based on the table, operation, and policy type.
 * @returns A PolicyBuilder instance for fluent API chaining
 *
 * @example
 * ```typescript
 * // Simple user ownership policy with explicit name
 * const p = policy('user_documents')
 *   .on('documents')
 *   .read()
 *   .when(column('user_id').isOwner());
 *
 * // Auto-generated name -> "documents_select_policy"
 * const p = policy()
 *   .on('documents')
 *   .read()
 *   .when(column('user_id').isOwner());
 *
 * // Auto-generated restrictive -> "documents_all_restrictive_policy"
 * const p = policy()
 *   .on('documents')
 *   .all()
 *   .restrictive()
 *   .when(column('tenant_id').belongsToTenant());
 * ```
 */
export function policy(name?: string): PolicyBuilder {
  return new PolicyBuilder(name);
}

export function collectUniqueIndexStatements(builders: PolicyBuilder[]): string[] {
  const seen = new Set<string>();
  return builders.flatMap((b) =>
    b.indexStatements().filter((stmt) => {
      if (seen.has(stmt)) return false;
      seen.add(stmt);
      return true;
    })
  );
}

