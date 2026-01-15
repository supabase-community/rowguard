/**
 * Policy builder with fluent API
 */

import {
  PolicyDefinition,
  PolicyBuilderState,
  PolicyOperation,
  Condition,
  SQLGenerationOptions,
  ComparisonCondition,
  MembershipCondition,
  LogicalCondition,
  SubqueryDefinition,
  ContextValue,
  HelperCondition,
} from "./types";
import { escapeIdentifier } from "./sql";
import { ConditionChain, column, hasRole } from "./column";
import { SubqueryBuilder } from "./subquery-builder";

/**
 * Type guard to check if an object has a toCondition method
 */
function hasToCondition(obj: unknown): obj is { toCondition(): Condition } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "toCondition" in obj &&
    typeof (obj as { toCondition: unknown }).toCondition === "function"
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
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type: string }).type === "context"
  );
}

type ColumnAddFn = (table: string, column: string) => void;
type AliasMap = Map<string, string>;

function parseColumnReference(
  columnRef: string,
  currentTable: string,
  aliasMap: AliasMap
): { table: string; column: string } {
  const parts = columnRef.includes(".")
    ? columnRef.split(".")
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
  if (!subquery.join) return;

  const joinTableAlias = subquery.join.alias || subquery.join.table;
  registerAlias(subquery.join.alias, subquery.join.table, aliasMap);
  processCondition(subquery.join.on, mainTableAlias);
  processCondition(subquery.join.on, joinTableAlias);
}

function processSubqueryForIndexing(
  subquery: SubqueryDefinition,
  aliasMap: AliasMap,
  processCondition: (cond: Condition, table: string) => void
): void {
  const mainTableAlias = subquery.alias || subquery.from;
  registerAlias(subquery.alias, subquery.from, aliasMap);
  processSubqueryJoin(subquery, mainTableAlias, aliasMap, processCondition);
  if (subquery.where) {
    processCondition(subquery.where, mainTableAlias);
  }
}

