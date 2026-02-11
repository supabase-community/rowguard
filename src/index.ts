/**
 * Main entry point for Rowguard - RLS Policy DSL
 */

export * from './types';
export * from './policy-builder';
export * from './context';
export * from './composition';
export * from './column';
export * from './subquery-builder';

export { policy, PolicyBuilder, policies } from './policy-builder';
export { auth, session, currentUser } from './context';
export { createPolicyGroup, policyGroupToSQL } from './composition';
export {
  column,
  ColumnBuilder,
  ConditionChain,
  hasRole,
  alwaysTrue,
  call,
} from './column';
export { from, SubqueryBuilder } from './subquery-builder';
export { sql, SQLExpression } from './sql';
