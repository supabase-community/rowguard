/**
 * Context helpers for accessing user/auth information
 */

import { ContextValue, SessionVariableType } from "./types";

/**
 * Auth context helper
 */
export const auth = {
  /**
   * Returns current authenticated user ID
   * Maps to auth.uid() in PostgreSQL
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
 */
export const session = {
  /**
   * Get a session variable with type casting
   * @param key Session variable key (e.g., 'app.current_tenant_id')
   * @param type Type to cast to
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
