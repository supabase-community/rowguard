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
   * @param columns Column name(s) to select
   */
  select(columns: string | string[]): this {
    this._select = columns;
    return this;
  }

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
 * @param table Table name
 * @param alias Optional table alias
 */
export function from(table: string, alias?: string): SubqueryBuilder {
  return new SubqueryBuilder(table, alias);
}
