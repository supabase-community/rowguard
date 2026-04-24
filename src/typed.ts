import { ColumnBuilder, ConditionChain } from './column';
import { PolicyBuilder } from './policy-builder';
import { auth, session } from './context';
import type {
  SQLExpression,
  ComparisonCondition,
  PatternCondition,
  MembershipCondition,
  NullCondition,
  ContextValue,
  PolicyOperation,
} from './types';
import { SubqueryBuilder } from './subquery-builder';
import { escapeIdentifier, escapeValue, subqueryToSQL } from './sql';
import {
  owned,
  shared,
  membership,
  tenant,
  role,
  immutable,
  admin,
  open,
} from './templates';
import type {
  OwnedConfig,
  SharedConfig,
  MembershipConfig,
  TenantConfig,
  RoleConfig,
  ImmutableConfig,
  AdminConfig,
  OpenConfig,
} from './templates';

// ─── Schema type extraction ───────────────────────────────────────────────────

export type TableNames<DB> = 'public' extends keyof DB
  ? DB['public'] extends { Tables: infer T }
    ? keyof T & string
    : never
  : never;

export type ColumnNames<DB, TableName extends TableNames<DB>> =
  'public' extends keyof DB
    ? DB['public'] extends { Tables: infer T }
      ? TableName extends keyof T
        ? T[TableName] extends { Row: infer R }
          ? keyof R & string
          : never
        : never
      : never
    : never;

// Union of every column from every table in the schema.
// Used for config fields like userColumn, publicColumn where the column
// must exist in the schema but we can't statically know which table it comes from.
export type AnyColumn<DB> = ColumnNames<DB, TableNames<DB>>;

// ─── Typed config interfaces ──────────────────────────────────────────────────

type CrudOp = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

type TypedRoleSource<DB> =
  | { jwt: string }
  | { table: TableNames<DB>; userColumn?: AnyColumn<DB>; roleColumn?: AnyColumn<DB> };

export interface TypedOwnedConfig<DB> {
  tables: TableNames<DB>[];
  userColumn?: AnyColumn<DB>;
  operations?: CrudOp[];
  role?: string;
}

export interface TypedSharedConfig<DB> {
  tables: TableNames<DB>[];
  userColumn?: AnyColumn<DB>;
  publicColumn?: AnyColumn<DB>;
  role?: string;
}

// Via extends TableNames<DB> so that `key` narrows to only the columns
// of the specified membership table rather than every column in the schema.
export interface TypedMembershipConfig<DB, Via extends TableNames<DB> = TableNames<DB>> {
  tables: TableNames<DB>[];
  via: Via;
  key: ColumnNames<DB, Via>;
  localColumn?: AnyColumn<DB>;
  userColumn?: ColumnNames<DB, Via>;
  operations?: CrudOp[];
  role?: string;
}

export interface TypedTenantConfig<DB> {
  tables: TableNames<DB>[];
  column?: AnyColumn<DB>;
  source?: ContextValue;
  userColumn?: AnyColumn<DB>;
  ownerPolicies?: boolean;
  role?: string;
}

export interface TypedRoleConfig<DB> {
  tables: TableNames<DB>[];
  is: string | string[];
  via?: TypedRoleSource<DB>;
  operations?: PolicyOperation[];
}

export interface TypedImmutableConfig<DB> {
  tables: TableNames<DB>[];
  userColumn?: AnyColumn<DB>;
  allowRead?: boolean;
  role?: string;
}

export interface TypedAdminConfig<DB> {
  tables: TableNames<DB>[];
  is: string | string[];
  via?: TypedRoleSource<DB>;
  operations?: PolicyOperation[];
}

export interface TypedOpenConfig<DB> {
  tables: TableNames<DB>[];
  role?: string;
}

// ─── Typed policies interface ─────────────────────────────────────────────────

interface TypedPolicies<DB> {
  owned(config: TypedOwnedConfig<DB>): PolicyBuilder[];
  shared(config: TypedSharedConfig<DB>): PolicyBuilder[];
  // Via is inferred from the `via` field, constraining `key` to columns of that table
  membership<Via extends TableNames<DB>>(config: TypedMembershipConfig<DB, Via>): PolicyBuilder[];
  tenant(config: TypedTenantConfig<DB>): PolicyBuilder[];
  role(config: TypedRoleConfig<DB>): PolicyBuilder[];
  immutable(config: TypedImmutableConfig<DB>): PolicyBuilder[];
  admin(config: TypedAdminConfig<DB>): PolicyBuilder[];
  open(config: TypedOpenConfig<DB>): PolicyBuilder[];
}

// ─── Typed Rowguard interface ─────────────────────────────────────────────────

export interface TypedRowguard<DB> {
  policy(name?: string): { on<T extends TableNames<DB>>(table: T): PolicyBuilder };
  column<T extends TableNames<DB>, C extends ColumnNames<DB, T>>(table: T, col: C): ColumnBuilder;
  auth: typeof auth;
  session: typeof session;
  policies: TypedPolicies<DB>;
}