function processComparisonCondition(
  comp: ComparisonCondition,
  currentTable: string,
  aliasMap: AliasMap,
  addColumn: ColumnAddFn
): void {
  if (comp.operator !== "eq") return;

  const { table, column } = parseColumnReference(
    comp.column,
    currentTable,
    aliasMap
  );

  const shouldIndex =
    isContextValue(comp.value) ||
    (typeof comp.value === "object" &&
      comp.value !== null &&
      "toSQL" in comp.value &&
      typeof (comp.value as { toSQL(): string }).toSQL === "function");

  if (shouldIndex) {
    addColumn(table, column);
  } else if (typeof comp.value === "string" && comp.value.includes(".")) {
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
  if (mem.operator !== "in") return;

  const { table, column } = parseColumnReference(
    mem.column,
    currentTable,
    aliasMap
  );
  addColumn(table, column);

  if (mem.value instanceof SubqueryBuilder) {
    const subquery = mem.value.toSubquery();
    processSubqueryForIndexing(subquery, aliasMap, processCondition);
  } else if (
    typeof mem.value === "object" &&
    mem.value !== null &&
    "from" in mem.value
  ) {
    const subquery = mem.value as SubqueryDefinition;
    processSubqueryForIndexing(subquery, aliasMap, processCondition);
  }
}

function processHelperCondition(
  helper: HelperCondition,
  currentTable: string,
  addColumn: ColumnAddFn
): void {
  if (helper.helperType === "isMemberOf") {
    const localKey = helper.params.localKey as string;
    const localKeyParts = localKey.includes(".")
      ? localKey.split(".")
      : [currentTable, localKey];
    addColumn(localKeyParts[0], localKeyParts[1]);

    const joinTable = helper.params.joinTable as string;
    const foreignKey = helper.params.foreignKey as string;
    addColumn(joinTable, foreignKey);
    addColumn(joinTable, "user_id");
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
      case "comparison":
        processComparisonCondition(
          cond as ComparisonCondition,
          currentTable,
          aliasToTable,
          addColumn
        );
        break;

      case "membership":
        processMembershipCondition(
          cond as MembershipCondition,
          currentTable,
          aliasToTable,
          addColumn,
          processCondition
        );
        break;

      case "logical":
        (cond as LogicalCondition).conditions.forEach((c) =>
          processCondition(c, currentTable)
        );
        break;

      case "subquery": {
        const subqueryCond = cond as unknown as {
          type: "subquery";
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
          processCondition
        );
        break;
      }

      case "helper":
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
   */
  read(): this {
    return this.for("SELECT");
  }

  /**
   * User-focused alias for .for("INSERT") - allows creating rows
   */
  write(): this {
    return this.for("INSERT");
  }

  /**
   * User-focused alias for .for("UPDATE") - allows updating rows
   */
  update(): this {
    return this.for("UPDATE");
  }

  /**
   * User-focused alias for .for("DELETE") - allows deleting rows
   */
  delete(): this {
    return this.for("DELETE");
  }

  /**
   * User-focused alias for .for("ALL") - allows all operations
   */
  all(): this {
    return this.for("ALL");
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
   */
  when(condition: Condition | ConditionChain): this {
    this.state.using = normalizeCondition(condition);
    return this;
  }

  /**
   * Set the WITH CHECK clause (write validation)
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
   */
  allow(condition: Condition | ConditionChain): this {
    const operation = this.state.operation;

    if (!operation) {
      throw new Error("Must call .for(), .read(), .write(), .update(), .delete(), or .all() before .allow()");
    }

    const normalizedCondition = normalizeCondition(condition);

    // SELECT and DELETE only need USING (read filter)
    if (operation === "SELECT" || operation === "DELETE") {
      this.state.using = normalizedCondition;
    }
    // INSERT only needs WITH CHECK (write validation)
    else if (operation === "INSERT") {
      this.state.withCheck = normalizedCondition;
    }
    // UPDATE and ALL need both USING and WITH CHECK
    else if (operation === "UPDATE" || operation === "ALL") {
      this.state.using = normalizedCondition;
      this.state.withCheck = normalizedCondition;
    }

    return this;
  }

  /**
   * Set policy as RESTRICTIVE
   */
  restrictive(): this {
    this.state.type = "RESTRICTIVE";
    return this;
  }

  /**
   * Set policy as PERMISSIVE (default)
   */
  permissive(): this {
    this.state.type = "PERMISSIVE";
    return this;
  }

  /**
   * User-focused alias for .restrictive() - all policies must pass
   */
  requireAll(): this {
    return this.restrictive();
  }

  /**
   * User-focused alias for .permissive() - any policy can grant access
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
   * Get the policy definition
   */
  toDefinition(): PolicyDefinition {
    if (!this.state.name) {
      throw new Error("Policy name is required");
    }
    if (!this.state.table) {
      throw new Error("Policy table is required");
    }
    if (!this.state.operation) {
      throw new Error("Policy operation is required");
    }

    return {
      name: this.state.name,
      table: this.state.table,
      operation: this.state.operation,
      role: this.state.role,
      type: this.state.type || "PERMISSIVE",
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

    if (def.type === "RESTRICTIVE") {
      parts.push("AS RESTRICTIVE");
    }

    parts.push(`FOR ${def.operation}`);

    if (def.role) {
      parts.push(`TO ${escapeIdentifier(def.role)}`);
    }

    if (def.using) {
      parts.push(`USING (${def.using.toSQL()})`);
    }

    if (def.withCheck) {
      parts.push(`WITH CHECK (${def.withCheck.toSQL()})`);
    }

    const policySQL = parts.join(" ");

    // Generate indexes if requested
    if (options?.includeIndexes) {
      const tableColumns = new Map<string, Set<string>>();

      // Extract columns from USING clause
      if (def.using) {
        const usingColumns = extractIndexableColumns(def.using, def.table);
        usingColumns.forEach((columns, table) => {
          if (!tableColumns.has(table)) {
            tableColumns.set(table, new Set<string>());
          }
          columns.forEach((col) => tableColumns.get(table)!.add(col));
        });
      }

      // Extract columns from WITH CHECK clause
      if (def.withCheck) {
        const checkColumns = extractIndexableColumns(def.withCheck, def.table);
        checkColumns.forEach((columns, table) => {
          if (!tableColumns.has(table)) {
            tableColumns.set(table, new Set<string>());
          }
          columns.forEach((col) => tableColumns.get(table)!.add(col));
        });
      }

      if (tableColumns.size > 0) {
        const indexSQLs = generateIndexSQL(tableColumns);
        return `${policySQL};\n\n${indexSQLs.join("\n")}`;
      }
    }

    return policySQL;
  }
}

/**
 * Create a new policy builder
 */
export function createPolicy(name: string): PolicyBuilder {
  return new PolicyBuilder(name);
}

/**
 * Policy template helpers for common patterns
 */
export const policies = {
  /**
   * User ownership policy - users can only access their own rows
   * @param table Table name
   * @param operations Operations to allow (default: ALL)
   * @param userIdColumn Column containing user ID (default: user_id)
   */
  userOwned(
    table: string,
    operations: PolicyOperation | PolicyOperation[] = "ALL",
    userIdColumn: string = "user_id"
  ): PolicyBuilder[] {
    const ops = Array.isArray(operations) ? operations : [operations];

    return ops.map((op) => {
      const policy = createPolicy(`${table}_${op.toLowerCase()}_owner`)
        .on(table)
        .for(op);

      // SELECT and DELETE need USING (read filter)
      if (
        op === "SELECT" ||
        op === "DELETE" ||
        op === "UPDATE" ||
        op === "ALL"
      ) {
        policy.when(column(userIdColumn).isOwner());
      }
      // INSERT, UPDATE, and DELETE need WITH CHECK (write validation)
      if (
        op === "INSERT" ||
        op === "UPDATE" ||
        op === "DELETE" ||
        op === "ALL"
      ) {
        policy.withCheck(column(userIdColumn).isOwner());
      }

      return policy;
    });
  },

  /**
   * Tenant isolation policy - users can only access rows from their tenant
   * @param table Table name
   * @param tenantColumn Column containing tenant ID (default: tenant_id)
   * @param sessionKey Session variable key (default: app.current_tenant_id)
   */
  tenantIsolation(
    table: string,
    tenantColumn: string = "tenant_id",
    sessionKey: string = "app.current_tenant_id"
  ): PolicyBuilder {
    return createPolicy(`${table}_tenant_isolation`)
      .on(table)
      .for("ALL")
      .restrictive()
      .when(column(tenantColumn).belongsToTenant(sessionKey));
  },

  /**
   * Public access policy - anyone can read public rows
   * @param table Table name
   * @param visibilityColumn Column indicating public visibility (default: is_public)
   */
  publicAccess(
    table: string,
    visibilityColumn: string = "is_public"
  ): PolicyBuilder {
    return createPolicy(`${table}_public_access`)
      .on(table)
      .for("SELECT")
      .when(column(visibilityColumn).isPublic());
  },

  /**
   * Role-based access policy - only specific roles can access
   * @param table Table name
   * @param role Role name
   * @param operations Operations to allow (default: ALL)
   */
  roleAccess(
    table: string,
    role: string,
    operations: PolicyOperation | PolicyOperation[] = "ALL"
  ): PolicyBuilder[] {
    const ops = Array.isArray(operations) ? operations : [operations];

    return ops.map((op) =>
      createPolicy(`${table}_${op.toLowerCase()}_${role}`)
        .on(table)
        .for(op)
        .when(hasRole(role))
    );
  },
};
