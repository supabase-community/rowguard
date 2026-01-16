/**
 * Context helpers for accessing user/auth information
 */

import { ContextValue, SessionVariableType } from "./types";

/**
 * Auth context helper for accessing authentication information
 *
 * @example
 * ```typescript
 * // Users can only see their own documents
 * createPolicy('user_docs')
 *   .on('documents')
 *   .read()
 *   .when(column('user_id').eq(auth.uid()));
 *
 * // Or use the helper method
 * createPolicy('user_docs')
 *   .on('documents')
 *   .read()
 *   .when(column('user_id').isOwner());
 * ```
 */
export const auth = {
  /**
   * Returns current authenticated user ID
   *
   * Maps to `auth.uid()` in PostgreSQL (commonly used with Supabase).
   * This returns the user ID from the JWT token.
   *
   * @returns A ContextValue representing the current user's ID
   *
   * @example
   * ```typescript
   * // Basic user ownership
   * column('user_id').eq(auth.uid())
   *
   * // In a policy
   * createPolicy('user_documents')
   *   .on('documents')
   *   .read()
   *   .when(column('user_id').eq(auth.uid()));
   *
   * // With complex conditions
   * createPolicy('project_access')
   *   .on('projects')
   *   .read()
   *   .when(
   *     column('created_by').eq(auth.uid())
   *       .or(column('is_public').eq(true))
   *   );
   * ```
   */
  uid(): ContextValue {
    return {
      type: "context",
      contextType: "auth_uid",
      toSQL(): string {
        return "auth.uid()";
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
 * createPolicy('tenant_docs')
 *   .on('documents')
 *   .all()
 *   .requireAll()
 *   .when(
 *     column('tenant_id').eq(session.get('app.current_tenant_id', 'integer'))
 *   );
 *
 * // Organization-based access
 * createPolicy('org_projects')
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
    return {
      type: "context",
      contextType: "session",
      key,
      sessionType: type,
      toSQL(): string {
        const typeCast =
          type === "integer"
            ? "::INTEGER"
            : type === "uuid"
            ? "::UUID"
            : type === "boolean"
            ? "::BOOLEAN"
            : type === "timestamp"
            ? "::TIMESTAMP"
            : "";
        return `current_setting('${key}', true)${typeCast}`;
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
 * createPolicy('admin_access')
 *   .on('sensitive_data')
 *   .read()
 *   .when(column('allowed_role').eq(currentUser()));
 *
 * // Check if current database user matches
 * createPolicy('role_check')
 *   .on('audit_log')
 *   .read()
 *   .when(call('is_role_member', [currentUser(), 'auditor']));
 * ```
 */
export const currentUser = (): ContextValue => {
  return {
    type: "context",
    contextType: "current_user",
    toSQL(): string {
      return "current_user";
    },
  };
};
