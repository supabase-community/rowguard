import { PolicyBuilder } from './policy-builder';
import { column, hasRole, ConditionChain, alwaysTrue } from './column';
import { from } from './subquery-builder';
import { auth, session } from './context';
import { escapeValue, escapeIdentifier } from './sql';
import type { ContextValue, PolicyOperation, HelperCondition } from './types';

type CrudOp = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
type RoleSource =
  | { jwt: string }
  | { table: string; userColumn?: string; roleColumn?: string };

export interface OwnedConfig {
  tables: string[];
  userColumn?: string;
  operations?: CrudOp[];
  role?: string;
}

export interface SharedConfig {
  tables: string[];
  userColumn?: string;
  publicColumn?: string;
  role?: string;
}

export interface MembershipConfig {
  tables: string[];
  via: string;
  key: string | string[];
  localColumn?: string | string[];
  userColumn?: string;
  operations?: CrudOp[];
  role?: string;
}

export interface TenantConfig {
  tables: string[];
  column?: string;
  source?: ContextValue;
  userColumn?: string;
  ownerPolicies?: boolean;
  role?: string;
}

export interface RoleConfig {
  tables: string[];
  is: string | string[];
  via?: RoleSource;
  operations?: PolicyOperation[];
}

export interface ImmutableConfig {
  tables: string[];
  userColumn?: string;
  allowRead?: boolean;
  role?: string;
}

export interface AdminConfig {
  tables: string[];
  is: string | string[];
  via?: RoleSource;
  operations?: PolicyOperation[];
}

export interface OpenConfig {
  tables: string[];
  role?: string;
}

function rawCond(expression: string): ConditionChain {
  return new ConditionChain({
    type: 'helper',
    helperType: 'raw',
    params: {},
    toSQL(): string { return expression; },
  } as HelperCondition);
}

function buildJwtRoleCond(jwtPath: string, roles: string[]): ConditionChain {
  const jwtExpr = auth.jwt(jwtPath).toSQL();
  if (roles.length === 1) return rawCond(`${jwtExpr} = ${escapeValue(roles[0])}`);
  const list = roles.map((r) => escapeValue(r)).join(', ');
  return rawCond(`${jwtExpr} IN (${list})`);
}

function buildTableRoleCond(roles: string[], rolesTable: string, userColumn: string, roleColumn: string): ConditionChain {
  if (roles.length === 1) return hasRole(roles[0], rolesTable);
  const list = roles.map((r) => escapeValue(r)).join(', ');
  return rawCond(
    `EXISTS (SELECT 1 FROM "${rolesTable}" WHERE "${userColumn}" = ${auth.uid().toSQL()} AND "${roleColumn}" IN (${list}))`
  );
}

function buildRoleCond(is: string | string[], via: RoleSource): ConditionChain {
  const roles = Array.isArray(is) ? is : [is];
  if ('jwt' in via) return buildJwtRoleCond(via.jwt, roles);
  return buildTableRoleCond(roles, via.table, via.userColumn ?? 'user_id', via.roleColumn ?? 'role');
}

const ownerCond = (userColumn: string): ConditionChain => column(userColumn).isOwner();

function buildOwnerPolicies(table: string, userColumn: string, ops: CrudOp[], role: string): PolicyBuilder[] {
  return ops.map((op) =>
    new PolicyBuilder(`${table}_${op.toLowerCase()}_owner`).on(table).for(op).to(role).allow(ownerCond(userColumn))
  );
}

// Shared core for role() and admin() — only the name infix and TO role differ.
function buildRolePolicies(
  tables: string[],
  is: string | string[],
  via: RoleSource,
  operations: PolicyOperation[],
  nameInfix: string,
  toRole?: string
): PolicyBuilder[] {
  const roleSlug = (Array.isArray(is) ? is : [is]).join('_');
  const cond = buildRoleCond(is, via); // built once, shared across all tables × ops
  return tables.flatMap((t) =>
    operations.map((op) => {
      const p = new PolicyBuilder(`${t}_${op.toLowerCase()}_${nameInfix}_${roleSlug}`).on(t).for(op);
      if (toRole) p.to(toRole);
      p.allow(cond);
      return p;
    })
  );
}

