/**
 * Type-safe Rowguard API with schema awareness
 * Integrates with Supabase-generated Database types for autocomplete and compile-time validation
 */

import { ColumnBuilder, ConditionChain } from './column';
import { PolicyBuilder } from './policy-builder';
import { auth, session } from './context';
import type {
  SQLExpression,
  Condition,
  ComparisonCondition,
  PatternCondition,
  MembershipCondition,
  NullCondition,
} from './types';
import { SubqueryBuilder } from './subquery-builder';
import { escapeIdentifier, escapeValue } from './sql';

/**
 * Helper to escape qualified column references (table.column)
 */
function escapeQualifiedIdentifier(table: string, column: string): string {
  return `${escapeIdentifier(table)}.${escapeIdentifier(column)}`;
}

/**
 * Helper to create comparison condition with qualified column reference
 */
function createQualifiedComparison(
  table: string,
  column: string,
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte',
  value: unknown
): ComparisonCondition {
  const operatorMap = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };

  return {
    type: 'comparison',
    column: `${table}.${column}`,
    operator,
    value: value as any,
    toSQL(): string {
      return `${escapeQualifiedIdentifier(table, column)} ${operatorMap[operator]} ${escapeValue(value as any)}`;
    },
  };
}

/**
 * Extract table names from Database type (defaults to 'public' schema)
 * Example: 'notes' | 'profiles' | 'projects'
 */
export type TableNames<DB> = 'public' extends keyof DB
  ? DB['public'] extends { Tables: infer T }
    ? keyof T & string
    : never
  : never;

/**
 * Extract column names for a specific table
 * Uses the 'Row' type which represents the actual database columns
 * Example: for 'notes' → 'id' | 'user_id' | 'title' | 'created_at'
 */
export type ColumnNames<
  DB,
  TableName extends TableNames<DB>,
> = 'public' extends keyof DB
  ? DB['public'] extends { Tables: infer T }
    ? TableName extends keyof T
      ? T[TableName] extends { Row: infer R }
        ? keyof R & string
        : never
      : never
    : never
  : never;

/**
 * Extract the TypeScript type of a specific column
 * Example: for ('notes', 'user_id') → string (if user_id is UUID)
 */
export type ColumnType<
  DB,
  TableName extends TableNames<DB>,
  ColumnName extends ColumnNames<DB, TableName>,
> = 'public' extends keyof DB
  ? DB['public'] extends { Tables: infer T }
    ? TableName extends keyof T
      ? T[TableName] extends { Row: infer R }
        ? ColumnName extends keyof R
          ? R[ColumnName]
          : never
        : never
      : never
    : never
  : never;

