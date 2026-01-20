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
  SQLExpression,
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

/** @internal Version marker for CI testing */
export const _VERSION = "1.0.1";

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

  /**
   * Equals comparison
   *
   * @example
   * ```typescript
   * // Compare with literal value
   * column('status').eq('active')
   *
   * // Compare with auth context
   * column('user_id').eq(auth.uid())
   *
   * // Compare with session variable
   * column('tenant_id').eq(session.get('app.tenant_id', 'integer'))
   * ```
   */
  eq(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "eq", normalizedValue)
    );
  }

  /**
   * Not equals comparison
   *
   * @example
   * ```typescript
   * column('status').neq('deleted')
   * column('user_id').neq(auth.uid())
   * ```
   */
  neq(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "neq", normalizedValue)
    );
  }

  /**
   * Greater than comparison
   *
   * @example
   * ```typescript
   * column('age').gt(18)
   * column('price').gt(100)
   * column('created_at').gt(new Date('2024-01-01'))
   * ```
   */
  gt(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "gt", normalizedValue)
    );
  }

  /**
   * Greater than or equal comparison
   *
   * @example
   * ```typescript
   * column('age').gte(18)
   * column('quantity').gte(1)
   * ```
   */
  gte(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "gte", normalizedValue)
    );
  }

  /**
   * Less than comparison
   *
   * @example
   * ```typescript
   * column('age').lt(65)
   * column('stock').lt(10)
   * ```
   */
  lt(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "lt", normalizedValue)
    );
  }

  /**
   * Less than or equal comparison
   *
   * @example
   * ```typescript
   * column('price').lte(100)
   * column('discount').lte(50)
   * ```
   */
  lte(
    value: string | number | boolean | Date | null | Condition | ConditionChain | SQLExpression
  ): ConditionChain {
    const normalizedValue =
      value instanceof ConditionChain ? value.toCondition() : value;
    return new ConditionChain(
      createComparison(this.columnName, "lte", normalizedValue)
    );
  }

  /**
   * LIKE pattern matching (case-sensitive)
   *
   * @example
   * ```typescript
   * column('email').like('%@company.com')
   * column('name').like('John%')
   * column('code').like('PRE_%')
   * ```
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
   *
   * @example
   * ```typescript
   * column('name').ilike('john%')  // Matches 'John', 'JOHN', 'john'
   * column('email').ilike('%@COMPANY.COM')
   * ```
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
   *
   * @example
   * ```typescript
   * // Array of values
   * column('status').in(['active', 'pending', 'approved'])
   *
   * // Subquery
   * column('id').in(
   *   from('project_members')
   *     .select('project_id')
   *     .where(column('user_id').eq(auth.uid()))
   * )
   * ```
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
   *
   * @example
   * ```typescript
   * // Check if array column contains values
   * column('tags').contains(['important', 'urgent'])
   *
   * // Check if JSONB contains value
   * column('metadata').contains({ status: 'active' })
   * ```
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
   *
   * @example
   * ```typescript
   * // Allow access if deleted_at is null (not deleted)
   * column('deleted_at').isNull()
   *
   * // Check for optional field
   * column('approved_at').isNull()
   * ```
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
   *
   * @example
   * ```typescript
   * // Only show verified users
   * column('verified_at').isNotNull()
   *
   * // Only show published posts
   * column('published_at').isNotNull()
   * ```
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
   *
   * Shorthand for `.eq(auth.uid())` - commonly used for user ownership checks.
   *
   * @example
   * ```typescript
   * // Users can only see their own documents
   * policy('user_docs')
   *   .on('documents')
   *   .read()
   *   .when(column('user_id').isOwner());
   *
   * // Users can only update their own profile
   * policy('update_profile')
   *   .on('profiles')
   *   .update()
   *   .when(column('user_id').isOwner());
   * ```
   */
  isOwner(): ConditionChain {
    return this.eq(auth.uid());
  }

  /**
   * Check if column equals true (public visibility check)
   *
   * Shorthand for `.eq(true)` - commonly used for public visibility.
   *
   * @example
   * ```typescript
   * // Anyone can see public documents
   * policy('public_docs')
   *   .on('documents')
   *   .read()
   *   .when(column('is_public').isPublic());
   *
   * // Users can see their own docs OR public docs
   * policy('view_docs')
   *   .on('documents')
   *   .read()
   *   .when(
   *     column('user_id').isOwner()
   *       .or(column('is_public').isPublic())
   *   );
   * ```
   */
  isPublic(): ConditionChain {
    return this.eq(true);
  }

  /**
   * Check if column equals the tenant ID from session variable (multi-tenant isolation)
   *
   * Shorthand for `.eq(session.get(sessionKey, 'integer'))` - used for tenant isolation.
   *
   * @param sessionKey Session variable key (default: 'app.current_tenant_id')
   *
   * @example
   * ```typescript
   * // Restrict all access to current tenant
   * policy('tenant_isolation')
   *   .on('documents')
   *   .all()
   *   .requireAll()
   *   .when(column('tenant_id').belongsToTenant());
   *
   * // Custom session key
   * policy('org_isolation')
   *   .on('projects')
   *   .all()
   *   .requireAll()
   *   .when(column('org_id').belongsToTenant('app.current_org_id'));
   * ```
   */
  belongsToTenant(
    sessionKey: string = "app.current_tenant_id"
  ): ConditionChain {
    return this.eq(session.get(sessionKey, "integer"));
  }

  /**
   * Check if column value is in a subquery from a join table where user is a member
   *
   * Generates an IN subquery to check membership in a join table.
   *
   * @param joinTable The join/membership table name
   * @param foreignKey The foreign key column in the join table
   * @param localKey The local key column in the current table (default: 'id')
   *
   * @example
   * ```typescript
   * // Users can see projects they're members of
   * policy('member_projects')
   *   .on('projects')
   *   .read()
   *   .when(column('id').isMemberOf('project_members', 'project_id'));
   *
   * // Users can see organizations they belong to
   * policy('org_access')
   *   .on('organizations')
   *   .read()
   *   .when(
   *     column('id').isMemberOf('organization_members', 'organization_id')
   *   );
   * ```
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
 * policy('admin_access')
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
 * policy('admin_access')
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
 * policy('custom_access')
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