const ALL_CRUD: CrudOp[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

export function owned({ tables, userColumn = 'user_id', operations = ALL_CRUD, role = 'authenticated' }: OwnedConfig): PolicyBuilder[] {
  return tables.flatMap((t) => buildOwnerPolicies(t, userColumn, operations, role));
}

export function shared({ tables, userColumn = 'user_id', publicColumn = 'is_public', role = 'authenticated' }: SharedConfig): PolicyBuilder[] {
  return tables.flatMap((t) => {
    const selectCond = ownerCond(userColumn).or(column(publicColumn).eq(true));
    const selectPolicy = new PolicyBuilder(`${t}_select_owner_or_public`).on(t).for('SELECT').to(role).when(selectCond);
    return [selectPolicy, ...buildOwnerPolicies(t, userColumn, ['INSERT', 'UPDATE', 'DELETE'], role)];
  });
}

export function membership({ tables, via, key, localColumn = 'id', userColumn = 'user_id', operations = ALL_CRUD, role = 'authenticated' }: MembershipConfig): PolicyBuilder[] {
  const keys = Array.isArray(key) ? key : [key];
  const localCols = Array.isArray(localColumn) ? localColumn : [localColumn];

  return tables.flatMap((t) => {
    let cond: ConditionChain;
    if (keys.length === 1 && localCols.length === 1) {
      cond = column(localCols[0]).in(
        from(via).select(keys[0]).where(column(userColumn).eq(auth.uid()))
      );
    } else {
      const localStr = localCols.map(escapeIdentifier).join(', ');
      const keyStr = keys.map(escapeIdentifier).join(', ');
      cond = rawCond(
        `(${localStr}) IN (SELECT ${keyStr} FROM ${escapeIdentifier(via)} WHERE ${escapeIdentifier(userColumn)} = ${auth.uid().toSQL()})`
      );
    }
    return operations.map((op) =>
      new PolicyBuilder(`${t}_${op.toLowerCase()}_member`).on(t).for(op).to(role).allow(cond)
    );
  });
}

export function tenant({ tables, column: tenantColumn = 'tenant_id', source = session.get('app.current_tenant_id', 'integer'), userColumn = 'user_id', ownerPolicies = true, role = 'authenticated' }: TenantConfig): PolicyBuilder[] {
  return tables.flatMap((t) => {
    const isolationPolicy = new PolicyBuilder(`${t}_tenant_isolation`)
      .on(t).for('ALL').to(role).restrictive()
      .when(column(tenantColumn).eq(source));
    if (!ownerPolicies) return [isolationPolicy];
    return [isolationPolicy, ...buildOwnerPolicies(t, userColumn, ALL_CRUD, role)];
  });
}

export function role({ tables, is, via = { jwt: 'user_role' }, operations = ['ALL'] as PolicyOperation[] }: RoleConfig): PolicyBuilder[] {
  return buildRolePolicies(tables, is, via, operations, 'rbac', 'authenticated');
}

export function immutable({ tables, userColumn = 'user_id', allowRead = false, role = 'authenticated' }: ImmutableConfig): PolicyBuilder[] {
  return tables.flatMap((t) => {
    const cond = ownerCond(userColumn);
    const insertPolicy = new PolicyBuilder(`${t}_insert_append`).on(t).for('INSERT').to(role).withCheck(cond);
    if (!allowRead) return [insertPolicy];
    return [insertPolicy, new PolicyBuilder(`${t}_select_owner`).on(t).for('SELECT').to(role).when(cond)];
  });
}

export function admin({ tables, is, via = { jwt: 'user_role' }, operations = ['ALL'] as PolicyOperation[] }: AdminConfig): PolicyBuilder[] {
  return buildRolePolicies(tables, is, via, operations, 'admin');
}

export function open({ tables, role = 'public' }: OpenConfig): PolicyBuilder[] {
  return tables.map((t) =>
    new PolicyBuilder(`${t}_select_public`).on(t).for('SELECT').to(role).when(alwaysTrue())
  );
}

export const policies = {
  owned,
  shared,
  membership,
  tenant,
  role,
  immutable,
  admin,
  open,
};
