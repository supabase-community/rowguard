/**
 * Context helpers for accessing user/auth information
 */

import { ContextValue, SessionVariableType } from './types';

export const auth = {
  uid(): ContextValue {
    return {
      type: 'context',
      contextType: 'auth_uid',
      toSQL(): string {
        return '(SELECT auth.uid())';
      },
    };
  },

  jwt(path?: string): ContextValue {
    if (path && path.startsWith('user_metadata')) {
      throw new Error(
        `JWT path 'user_metadata.*' is unsafe for authorization. user_metadata is user-editable. Use 'app_metadata' instead.`
      );
    }
    return {
      type: 'context',
      contextType: 'auth_jwt',
      jwtPath: path,
      toSQL(): string {
        if (!path) {
          return '(SELECT auth.jwt())';
        }
        const parts = path.split('.');
        if (parts.length === 1) {
          return `(SELECT auth.jwt() ->> '${parts[0]}')`;
        }
        const lastPart = parts[parts.length - 1];
        const middleParts = parts.slice(0, -1);
        const arrows = middleParts.map((p) => `-> '${p}'`).join(' ');
        return `(SELECT auth.jwt() ${arrows} ->> '${lastPart}')`;
      },
    };
  },

  role(): ContextValue {
    return {
      type: 'context',
      contextType: 'auth_role',
      toSQL(): string {
        return '(SELECT auth.role())';
      },
    };
  },
};

/**
 * Session variable helper with type safety
 *
 * Access PostgreSQL session variables set via `SET` command or application context.
 *
 * @example
 * ```typescript
 * // Tenant isolation
 * policy('tenant_docs')
 *   .on('documents')
 *   .all()
 *   .requireAll()
 *   .when(
 *     column('tenant_id').eq(session.get('app.current_tenant_id', 'integer'))
 *   );
 *
 * // Organization-based access
 * policy('org_projects')
 *   .on('projects')
 *   .read()
 *   .when(
 *     column('org_id').eq(session.get('app.org_id', 'uuid'))
 *   );
 * ```
 */
export const session = {
  /**
   * Get a session variable with type casting
   *
   * Maps to `current_setting(key)::TYPE` in PostgreSQL.
   *
   * @param key Session variable key (e.g., 'app.current_tenant_id')
   * @param type Type to cast to ('integer', 'uuid', 'boolean', 'timestamp', or 'text')
   * @returns A ContextValue representing the session variable
   *
   * @example
   * ```typescript
   * // Integer session variable
   * column('tenant_id').eq(session.get('app.tenant_id', 'integer'))
   *
   * // UUID session variable
   * column('org_id').eq(session.get('app.org_id', 'uuid'))
   *
   * // Boolean session variable
   * column('is_admin').eq(session.get('app.is_admin', 'boolean'))
   *
   * // Text session variable (default)
   * column('role').eq(session.get('app.role', 'text'))
   * ```
   */
  get(key: string, type: SessionVariableType): ContextValue {
    const safeKey = key.replace(/'/g, "''");
    return {
      type: 'context',
      contextType: 'session',
      key,
      sessionType: type,
      toSQL(): string {
        const typeCast =
          type === 'integer'
            ? '::INTEGER'
            : type === 'uuid'
              ? '::UUID'
              : type === 'boolean'
                ? '::BOOLEAN'
                : type === 'timestamp'
                  ? '::TIMESTAMP'
                  : '';
        return `current_setting('${safeKey}', true)${typeCast}`;
      },
    };
  },
};

/**
 * Current user context helper
 *
 * Returns the current database user/role. Maps to `current_user` in PostgreSQL.
 * This is different from `auth.uid()` - it returns the PostgreSQL role name,
 * not the application user ID.
 *
 * @returns A ContextValue representing the current database user
 *
 * @example
 * ```typescript
 * // Role-based access (database roles)
 * policy('admin_access')
 *   .on('sensitive_data')
 *   .read()
 *   .when(column('allowed_role').eq(currentUser()));
 *
 * // Check if current database user matches
 * policy('role_check')
 *   .on('audit_log')
 *   .read()
 *   .when(call('is_role_member', [currentUser(), 'auditor']));
 * ```
 */
export const currentUser = (): ContextValue => {
  return {
    type: 'context',
    contextType: 'current_user',
    toSQL(): string {
      return 'current_user';
    },
  };
};
