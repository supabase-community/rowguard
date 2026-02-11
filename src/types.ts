/**
 * Core types and interfaces for Rowguard - RLS Policy DSL
 */

export type PolicyOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

export type PolicyType = 'PERMISSIVE' | 'RESTRICTIVE';

export type ConditionOperator = 'AND' | 'OR';

export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export type PatternMatchOperator = 'like' | 'ilike';

export type NullCheckValue = null | 'null' | 'not null';

export type SessionVariableType =
  | 'integer'
  | 'text'
  | 'uuid'
  | 'boolean'
  | 'timestamp';

/**
 * Base condition interface that all conditions implement
 */
export interface Condition {
  type: string;
  toSQL(): string;
}

/**
 * Raw SQL expression wrapper for embedding arbitrary SQL in conditions
 */
export class SQLExpression {
  constructor(private expression: string) {}

  toSQL(): string {
    return this.expression;
  }

  toString(): string {
    return this.expression;
  }
}

/**
 * Comparison condition (eq, neq, gt, etc.)
 */
export interface ComparisonCondition extends Condition {
  type: 'comparison';
  column: string;
  operator: ComparisonOperator;
  value: string | number | boolean | Date | null | Condition | SQLExpression;
}

/**
 * Pattern matching condition (like, ilike)
 */
export interface PatternCondition extends Condition {
  type: 'pattern';
  column: string;
  operator: PatternMatchOperator;
  pattern: string;
}

/**
 * Membership condition (in, contains)
 */
export interface MembershipCondition extends Condition {
  type: 'membership';
  column: string;
  operator: 'in' | 'contains';
  value:
    | (string | number | boolean | Date | null)[]
    | SubqueryDefinition
    | string
    | number
    | boolean
    | Date
    | null;
}

/**
 * Null check condition
 */
export interface NullCondition extends Condition {
  type: 'null';
  column: string;
  value: NullCheckValue;
}

/**
 * Logical operator condition (AND/OR)
 */
export interface LogicalCondition extends Condition {
  type: 'logical';
  operator: ConditionOperator;
  conditions: Condition[];
}

/**
 * Subquery condition
 */
export interface SubqueryCondition extends Condition {
  type: 'subquery';
  column: string;
  operator: 'in' | 'not in' | 'exists' | 'not exists';
  subquery: SubqueryDefinition;
}

/**
 * Function call condition
 */
export interface FunctionCondition extends Condition {
  type: 'function';
  functionName: string;
  arguments: (string | Condition)[];
}

/**
 * Helper condition (isOwner, isMemberOf, etc.)
 */
export interface HelperCondition extends Condition {
  type: 'helper';
  helperType: string;
  params: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Subquery definition
 */
export interface SubqueryDefinition {
  from: string;
  alias?: string;
  select: string | string[];
  where?: Condition;
  join?: JoinDefinition;
}

/**
 * Join definition
 */
export interface JoinDefinition {
  table: string;
  alias?: string;
  on: Condition;
  type?: 'inner' | 'left' | 'right' | 'full';
}

/**
 * Hierarchy traversal definition
 */
export interface HierarchyDefinition {
  table: string;
  parentColumn: string;
  childColumn: string;
  userPath?: SubqueryDefinition;
}

/**
 * Policy definition structure
 */
export interface PolicyDefinition {
  name: string;
  table: string;
  operation: PolicyOperation;
  role?: string;
  type?: PolicyType;
  using?: Condition;
  withCheck?: Condition;
  description?: string;
}

/**
 * Policy builder state
 */
export interface PolicyBuilderState {
  name?: string;
  table?: string;
  operation?: PolicyOperation;
  role?: string;
  type?: PolicyType;
  using?: Condition;
  withCheck?: Condition;
  description?: string;
}

/**
 * Context value that can be used in conditions
 */
export interface ContextValue extends Condition {
  type: 'context';
  contextType: 'auth_uid' | 'session' | 'current_user';
  key?: string;
  sessionType?: SessionVariableType;
}

/**
 * Options for SQL generation
 */
export interface SQLGenerationOptions {
  /**
   * Generate CREATE INDEX statements for columns used in policy conditions
   * @default false
   */
  includeIndexes?: boolean;
}
