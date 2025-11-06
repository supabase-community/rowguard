/**
 * SQL escaping and formatting utilities
 */

import { Condition, SubqueryDefinition, ComparisonCondition, ComparisonOperator } from "./types";

export class SQLExpression {
  constructor(private expression: string) {}

  toSQL(): string {
    return this.expression;
  }

  toString(): string {
    return this.expression;
  }
}

export function sql(expression: string): SQLExpression {
  return new SQLExpression(expression);
}

/**
 * Escape SQL identifier
 * If identifier contains special characters or spaces, wrap in double quotes
 */
export function escapeIdentifier(identifier: string): string {
  if (/[^a-zA-Z0-9_]/.test(identifier)) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
  return identifier;
}

/**
 * Escape SQL value
 * Handles null, boolean, number, Date, string, arrays, SQLExpression, and Condition objects
 */
export function escapeValue(
  value: string | number | boolean | Date | null | Condition | SQLExpression | unknown[]
): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'::TIMESTAMP`;
  }
  if (value instanceof SQLExpression) {
    return value.toSQL();
  }
  if (Array.isArray(value)) {
    const escapedItems = value.map((item) =>
      escapeValue(item as string | number | boolean | Date | null | Condition | SQLExpression)
    );
    return `ARRAY[${escapedItems.join(", ")}]`;
  }
  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value && typeof value === "object" && "toSQL" in value) {
    return (value as Condition).toSQL();
  }
  return `'${String(value)}'`;
}

/**
 * Helper to create comparison conditions
 */
export function createComparison(
  column: string,
  operator: ComparisonOperator,
  value: string | number | boolean | Date | null | Condition
): ComparisonCondition {
  const operatorMap: Record<ComparisonOperator, string> = {
    eq: "=",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  };

  return {
    type: "comparison",
    column,
    operator,
    value,
    toSQL(): string {
      return `${escapeIdentifier(column)} ${
        operatorMap[operator]
      } ${escapeValue(value)}`;
    },
  };
}

/**
 * Convert subquery definition to SQL
 */
export function subqueryToSQL(subquery: SubqueryDefinition): string {
  const from = escapeIdentifier(subquery.from);
  const alias = subquery.alias ? ` ${escapeIdentifier(subquery.alias)}` : "";
  const select = Array.isArray(subquery.select)
    ? subquery.select.map(escapeIdentifier).join(", ")
    : escapeIdentifier(subquery.select);

  let sql = `SELECT ${select} FROM ${from}${alias}`;

  if (subquery.join) {
    const joinType = (subquery.join.type || "inner").toUpperCase();
    const joinTable = escapeIdentifier(subquery.join.table);
    const joinAlias = subquery.join.alias
      ? ` ${escapeIdentifier(subquery.join.alias)}`
      : "";
    sql += ` ${joinType} JOIN ${joinTable}${joinAlias} ON ${subquery.join.on.toSQL()}`;
  }

  if (subquery.where) {
    sql += ` WHERE ${subquery.where.toSQL()}`;
  }

  return `(${sql})`;
}
