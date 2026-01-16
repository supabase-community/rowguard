/**
 * Fluent subquery builder API for declarative subquery construction
 */

import { Condition, SubqueryDefinition, JoinDefinition } from "./types";
import { ConditionChain } from "./column";
import { detectMissingJoins, getAvailableTables } from "./validation";

function validateTableReferences(
  condition: Condition,
  from: string,
  fromAlias: string | undefined,
  joins: Array<{ table: string; alias?: string }>,
  allowedMissing?: string
): void {
  const availableTables = getAvailableTables(from, fromAlias, joins);
  const missing = detectMissingJoins(condition, availableTables);

  if (missing.length > 0) {
    const filteredMissing = allowedMissing
      ? missing.filter((t) => t !== allowedMissing)
      : missing;

    if (filteredMissing.length > 0) {
      if (allowedMissing) {
        throw new Error(
          `Join condition references unavailable table(s): ${filteredMissing.join(", ")}`
        );
      } else {
        throw new Error(
          `Missing join(s) for table(s): ${filteredMissing.join(", ")}. ` +
            `Add a join using .join('${filteredMissing[0]}', ...) before calling .where()`
        );
      }
    }
  }
}

export class SubqueryBuilder {
  private _from: string;
  private _fromAlias?: string;
  private _select: string | string[] = "*";
  private _where?: Condition;
  private _joins: Array<{
    table: string;
    alias?: string;
    on: Condition;
    type?: "inner" | "left" | "right" | "full";
  }> = [];

  constructor(from: string, alias?: string) {
    this._from = from;
    this._fromAlias = alias;
  }

  /**
   * Specify the columns to select
   *
   * @param columns Column name(s) to select
   *
   * @example
   * ```typescript
   * // Select single column
   * from('project_members').select('project_id')
   *
   * // Select multiple columns
   * from('users').select(['id', 'email', 'name'])
   * ```
   */
  select(columns: string | string[]): this {
    this._select = columns;
    return this;
  }

  /**
   * Add a WHERE clause to filter subquery results
   *
   * @param condition The condition to filter by
   *
   * @example
   * ```typescript
   * // Filter by user
   * from('project_members')
   *   .select('project_id')
   *   .where(column('user_id').eq(auth.uid()))
   *
   * // Complex condition
   * from('projects')
   *   .select('id')
   *   .where(
   *     column('status').eq('active')
   *       .and(column('is_public').eq(true))
   *   )
   * ```
   */
  where(condition: Condition | ConditionChain): this {
    const normalizedCondition =
      condition instanceof ConditionChain
        ? condition.toCondition()
        : condition;

    validateTableReferences(
      normalizedCondition,
      this._from,
      this._fromAlias,
      this._joins
    );

    this._where = normalizedCondition;
    return this;
  }

  /**
   * Add a JOIN clause to the subquery
   *
   * @param table The table to join
   * @param on The join condition
   * @param type The join type (default: 'inner')
   * @param alias Optional alias for the joined table
   *
   * @example
   * ```typescript
   * // Simple join
   * from('projects', 'p')
   *   .select('p.id')
   *   .join(
   *     'project_members',
   *     column('p.id').eq('pm.project_id'),
   *     'inner',
   *     'pm'
   *   )
   *   .where(column('pm.user_id').eq(auth.uid()))
   *
   * // LEFT JOIN
   * from('organizations', 'org')
   *   .select('org.id')
   *   .join(
   *     'organization_members',
   *     column('org.id').eq('om.organization_id'),
   *     'left',
   *     'om'
   *   )
   * ```
   */
  join(
    table: string,
    on: Condition | ConditionChain,
    type?: "inner" | "left" | "right" | "full",
    alias?: string
  ): this {
    const normalizedOn =
      on instanceof ConditionChain ? on.toCondition() : on;

    validateTableReferences(
      normalizedOn,
      this._from,
      this._fromAlias,
      this._joins,
      alias || table
    );

    this._joins.push({
      table,
      alias,
      on: normalizedOn,
      type: type || "inner",
    });

    return this;
  }

  /**
   * Convert to SubqueryDefinition (internal use only)
   */
  toSubquery(): SubqueryDefinition {
    const result: SubqueryDefinition = {
      from: this._from,
      select: this._select,
    };

    if (this._fromAlias) {
      result.alias = this._fromAlias;
    }

    if (this._where) {
      result.where = this._where;
    }

    if (this._joins.length > 0) {
      // For now, only support single join (can be extended later)
      const join = this._joins[0];
      result.join = {
        table: join.table,
        alias: join.alias,
        on: join.on,
        type: join.type,
      } as JoinDefinition;
    }

    return result;
  }
}

/**
 * Create a new subquery builder starting with a FROM clause
 *
 * Used within `.in()` clauses to create subqueries for membership checks.
 *
 * @param table Table name
 * @param alias Optional table alias
 * @returns A SubqueryBuilder instance for building subqueries
 *
 * @example
 * ```typescript
 * // Simple subquery - users can see projects they're members of
 * createPolicy('member_projects')
 *   .on('projects')
 *   .read()
 *   .when(
 *     column('id').in(
 *       from('project_members')
 *         .select('project_id')
 *         .where(column('user_id').eq(auth.uid()))
 *     )
 *   );
 *
 * // Subquery with alias
 * createPolicy('org_projects')
 *   .on('projects')
 *   .read()
 *   .when(
 *     column('org_id').in(
 *       from('organizations', 'org')
 *         .select('org.id')
 *         .where(column('org.is_active').eq(true))
 *     )
 *   );
 *
 * // Subquery with join
 * createPolicy('accessible_docs')
 *   .on('documents')
 *   .read()
 *   .when(
 *     column('project_id').in(
 *       from('projects', 'p')
 *         .select('p.id')
 *         .join(
 *           'project_members',
 *           column('p.id').eq('pm.project_id'),
 *           'inner',
 *           'pm'
 *         )
 *         .where(column('pm.user_id').eq(auth.uid()))
 *     )
 *   );
 * ```
 */
export function from(table: string, alias?: string): SubqueryBuilder {
  return new SubqueryBuilder(table, alias);
}
