/**
 * Policy composition utilities
 */

import { PolicyBuilder } from "./policy-builder";
import { SQLGenerationOptions } from "./types";

/**
 * Create a policy group for organization
 */
export interface PolicyGroup {
  name: string;
  policies: PolicyBuilder[];
  description?: string;
}

/**
 * Create a policy group
 */
export function createPolicyGroup(
  name: string,
  policies: PolicyBuilder[],
  description?: string
): PolicyGroup {
  return { name, policies, description };
}

/**
 * Generate SQL for a policy group
 * @param group Policy group to generate SQL for
 * @param options Options for SQL generation (e.g., includeIndexes)
 */
export function policyGroupToSQL(
  group: PolicyGroup,
  options?: SQLGenerationOptions
): string {
  const policySQLs = group.policies.map((p) => p.toSQL(options));
  if (group.description) {
    return `-- ${group.description}\n${policySQLs.join(";\n\n")};`;
  }
  return policySQLs.join(";\n\n") + ";";
}
