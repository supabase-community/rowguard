/**
 * Column-based fluent API for building conditions
 * Provides a JavaScript-friendly way to build RLS policy conditions with natural method chaining
 */

import {
  Condition,
  PatternCondition,
  MembershipCondition,
  NullCondition,
  LogicalCondition,
  HelperCondition,
  FunctionCondition,
} from "./types";
import { auth, session } from "./context";
import {
  escapeIdentifier,
  escapeValue,
  subqueryToSQL,
  createComparison,
} from "./sql";
import { SubqueryBuilder } from "./subquery-builder";
import { from } from "./subquery-builder";

/**
 * Wrapper class that allows chaining conditions with .and() and .or()
 */
export class ConditionChain {
  private condition: Condition;

  constructor(condition: Condition) {
    this.condition = condition;
  }

  private flattenConditions(
    left: Condition,
    right: Condition,
    operator: "AND" | "OR"
  ): Condition[] {
    const leftConditions =
      left.type === "logical" &&
      (left as LogicalCondition).operator === operator
        ? (left as LogicalCondition).conditions
        : [left];
    const rightConditions =
      right.type === "logical" &&
      (right as LogicalCondition).operator === operator
        ? (right as LogicalCondition).conditions
        : [right];
    return [...leftConditions, ...rightConditions];
  }

  private chainWith(
    other: Condition | ConditionChain,
    operator: "AND" | "OR"
  ): ConditionChain {
    const otherCondition =
      other instanceof ConditionChain ? other.toCondition() : other;
    const flattened = this.flattenConditions(
      this.condition,
      otherCondition,
      operator
    );
    return new ConditionChain({
      type: "logical",
      operator,
      conditions: flattened,
      toSQL(): string {
        return `(${flattened.map((c) => c.toSQL()).join(` ${operator} `)})`;
      },
    } as LogicalCondition);
  }

  and(other: Condition | ConditionChain): ConditionChain {
    return this.chainWith(other, "AND");
  }

  or(other: Condition | ConditionChain): ConditionChain {
    return this.chainWith(other, "OR");
  }

  /**
   * Convert to Condition (for compatibility with existing API)
   */
  toCondition(): Condition {
    return this.condition;
  }

  /**
   * Generate SQL (implements Condition interface)
   */
  toSQL(): string {
    return this.condition.toSQL();
  }
}

/**
 * Column builder class for fluent condition building
 */
export class ColumnBuilder {
  private columnName: string;

  constructor(columnName: string) {
    this.columnName = columnName;
  }

  eq(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "eq", normalizedValue)
    );
  }

  neq(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "neq", normalizedValue)
    );
  }

  gt(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "gt", normalizedValue)
    );
  }

  gte(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "gte", normalizedValue)
    );
  }

  lt(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "lt", normalizedValue)
    );
  }

  lte(
    value: string | number | boolean | Date | null | Condition | ConditionChain
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "lte", normalizedValue)
    );
  }

  /**
   * LIKE pattern matching (case-sensitive)
   */
  like(pattern: string): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "pattern",
      column: colName,
      operator: "like",
      pattern,
      toSQL(): string {
        return `${escapeIdentifier(colName)} LIKE ${escapeValue(pattern)}`;
      },
    } as PatternCondition);
  }

  /**
   * ILIKE pattern matching (case-insensitive)
   */
  ilike(pattern: string): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "pattern",
      column: colName,
      operator: "ilike",
      pattern,
      toSQL(): string {
        return `${escapeIdentifier(colName)} ILIKE ${escapeValue(pattern)}`;
      },
    } as PatternCondition);
  }

  /**
   * IN membership check
   */
  in(
    values: (string | number | boolean | Date | null)[] | SubqueryBuilder
  ): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "membership",
      column: colName,
      operator: "in",
      value: values,
      toSQL(): string {
        if (Array.isArray(values)) {
          const valuesList = values.map(escapeValue).join(", ");
          return `${escapeIdentifier(colName)} IN (${valuesList})`;
        } else {
          return `${escapeIdentifier(colName)} IN ${subqueryToSQL(
            values.toSubquery()
          )}`;
        }
      },
    } as MembershipCondition);
  }

  /**
   * Contains operator (for arrays/JSONB)
   */
  contains(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | (string | number | boolean | Date | null)[]
  ): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "membership",
      column: colName,
      operator: "contains",
      value,
      toSQL(): string {
        return `${escapeIdentifier(colName)} @> ${escapeValue(value)}`;
      },
    } as MembershipCondition);
  }

  /**
   * IS NULL check
   */
  isNull(): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "null",
      column: colName,
      value: null,
      toSQL(): string {
        return `${escapeIdentifier(colName)} IS NULL`;
      },
    } as NullCondition);
  }

  /**
   * IS NOT NULL check
   */
  isNotNull(): ConditionChain {
    const colName = this.columnName;
    return new ConditionChain({
      type: "null",
      column: colName,
      value: "not null",
      toSQL(): string {
        return `${escapeIdentifier(colName)} IS NOT NULL`;
      },
    } as NullCondition);
  }

  /**
   * Check if column equals current user ID (owner check)
   */
  isOwner(): ConditionChain {
    return this.eq(auth.uid());
  }

  /**
   * Check if column equals true (public visibility check)
   */
  isPublic(): ConditionChain {
    return this.eq(true);
  }

  /**
   * Check if column equals the tenant ID from session variable (multi-tenant isolation)
   * @param sessionKey Session variable key (default: 'app.current_tenant_id')
   */
  belongsToTenant(
    sessionKey: string = "app.current_tenant_id"
  ): ConditionChain {
    return this.eq(session.get(sessionKey, "integer"));
  }

  /**
   * Check if column value is in a subquery from a join table where user is a member
   * @param joinTable The join/membership table name
   * @param foreignKey The foreign key column in the join table
   * @param localKey The local key column in the current table (default: 'id')
   */
  isMemberOf(
    joinTable: string,
    foreignKey: string,
    localKey: string = "id"
  ): ConditionChain {
    return new ConditionChain({
      type: "helper",
      helperType: "isMemberOf",
      params: { joinTable, foreignKey, localKey },
      toSQL(): string {
        return `${escapeIdentifier(localKey)} IN (
          SELECT ${escapeIdentifier(foreignKey)}
          FROM ${escapeIdentifier(joinTable)}
          WHERE ${escapeIdentifier("user_id")} = ${auth.uid().toSQL()}
        )`;
      },
    } as HelperCondition);
  }

  /**
   * Check if column value belongs to user via membership table
   * @param membershipTable The membership table name
   * @param membershipColumn Optional column name in membership table (defaults to same as column)
   */
  userBelongsTo(
    membershipTable: string,
    membershipColumn?: string
  ): ConditionChain {
    const colName = this.columnName;
    const selectColumn = membershipColumn || colName;
    return this.in(
      from(membershipTable)
        .select(selectColumn)
        .where(column("user_id").eq(auth.uid()))
    );
  }

  /**
   * Check if column (date) is less than or equal to a reference date
   * @param referenceDate Optional reference date (defaults to current date)
   */
  releasedBefore(referenceDate?: Date): ConditionChain {
    const date = referenceDate || new Date();
    return this.lte(date);
  }
}

