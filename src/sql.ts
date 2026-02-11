import {
  Condition,
  SubqueryDefinition,
  ComparisonCondition,
  ComparisonOperator,
  SQLExpression,
} from './types';

const POSTGRES_MAX_IDENTIFIER_LENGTH = 63;

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 6);
}

export function sanitizePolicyName(name: string): string {
  if (!name || name.trim().length === 0) {
    throw new Error('Policy name cannot be empty');
  }

  let sanitized = name.toLowerCase();
  sanitized = sanitized.replace(/[^a-z0-9_]/g, '_');
  sanitized = sanitized.replace(/_+/g, '_');
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  if (sanitized.length === 0) {
    throw new Error(
      `Policy name "${name}" results in an empty identifier after sanitization`
    );
  }

  if (sanitized.length > POSTGRES_MAX_IDENTIFIER_LENGTH) {
    const hash = simpleHash(name);
    const hashSuffix = `_${hash}`;
    const maxBaseLength = POSTGRES_MAX_IDENTIFIER_LENGTH - hashSuffix.length;
    sanitized = sanitized.substring(0, maxBaseLength) + hashSuffix;
  }

  return sanitized;
}

// Re-export SQLExpression from types
export { SQLExpression } from './types';

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
  value:
    | string
    | number
    | boolean
    | Date
    | null
    | Condition
    | SQLExpression
    | unknown[]
): string {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
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
      escapeValue(
        item as
          | string
          | number
          | boolean
          | Date
          | null
          | Condition
          | SQLExpression
      )
    );
    return `ARRAY[${escapedItems.join(', ')}]`;
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value && typeof value === 'object' && 'toSQL' in value) {
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
  value: string | number | boolean | Date | null | Condition | SQLExpression
): ComparisonCondition {
  const operatorMap: Record<ComparisonOperator, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };

  return {
    type: 'comparison',
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
  const alias = subquery.alias ? ` ${escapeIdentifier(subquery.alias)}` : '';
  const select = Array.isArray(subquery.select)
    ? subquery.select.map(escapeIdentifier).join(', ')
    : escapeIdentifier(subquery.select);

  let sql = `SELECT ${select} FROM ${from}${alias}`;

  if (subquery.join) {
    const joinType = (subquery.join.type || 'inner').toUpperCase();
    const joinTable = escapeIdentifier(subquery.join.table);
    const joinAlias = subquery.join.alias
      ? ` ${escapeIdentifier(subquery.join.alias)}`
      : '';
    sql += ` ${joinType} JOIN ${joinTable}${joinAlias} ON ${subquery.join.on.toSQL()}`;
  }

  if (subquery.where) {
    sql += ` WHERE ${subquery.where.toSQL()}`;
  }

  return `(${sql})`;
}
