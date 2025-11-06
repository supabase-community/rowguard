/**
 * Validation utilities for detecting table references and missing joins
 */

import { Condition, ComparisonCondition, LogicalCondition, PatternCondition, NullCondition, MembershipCondition, HelperCondition, FunctionCondition } from "./types";

/**
 * Extract table name from a column reference
 * Examples:
 * - 'user_id' -> null (no table prefix)
 * - 'm.user_id' -> 'm'
 * - 'users.id' -> 'users'
 * - '"table name".column' -> 'table name'
 */
export function extractTableFromColumn(columnRef: string): string | null {
  // Handle quoted identifiers
  if (columnRef.startsWith('"')) {
    const endQuote = columnRef.indexOf('"', 1);
    if (endQuote > 0 && columnRef[endQuote + 1] === '.') {
      return columnRef.substring(1, endQuote);
    }
  }

  // Handle unquoted identifiers
  const dotIndex = columnRef.indexOf('.');
  if (dotIndex > 0) {
    return columnRef.substring(0, dotIndex);
  }

  return null;
}

/**
 * Extract all table references from a condition tree
 * Returns a Set of table names (aliases or table names) referenced in the condition
 */
export function extractTableReferences(condition: Condition): Set<string> {
  const tables = new Set<string>();

  function traverse(cond: Condition): void {
    switch (cond.type) {
      case "comparison": {
        const comp = cond as ComparisonCondition;
        // Check the column
        const table = extractTableFromColumn(comp.column);
        if (table) {
          tables.add(table);
        }
        // Check the value if it's a condition
        if (comp.value && typeof comp.value === "object" && "toSQL" in comp.value) {
          traverse(comp.value as Condition);
        }
        break;
      }
      case "pattern": {
        const pattern = cond as PatternCondition;
        const table = extractTableFromColumn(pattern.column);
        if (table) {
          tables.add(table);
        }
        break;
      }
      case "null": {
        const nullCond = cond as NullCondition;
        const table = extractTableFromColumn(nullCond.column);
        if (table) {
          tables.add(table);
        }
        break;
      }
      case "logical": {
        const logical = cond as LogicalCondition;
        logical.conditions.forEach(traverse);
        break;
      }
      case "membership": {
        // Membership conditions have column references
        const membership = cond as MembershipCondition;
        if (membership.column) {
          const table = extractTableFromColumn(membership.column);
          if (table) {
            tables.add(table);
          }
        }
        break;
      }
      case "helper": {
        // Helper conditions might have table references in params
        const helper = cond as HelperCondition;
        if (helper.params) {
          // Check if params contain column references
          Object.values(helper.params).forEach((value) => {
            if (typeof value === "string") {
              const table = extractTableFromColumn(value);
              if (table) {
                tables.add(table);
              }
            }
          });
        }
        break;
      }
      case "function": {
        // Function conditions might have column references in arguments
        const func = cond as FunctionCondition;
        if (func.arguments) {
          func.arguments.forEach((arg) => {
            if (typeof arg === "string") {
              const table = extractTableFromColumn(arg);
              if (table) {
                tables.add(table);
              }
            } else if (arg && typeof arg === "object" && "toSQL" in arg) {
              traverse(arg as Condition);
            }
          });
        }
        break;
      }
    }
  }

  traverse(condition);
  return tables;
}

/**
 * Get all available tables from a subquery (from table + joined tables)
 */
export function getAvailableTables(
  fromTable: string,
  fromAlias: string | undefined,
  joins: Array<{ table: string; alias?: string }>
): Set<string> {
  const tables = new Set<string>();

  // Add the main table (use alias if available, otherwise table name)
  tables.add(fromAlias || fromTable);

  // Add joined tables
  joins.forEach((join) => {
    tables.add(join.alias || join.table);
  });

  return tables;
}

/**
 * Validate that all table references in a condition are available
 * @param condition The condition to validate
 * @param availableTables Set of available table names/aliases
 * @returns Array of missing table references (empty if all are available)
 */
export function detectMissingJoins(
  condition: Condition | undefined,
  availableTables: Set<string>
): string[] {
  if (!condition) {
    return [];
  }

  const referencedTables = extractTableReferences(condition);
  const missing: string[] = [];

  referencedTables.forEach((table) => {
    if (!availableTables.has(table)) {
      missing.push(table);
    }
  });

  return missing;
}