/**
 * Helper function to check if user has a specific role
 * @param role Role name to check
 * @param userRolesTable Table containing user roles (default: 'user_roles')
 * @returns A ConditionChain that can be chained with .and() or .or()
 *
 * @example
 * ```typescript
 * createPolicy('admin_access')
 *   .on('admin_data')
 *   .for('SELECT')
 *   .when(hasRole('admin'))
 * ```
 */
export function hasRole(
  role: string,
  userRolesTable: string = "user_roles"
): ConditionChain {
  return new ConditionChain({
    type: "helper",
    helperType: "hasRole",
    params: { role, userRolesTable },
    toSQL(): string {
      return `EXISTS (
        SELECT 1
        FROM ${escapeIdentifier(userRolesTable)}
        WHERE ${escapeIdentifier("user_id")} = ${auth.uid().toSQL()}
        AND ${escapeIdentifier("role")} = ${escapeValue(role)}
      )`;
    },
  } as HelperCondition);
}

/**
 * Helper function that always returns true (allows all access)
 * @returns A ConditionChain that can be chained with .and() or .or()
 *
 * @example
 * ```typescript
 * createPolicy('admin_access')
 *   .on('admin_data')
 *   .for('SELECT')
 *   .when(alwaysTrue())
 * ```
 */
export function alwaysTrue(): ConditionChain {
  return new ConditionChain({
    type: "helper",
    helperType: "alwaysTrue",
    params: {},
    toSQL(): string {
      return "true";
    },
  } as HelperCondition);
}

/**
 * Helper function to call a custom SQL function
 * @param functionName The name of the function to call
 * @param args Arguments to pass to the function
 * @returns A ConditionChain that can be chained with .and() or .or()
 *
 * @example
 * ```typescript
 * createPolicy('custom_access')
 *   .on('data')
 *   .for('SELECT')
 *   .when(call('check_permission', ['user_id', 'read']))
 * ```
 */
export function call(
  functionName: string,
  args: (string | Condition | ConditionChain)[]
): ConditionChain {
  const normalizedArgs = args.map((arg) =>
    arg instanceof ConditionChain ? arg.toCondition() : arg
  );
  return new ConditionChain({
    type: "function",
    functionName,
    arguments: normalizedArgs,
    toSQL(): string {
      const argsList = normalizedArgs
        .map((arg) =>
          typeof arg === "string" ? escapeIdentifier(arg) : arg.toSQL()
        )
        .join(", ");
      return `${escapeIdentifier(functionName)}(${argsList})`;
    },
  } as FunctionCondition);
}

/**
 * Create a column builder for fluent condition building
 * @param columnName The name of the column
 * @returns A ColumnBuilder instance
 *
 * @example
 * ```typescript
 * // Simple comparison
 * column('user_id').eq(auth.uid())
 *
 * // Chained conditions
 * column('user_id').eq(auth.uid()).or(column('is_public').eq(true))
 *
 * // Complex nested conditions
 * column('status').eq('active').and(
 *   column('user_id').eq(auth.uid()).or(column('is_public').eq(true))
 * )
 * ```
 */
export function column(columnName: string): ColumnBuilder {
  return new ColumnBuilder(columnName);
}