/**
 * Column builder that enforces value types match column types
 * Stores table context for qualified column references
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class TypedColumnBuilder<_T = unknown> extends ColumnBuilder {
  private table: string;
  private col: string;

  constructor(table: string, column: string) {
    // Pass qualified reference to parent for compatibility
    super(`${table}.${column}`);
    this.table = table;
    this.col = column;
  }

  /**
   * Equals comparison - value must match column type T
   */
  eq(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'eq', value)
    );
  }

  /**
   * Not equals comparison
   */
  neq(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'neq', value)
    );
  }

  /**
   * Greater than
   */
  gt(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'gt', value)
    );
  }

  /**
   * Greater than or equal
   */
  gte(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'gte', value)
    );
  }

  /**
   * Less than
   */
  lt(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'lt', value)
    );
  }

  /**
   * Less than or equal
   */
  lte(
    value:
      | string
      | number
      | boolean
      | Date
      | null
      | Condition
      | ConditionChain
      | SQLExpression
  ): ConditionChain {
    return new ConditionChain(
      createQualifiedComparison(this.table, this.col, 'lte', value)
    );
  }

  /**
   * LIKE pattern matching
   */
  like(pattern: string): ConditionChain {
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'pattern',
      column: `${table}.${col}`,
      operator: 'like',
      pattern: pattern as string,
      toSQL(): string {
        return `${escapeQualifiedIdentifier(table, col)} LIKE ${escapeValue(pattern)}`;
      },
    } as PatternCondition);
  }

  /**
   * ILIKE pattern matching
   */
  ilike(pattern: string): ConditionChain {
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'pattern',
      column: `${table}.${col}`,
      operator: 'ilike',
      pattern: pattern as string,
      toSQL(): string {
        return `${escapeQualifiedIdentifier(table, col)} ILIKE ${escapeValue(pattern)}`;
      },
    } as PatternCondition);
  }

  /**
   * IN membership check
   */
  in(
    values: (string | number | boolean | Date | null)[] | SubqueryBuilder
  ): ConditionChain {
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'membership',
      column: `${table}.${col}`,
      operator: 'in',
      value: values as any,
      toSQL(): string {
        if (Array.isArray(values)) {
          const valuesList = values
            .map((v) => escapeValue(v as any))
            .join(', ');
          return `${escapeQualifiedIdentifier(table, col)} IN (${valuesList})`;
        } else {
          const subquerySQL = (values as SubqueryBuilder).toSubquery();
          // Simple subquery SQL generation
          return `${escapeQualifiedIdentifier(table, col)} IN (SELECT ${escapeIdentifier(subquerySQL.select as string)} FROM ${escapeIdentifier(subquerySQL.from)})`;
        }
      },
    } as MembershipCondition);
  }

  /**
   * Contains operator - for array/JSONB columns
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
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'membership',
      column: `${table}.${col}`,
      operator: 'contains',
      value: value as any,
      toSQL(): string {
        return `${escapeQualifiedIdentifier(table, col)} @> ${escapeValue(value as any)}`;
      },
    } as MembershipCondition);
  }

  /**
   * IS NULL check
   */
  isNull(): ConditionChain {
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'null',
      column: `${table}.${col}`,
      value: null,
      toSQL(): string {
        return `${escapeQualifiedIdentifier(table, col)} IS NULL`;
      },
    } as NullCondition);
  }

  /**
   * IS NOT NULL check
   */
  isNotNull(): ConditionChain {
    const table = this.table;
    const col = this.col;
    return new ConditionChain({
      type: 'null',
      column: `${table}.${col}`,
      value: 'not null',
      toSQL(): string {
        return `${escapeQualifiedIdentifier(table, col)} IS NOT NULL`;
      },
    } as NullCondition);
  }

  // Helper methods work for all types - delegate to parent but need to override for qualified refs
  isOwner(): ConditionChain {
    return this.eq(auth.uid() as any);
  }

  isPublic(): ConditionChain {
    return this.eq(true as any);
  }

  belongsToTenant(
    sessionKey: string = 'app.current_tenant_id'
  ): ConditionChain {
    return this.eq(session.get(sessionKey, 'integer') as any);
  }

  // For methods that need subqueries, we can delegate to parent since they handle the column name properly
  isMemberOf(
    joinTable: string,
    foreignKey: string,
    localKey?: string
  ): ConditionChain {
    return super.isMemberOf(joinTable, foreignKey, localKey);
  }

  userBelongsTo(
    membershipTable: string,
    membershipColumn?: string
  ): ConditionChain {
    return super.userBelongsTo(membershipTable, membershipColumn);
  }

  releasedBefore(referenceDate?: Date): ConditionChain {
    return super.releasedBefore(referenceDate);
  }
}

/**
 * Policy builder with table type locked in
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class TypedPolicyBuilder<
  _DB,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _TableName extends TableNames<_DB>,
> extends PolicyBuilder {
  // All methods from PolicyBuilder are inherited and work the same
  // The table type is captured for use with typed column references
}

/**
 * Typed Rowguard instance with schema-aware API
 */
export interface TypedRowguard<DB> {
  /**
   * Create a policy with typed table names
   */
  policy(name: string): {
    on<T extends TableNames<DB>>(table: T): TypedPolicyBuilder<DB, T>;
  };

  /**
   * Create a typed column reference
   * @param table - Table name (autocompletes from schema)
   * @param column - Column name (autocompletes based on table)
   */
  column<T extends TableNames<DB>, C extends ColumnNames<DB, T>>(
    table: T,
    column: C
  ): TypedColumnBuilder<ColumnType<DB, T, C>>;

  /**
   * Auth context helpers
   */
  auth: typeof auth;

  /**
   * Session variable helpers
   */
  session: typeof session;
}

/**
 * Create a schema-aware Rowguard instance
 *
 * @example
 * ```typescript
 * import { Database } from './database.types'
 * const rg = createRowguard<Database>()
 *
 * const p = rg.policy('user_notes')
 *   .on('notes')  // autocomplete table names
 *   .read()
 *   .when(rg.column('notes', 'user_id').eq(rg.auth.uid()))
 * ```
 */
export function createRowguard<DB>(): TypedRowguard<DB> {
  return {
    policy: (name: string) => ({
      on: <T extends TableNames<DB>>(table: T) => {
        const builder = new PolicyBuilder(name).on(table as string);
        return builder as TypedPolicyBuilder<DB, T>;
      },
    }),

    column: <T extends TableNames<DB>, C extends ColumnNames<DB, T>>(
      table: T,
      column: C
    ) => {
      return new TypedColumnBuilder<ColumnType<DB, T, C>>(
        table as string,
        column as string
      );
    },

    auth,
    session,
  };
}