// ─── TypedColumnBuilder (local — generates qualified "table"."column" refs) ───

function escapeQualifiedIdentifier(table: string, col: string): string {
  return `${escapeIdentifier(table)}.${escapeIdentifier(col)}`;
}

function createQualifiedComparison(
  table: string,
  col: string,
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte',
  value: string | number | boolean | Date | null | ContextValue | SQLExpression
): ComparisonCondition {
  const operatorMap = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
  return {
    type: 'comparison',
    column: `${table}.${col}`,
    operator,
    value,
    toSQL(): string {
      return `${escapeQualifiedIdentifier(table, col)} ${operatorMap[operator]} ${escapeValue(value)}`;
    },
  };
}

class TypedColumnBuilder extends ColumnBuilder {
  private table: string;
  private col: string;

  constructor(table: string, column: string) {
    super(`${table}.${column}`);
    this.table = table;
    this.col = column;
  }

  eq(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'eq', value));
  }

  neq(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'neq', value));
  }

  gt(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'gt', value));
  }

  gte(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'gte', value));
  }

  lt(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'lt', value));
  }

  lte(value: string | number | boolean | Date | null | ContextValue | SQLExpression): ConditionChain {
    return new ConditionChain(createQualifiedComparison(this.table, this.col, 'lte', value));
  }

  like(pattern: string): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'pattern', column: `${table}.${col}`, operator: 'like', pattern,
      toSQL(): string { return `${escapeQualifiedIdentifier(table, col)} LIKE ${escapeValue(pattern)}`; },
    } as PatternCondition);
  }

  ilike(pattern: string): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'pattern', column: `${table}.${col}`, operator: 'ilike', pattern,
      toSQL(): string { return `${escapeQualifiedIdentifier(table, col)} ILIKE ${escapeValue(pattern)}`; },
    } as PatternCondition);
  }

  in(values: (string | number | boolean | Date | null)[] | SubqueryBuilder): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'membership', column: `${table}.${col}`, operator: 'in', value: values as any,
      toSQL(): string {
        if (Array.isArray(values)) {
          if (values.length === 0) return 'FALSE';
          return `${escapeQualifiedIdentifier(table, col)} IN (${values.map((v) => escapeValue(v as any)).join(', ')})`;
        }
        return `${escapeQualifiedIdentifier(table, col)} IN ${subqueryToSQL((values as SubqueryBuilder).toSubquery())}`;
      },
    } as MembershipCondition);
  }

  contains(value: string | number | boolean | Date | null | (string | number | boolean | Date | null)[]): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'membership', column: `${table}.${col}`, operator: 'contains', value: value as any,
      toSQL(): string { return `${escapeQualifiedIdentifier(table, col)} @> ${escapeValue(value as any)}`; },
    } as MembershipCondition);
  }

  isNull(): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'null', column: `${table}.${col}`, value: null,
      toSQL(): string { return `${escapeQualifiedIdentifier(table, col)} IS NULL`; },
    } as NullCondition);
  }

  isNotNull(): ConditionChain {
    const { table, col } = this;
    return new ConditionChain({
      type: 'null', column: `${table}.${col}`, value: 'not null',
      toSQL(): string { return `${escapeQualifiedIdentifier(table, col)} IS NOT NULL`; },
    } as NullCondition);
  }

  isOwner(): ConditionChain { return this.eq(auth.uid()); }
  isPublic(): ConditionChain { return this.eq(true); }
  belongsToTenant(key = 'app.current_tenant_id'): ConditionChain { return this.eq(session.get(key, 'integer')); }
  isMemberOf(joinTable: string, foreignKey: string, localKey?: string, userIdColumn?: string): ConditionChain {
    return super.isMemberOf(joinTable, foreignKey, localKey, userIdColumn);
  }
  userBelongsTo(membershipTable: string, membershipColumn?: string): ConditionChain {
    return super.userBelongsTo(membershipTable, membershipColumn);
  }
  releasedBefore(referenceDate?: Date): ConditionChain { return super.releasedBefore(referenceDate); }
}

// ─── createRowguard ───────────────────────────────────────────────────────────

export function createRowguard<DB>(): TypedRowguard<DB> {
  return {
    policy: (name?: string) => ({
      on: <T extends TableNames<DB>>(table: T) => new PolicyBuilder(name).on(table as string),
    }),
    column: <T extends TableNames<DB>, C extends ColumnNames<DB, T>>(table: T, col: C) =>
      new TypedColumnBuilder(table as string, col as string),
    auth,
    session,
    policies: {
      owned:      (config) => owned(config as OwnedConfig),
      shared:     (config) => shared(config as SharedConfig),
      membership: <Via extends TableNames<DB>>(config: TypedMembershipConfig<DB, Via>) =>
                    membership(config as unknown as MembershipConfig),
      tenant:     (config) => tenant(config as TenantConfig),
      role:       (config) => role(config as RoleConfig),
      immutable:  (config) => immutable(config as ImmutableConfig),
      admin:      (config) => admin(config as AdminConfig),
      open:       (config) => open(config as OpenConfig),
    },
  };
}
