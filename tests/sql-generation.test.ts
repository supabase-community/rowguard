import { describe, test, expect } from "vitest";
import {
  createPolicy,
  policies,
  session,
  currentUser,
  auth,
  createPolicyGroup,
  policyGroupToSQL,
  column,
  hasRole,
  alwaysTrue,
  call,
  from,
  sql,
  SQLExpression,
} from "../src/index";

function normalizeSQL(sql: string): string {
  return sql.replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
}

describe("RLS DSL SQL Generation Tests", () => {
  test("Basic user ownership policy", () => {
    const expected =
      "CREATE POLICY user_docs ON documents FOR SELECT USING (user_id = auth.uid())";

    const policy = createPolicy("user_docs")
      .on("documents")
      .for("SELECT")
      .when(column("user_id").isOwner());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Policy with allow (SELECT)", () => {
    const expected =
      "CREATE POLICY read_policy ON posts FOR SELECT USING (user_id = auth.uid())";

    const policy = createPolicy("read_policy")
      .on("posts")
      .for("SELECT")
      .allow(column("user_id").isOwner());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Policy with allow (INSERT)", () => {
    const expected =
      "CREATE POLICY write_policy ON posts FOR INSERT WITH CHECK (user_id = auth.uid())";

    const policy = createPolicy("write_policy")
      .on("posts")
      .for("INSERT")
      .allow(column("user_id").isOwner());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Policy with allow (UPDATE - sets both USING and WITH CHECK)", () => {
    const expected =
      "CREATE POLICY rw_policy ON posts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())";

    const policy = createPolicy("rw_policy")
      .on("posts")
      .for("UPDATE")
      .allow(column("user_id").isOwner());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Restrictive policy type", () => {
    const expected =
      "CREATE POLICY restrictive_policy ON data AS RESTRICTIVE FOR ALL USING (tenant_id = 1)";

    const policy = createPolicy("restrictive_policy")
      .on("data")
      .for("ALL")
      .restrictive()
      .when(column("tenant_id").eq(1));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Policy with role", () => {
    const expected =
      "CREATE POLICY role_policy ON admin_data FOR SELECT TO admin USING (true)";

    const policy = createPolicy("role_policy")
      .on("admin_data")
      .for("SELECT")
      .to("admin")
      .when(alwaysTrue());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Equality condition", () => {
    const expected =
      "CREATE POLICY eq_test ON items FOR SELECT USING (status = 'active')";

    const policy = createPolicy("eq_test")
      .on("items")
      .for("SELECT")
      .when(column("status").eq("active"));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Not equal condition", () => {
    const expected =
      "CREATE POLICY neq_test ON items FOR SELECT USING (status != 'deleted')";

    const policy = createPolicy("neq_test")
      .on("items")
      .for("SELECT")
      .when(column("status").neq("deleted"));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Greater than condition", () => {
    const expected =
      "CREATE POLICY gt_test ON items FOR SELECT USING (age > 18)";

    const policy = createPolicy("gt_test")
      .on("items")
      .for("SELECT")
      .when(column("age").gt(18));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("OR condition", () => {
    const expected =
      "CREATE POLICY or_test ON posts FOR SELECT USING ((user_id = auth.uid() OR is_public = TRUE))";

    const policy = createPolicy("or_test")
      .on("posts")
      .for("SELECT")
      .when(column("user_id").isOwner().or(column("is_public").isPublic()));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("AND condition", () => {
    const expected =
      "CREATE POLICY and_test ON posts FOR SELECT USING ((user_id = auth.uid() AND status = 'draft'))";

    const policy = createPolicy("and_test")
      .on("posts")
      .for("SELECT")
      .when(column("user_id").isOwner().and(column("status").eq("draft")));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Complex nested conditions", () => {
    const expected =
      "CREATE POLICY complex_test ON projects FOR SELECT USING ((is_public = TRUE OR (user_id = auth.uid() AND status = 'active')))";

    const policy = createPolicy("complex_test")
      .on("projects")
      .for("SELECT")
      .when(
        column("is_public")
          .isPublic()
          .or(column("user_id").isOwner().and(column("status").eq("active")))
      );

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("isOwner helper with custom column", () => {
    const expected =
      "CREATE POLICY owner_test ON items FOR SELECT USING (owner_id = auth.uid())";

    const policy = createPolicy("owner_test")
      .on("items")
      .for("SELECT")
      .when(column("owner_id").isOwner());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("belongsToTenant helper", () => {
    const expected =
      "CREATE POLICY tenant_test ON data FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER)";

    const policy = createPolicy("tenant_test")
      .on("data")
      .for("ALL")
      .when(column("tenant_id").belongsToTenant());

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("isMemberOf helper", () => {
    const expected =
      "CREATE POLICY member_test ON projects FOR SELECT USING (id IN ( SELECT project_id FROM project_members WHERE user_id = auth.uid() ))";

    const policy = createPolicy("member_test")
      .on("projects")
      .for("SELECT")
      .when(column("id").isMemberOf("project_members", "project_id", "id"));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("hasRole helper", () => {
    const expected =
      "CREATE POLICY role_test ON admin_data FOR SELECT USING (EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin' ))";

    const policy = createPolicy("role_test")
      .on("admin_data")
      .for("SELECT")
      .when(hasRole("admin"));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("userOwned template - single operation", () => {
    const expected =
      "CREATE POLICY documents_select_owner ON documents FOR SELECT USING (user_id = auth.uid())";

    const [policy] = policies.userOwned("documents", "SELECT");

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("tenantIsolation template", () => {
    const expected =
      "CREATE POLICY tenant_data_tenant_isolation ON tenant_data AS RESTRICTIVE FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER)";

    const policy = policies.tenantIsolation("tenant_data");

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("publicAccess template", () => {
    const expected =
      "CREATE POLICY posts_public_access ON posts FOR SELECT USING (is_public = TRUE)";

    const policy = policies.publicAccess("posts");

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Multi-tenant SaaS with organization hierarchy", () => {
    const expected =
      "CREATE POLICY org_hierarchy_access ON documents FOR SELECT USING ((user_id = auth.uid() OR organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())))";

    const policy = createPolicy("org_hierarchy_access")
      .on("documents")
      .for("SELECT")
      .when(
        column("user_id")
          .isOwner()
          .or(column("organization_id").userBelongsTo("organization_members"))
      );

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Collaborative workspace with team permissions", () => {
    const expected =
      "CREATE POLICY workspace_collaboration ON projects FOR UPDATE USING ((created_by = auth.uid() OR id IN ( SELECT project_id FROM team_members WHERE user_id = auth.uid() ))) WITH CHECK ((created_by = auth.uid() OR (id IN ( SELECT project_id FROM team_members WHERE user_id = auth.uid() ) AND can_edit = TRUE)))";

    const policy = createPolicy("workspace_collaboration")
      .on("projects")
      .for("UPDATE")
      .when(
        column("created_by")
          .isOwner()
          .or(column("id").isMemberOf("team_members", "project_id", "id"))
      )
      .withCheck(
        column("created_by")
          .isOwner()
          .or(
            column("id")
              .isMemberOf("team_members", "project_id", "id")
              .and(column("can_edit").eq(true))
          )
      );

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Private sharing with explicit permissions", () => {
    const expected =
      "CREATE POLICY private_sharing ON files FOR SELECT USING ((owner_id = auth.uid() OR id IN ( SELECT file_id FROM file_shares WHERE user_id = auth.uid() ) OR (is_public = TRUE AND workspace_visible = TRUE)))";

    const policy = createPolicy("private_sharing")
      .on("files")
      .for("SELECT")
      .when(
        column("owner_id")
          .isOwner()
          .or(column("id").isMemberOf("file_shares", "file_id", "id"))
          .or(
            column("is_public")
              .eq(true)
              .and(column("workspace_visible").eq(true))
          )
      );

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Policy group generates multiple SQL statements", () => {
    const expected = `CREATE POLICY user_select ON users FOR SELECT USING (true);

    CREATE POLICY user_insert ON users FOR INSERT WITH CHECK (id = auth.uid());

    CREATE POLICY user_update ON users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid())`;

    const group = createPolicyGroup("user_crud", [
      createPolicy("user_select").on("users").for("SELECT").when(alwaysTrue()),
      createPolicy("user_insert")
        .on("users")
        .for("INSERT")
        .withCheck(column("id").isOwner()),
      createPolicy("user_update")
        .on("users")
        .for("UPDATE")
        .when(column("id").isOwner())
        .withCheck(column("id").isOwner()),
    ]);

    expect(normalizeSQL(policyGroupToSQL(group))).toBe(normalizeSQL(expected));
  });

  test("Session variable with different types", () => {
    const expectedInt =
      "CREATE POLICY session_int ON data FOR SELECT USING (org_id = current_setting('app.org_id', true)::INTEGER)";

    const intPolicy = createPolicy("session_int")
      .on("data")
      .for("SELECT")
      .when(column("org_id").eq(session.get("app.org_id", "integer")));

    expect(normalizeSQL(intPolicy.toSQL())).toBe(normalizeSQL(expectedInt));
  });

  test("Current user context", () => {
    const expected =
      "CREATE POLICY current_user_test ON audit_logs FOR SELECT USING (db_user = current_user)";

    const policy = createPolicy("current_user_test")
      .on("audit_logs")
      .for("SELECT")
      .when(column("db_user").eq(currentUser()));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Boolean values are properly escaped", () => {
    const expected =
      "CREATE POLICY bool_test ON items FOR SELECT USING (active = TRUE)";

    const policy = createPolicy("bool_test")
      .on("items")
      .for("SELECT")
      .when(column("active").eq(true));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Special characters in identifiers are escaped", () => {
    const expected =
      'CREATE POLICY "special-chars" ON "table-name" FOR SELECT USING ("column-name" = \'value\')';

    const policy = createPolicy("special-chars")
      .on("table-name")
      .for("SELECT")
      .when(column("column-name").eq("value"));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  test("Date objects are converted to timestamps", () => {
    const expected =
      "CREATE POLICY date_test ON events FOR SELECT USING (event_date >= '2025-01-01T00:00:00.000Z'::TIMESTAMP)";

    const testDate = new Date("2025-01-01T00:00:00.000Z");
    const policy = createPolicy("date_test")
      .on("events")
      .for("SELECT")
      .when(column("event_date").gte(testDate));

    expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
  });

  describe("Comparison Operators", () => {
    test("Greater than or equal (gte)", () => {
      const expected =
        "CREATE POLICY gte_test ON items FOR SELECT USING (age >= 18)";

      const policy = createPolicy("gte_test")
        .on("items")
        .for("SELECT")
        .when(column("age").gte(18));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Less than (lt)", () => {
      const expected =
        "CREATE POLICY lt_test ON items FOR SELECT USING (age < 65)";

      const policy = createPolicy("lt_test")
        .on("items")
        .for("SELECT")
        .when(column("age").lt(65));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Less than or equal (lte)", () => {
      const expected =
        "CREATE POLICY lte_test ON items FOR SELECT USING (age <= 100)";

      const policy = createPolicy("lte_test")
        .on("items")
        .for("SELECT")
        .when(column("age").lte(100));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Comparison condition with qualified column", () => {
      const expected =
        'CREATE POLICY comp_qualified_test ON items FOR SELECT USING ("users.id" = 1)';

      const policy = createPolicy("comp_qualified_test")
        .on("items")
        .for("SELECT")
        .when(column("users.id").eq(1));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Logical condition with multiple qualified columns", () => {
      const expected =
        'CREATE POLICY logical_qualified_test ON items FOR SELECT USING (("users.id" = 1 OR "posts.id" = 2))';

      const policy = createPolicy("logical_qualified_test")
        .on("items")
        .for("SELECT")
        .when(column("users.id").eq(1).or(column("posts.id").eq(2)));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Nested condition in comparison value", () => {
      const innerCondition = column("posts.user_id").eq(auth.uid());
      const expected =
        'CREATE POLICY nested_comp_test ON items FOR SELECT USING ("users.id" = "posts.user_id" = auth.uid())';

      const policy = createPolicy("nested_comp_test")
        .on("items")
        .for("SELECT")
        .when(column("users.id").eq(innerCondition));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Pattern Matching Operators", () => {
    test("LIKE operator", () => {
      const expected =
        "CREATE POLICY like_test ON items FOR SELECT USING (name LIKE '%test%')";

      const policy = createPolicy("like_test")
        .on("items")
        .for("SELECT")
        .when(column("name").like("%test%"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("ILIKE operator (case-insensitive)", () => {
      const expected =
        "CREATE POLICY ilike_test ON items FOR SELECT USING (name ILIKE '%TEST%')";

      const policy = createPolicy("ilike_test")
        .on("items")
        .for("SELECT")
        .when(column("name").ilike("%TEST%"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Pattern condition with qualified column", () => {
      const expected =
        'CREATE POLICY pattern_qualified_test ON items FOR SELECT USING ("users.name" LIKE \'%test%\')';

      const policy = createPolicy("pattern_qualified_test")
        .on("items")
        .for("SELECT")
        .when(column("users.name").like("%test%"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Null Check Conditions", () => {
    test("IS NULL check", () => {
      const expected =
        "CREATE POLICY null_test ON items FOR SELECT USING (deleted_at IS NULL)";

      const policy = createPolicy("null_test")
        .on("items")
        .for("SELECT")
        .when(column("deleted_at").isNull());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test('IS NULL check with string "null"', () => {
      const expected =
        "CREATE POLICY null_string_test ON items FOR SELECT USING (deleted_at IS NULL)";

      const policy = createPolicy("null_string_test")
        .on("items")
        .for("SELECT")
        .when(column("deleted_at").isNull());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("IS NOT NULL check", () => {
      const expected =
        "CREATE POLICY not_null_test ON items FOR SELECT USING (created_at IS NOT NULL)";

      const policy = createPolicy("not_null_test")
        .on("items")
        .for("SELECT")
        .when(column("created_at").isNotNull());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Null condition with qualified column", () => {
      const expected =
        'CREATE POLICY null_qualified_test ON items FOR SELECT USING ("users.email" IS NULL)';

      const policy = createPolicy("null_qualified_test")
        .on("items")
        .for("SELECT")
        .when(column("users.email").isNull());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Membership Conditions", () => {
    test("IN operator with array of strings", () => {
      const expected =
        "CREATE POLICY in_strings_test ON items FOR SELECT USING (status IN ('active', 'pending', 'review'))";

      const policy = createPolicy("in_strings_test")
        .on("items")
        .for("SELECT")
        .when(column("status").in(["active", "pending", "review"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("IN operator with array of numbers", () => {
      const expected =
        "CREATE POLICY in_numbers_test ON items FOR SELECT USING (category_id IN (1, 2, 3))";

      const policy = createPolicy("in_numbers_test")
        .on("items")
        .for("SELECT")
        .when(column("category_id").in([1, 2, 3]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("IN operator with array of booleans", () => {
      const expected =
        "CREATE POLICY in_booleans_test ON items FOR SELECT USING (flag IN (TRUE, FALSE))";

      const policy = createPolicy("in_booleans_test")
        .on("items")
        .for("SELECT")
        .when(column("flag").in([true, false]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("IN operator with subquery", () => {
      const expected =
        "CREATE POLICY in_subquery_test ON items FOR SELECT USING (user_id IN (SELECT id FROM users WHERE active = TRUE))";

      const policy = createPolicy("in_subquery_test")
        .on("items")
        .for("SELECT")
        .when(
          column("user_id").in(
            from("users").select("id").where(column("active").eq(true))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("CONTAINS operator with array value", () => {
      const expected =
        "CREATE POLICY contains_test ON items FOR SELECT USING (tags @> ARRAY['urgent', 'important'])";

      const policy = createPolicy("contains_test")
        .on("items")
        .for("SELECT")
        .when(column("tags").contains(["urgent", "important"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("CONTAINS operator with single value", () => {
      const expected =
        "CREATE POLICY contains_single_test ON items FOR SELECT USING (tags @> 'urgent')";

      const policy = createPolicy("contains_single_test")
        .on("items")
        .for("SELECT")
        .when(column("tags").contains("urgent"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Membership condition with qualified column", () => {
      const expected =
        'CREATE POLICY membership_qualified_test ON items FOR SELECT USING ("users.id" IN (1, 2, 3))';

      const policy = createPolicy("membership_qualified_test")
        .on("items")
        .for("SELECT")
        .when(column("users.id").in([1, 2, 3]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Session Variable Types", () => {
    test("Session variable with text type", () => {
      const expected =
        "CREATE POLICY session_text ON data FOR SELECT USING (org_name = current_setting('app.org_name', true))";

      const policy = createPolicy("session_text")
        .on("data")
        .for("SELECT")
        .when(column("org_name").eq(session.get("app.org_name", "text")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Session variable with uuid type", () => {
      const expected =
        "CREATE POLICY session_uuid ON data FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::UUID)";

      const policy = createPolicy("session_uuid")
        .on("data")
        .for("SELECT")
        .when(column("tenant_id").eq(session.get("app.tenant_id", "uuid")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Session variable with boolean type", () => {
      const expected =
        "CREATE POLICY session_bool ON data FOR SELECT USING (is_admin = current_setting('app.is_admin', true)::BOOLEAN)";

      const policy = createPolicy("session_bool")
        .on("data")
        .for("SELECT")
        .when(column("is_admin").eq(session.get("app.is_admin", "boolean")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Session variable with timestamp type", () => {
      const expected =
        "CREATE POLICY session_timestamp ON data FOR SELECT USING (created_at >= current_setting('app.start_date', true)::TIMESTAMP)";

      const policy = createPolicy("session_timestamp")
        .on("data")
        .for("SELECT")
        .when(
          column("created_at").gte(session.get("app.start_date", "timestamp"))
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Subquery Conditions", () => {
    test("Subquery with alias", () => {
      const expected =
        'CREATE POLICY subquery_alias ON items FOR SELECT USING (user_id IN (SELECT "u.id" FROM users u WHERE "u.active" = TRUE))';

      const policy = createPolicy("subquery_alias")
        .on("items")
        .for("SELECT")
        .when(
          column("user_id").in(
            from("users", "u").select("u.id").where(column("u.active").eq(true))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with multiple select columns", () => {
      const expected =
        "CREATE POLICY subquery_multi_select ON items FOR SELECT USING (id IN (SELECT id, name FROM users WHERE active = TRUE))";

      const policy = createPolicy("subquery_multi_select")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("users")
              .select(["id", "name"])
              .where(column("active").eq(true))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with join", () => {
      const expected =
        'CREATE POLICY subquery_join ON items FOR SELECT USING (id IN (SELECT "p.id" FROM projects p INNER JOIN members m ON "m.project_id" = \'p.id\' WHERE "m.user_id" = auth.uid()))';

      const policy = createPolicy("subquery_join")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("projects", "p")
              .select("p.id")
              .join("members", column("m.project_id").eq("p.id"), "inner", "m")
              .where(column("m.user_id").eq(auth.uid()))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery join detection - missing join throws error", () => {
      expect(() => {
        from("projects")
          .select("id")
          .where(column("members.user_id").eq(auth.uid()));
      }).toThrow(/Missing join\(s\) for table\(s\): members/);
    });

    test("Subquery join detection - join added before where works", () => {
      const expected =
        'CREATE POLICY join_before_where ON items FOR SELECT USING (id IN (SELECT "p.id" FROM projects p INNER JOIN members m ON "m.project_id" = \'p.id\' WHERE "m.user_id" = auth.uid()))';

      const policy = createPolicy("join_before_where")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("projects", "p")
              .select("p.id")
              .join("members", column("m.project_id").eq("p.id"), "inner", "m")
              .where(column("m.user_id").eq(auth.uid()))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with left join", () => {
      const expected =
        'CREATE POLICY left_join_test ON items FOR SELECT USING (id IN (SELECT "p.id" FROM projects p LEFT JOIN members m ON "m.project_id" = \'p.id\' WHERE "m.user_id" = auth.uid()))';

      const policy = createPolicy("left_join_test")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("projects", "p")
              .select("p.id")
              .join("members", column("m.project_id").eq("p.id"), "left", "m")
              .where(column("m.user_id").eq(auth.uid()))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with qualified column reference", () => {
      const expected =
        'CREATE POLICY qualified_col_test ON items FOR SELECT USING (id IN (SELECT "users.id" FROM users WHERE "users.active" = TRUE))';

      const policy = createPolicy("qualified_col_test")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("users")
              .select("users.id")
              .where(column("users.active").eq(true))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with unqualified column reference", () => {
      const expected =
        "CREATE POLICY unqualified_col_test ON items FOR SELECT USING (id IN (SELECT id FROM users WHERE active = TRUE))";

      const policy = createPolicy("unqualified_col_test")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("users").select("id").where(column("active").eq(true))
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Subquery with quoted table identifier in from clause", () => {
      const policy = createPolicy("quoted_table_test")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from('"table name"')
              .select("id")
              .where(column("active").eq(true))
          )
        );

      const sql = policy.toSQL();
      expect(sql).toContain('"table name"');
      expect(sql).toContain("SELECT");
    });

    test("Subquery error when referencing multiple missing tables", () => {
      expect(() => {
        from("projects")
          .select("id")
          .where(
            column("members.user_id")
              .eq(auth.uid())
              .or(column("comments.author_id").eq(auth.uid()))
          );
      }).toThrow(/Missing join\(s\) for table\(s\):/);
    });

    test("Subquery no error when all referenced tables are joined", () => {
      expect(() => {
        from("projects", "p")
          .select("p.id")
          .join("members", column("m.project_id").eq("p.id"), "inner", "m")
          .where(column("m.user_id").eq(auth.uid()));
      }).not.toThrow();
    });

    test("Subquery no error when using unqualified columns", () => {
      expect(() => {
        from("projects")
          .select("id")
          .where(column("user_id").eq(auth.uid()));
      }).not.toThrow();
    });

    test("Subquery with multiple joins validates all table references but only first join appears in SQL", () => {
      const policy = createPolicy("multi_join_alias_test")
        .on("items")
        .for("SELECT")
        .when(
          column("id").in(
            from("projects", "p")
              .select("p.id")
              .join("members", column("m.project_id").eq("p.id"), "inner", "m")
              .join("comments", column("c.project_id").eq("p.id"), "inner", "c")
              .where(
                column("m.user_id")
                  .eq(auth.uid())
                  .and(column("c.approved").eq(true))
              )
          )
        );

      const sql = normalizeSQL(policy.toSQL());
      expect(sql).toContain('"p.id"');
      expect(sql).toContain("INNER JOIN members m");
      expect(sql).toContain('"m.user_id" = auth.uid()');
    });

    test("Subquery join condition references unavailable table throws error", () => {
      expect(() => {
        from("projects", "p")
          .select("p.id")
          .join(
            "members",
            column("m.project_id").eq("p.id").and(column("other.user_id").eq(auth.uid())),
            "inner",
            "m"
          );
      }).toThrow(/Join condition references unavailable table\(s\): other/);
    });
  });

  describe("Function Conditions", () => {
    test("Function call with string arguments", () => {
      const expected =
        "CREATE POLICY function_test ON items FOR SELECT USING (has_permission(user_id, read))";

      const policy = createPolicy("function_test")
        .on("items")
        .for("SELECT")
        .when(call("has_permission", ["user_id", "read"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Function call with condition arguments", () => {
      const expected =
        "CREATE POLICY function_cond_test ON items FOR SELECT USING (check_access(user_id = auth.uid(), role = 'admin'))";

      const policy = createPolicy("function_cond_test")
        .on("items")
        .for("SELECT")
        .when(
          call("check_access", [
            column("user_id").isOwner(),
            column("role").eq("admin"),
          ])
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Function condition with qualified column arguments", () => {
      const expected =
        'CREATE POLICY func_qualified_test ON items FOR SELECT USING (check_permission("users.id", "posts.id"))';

      const policy = createPolicy("func_qualified_test")
        .on("items")
        .for("SELECT")
        .when(call("check_permission", ["users.id", "posts.id"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Nested condition in function arguments", () => {
      const nestedCondition = column("posts.id").eq(1);
      const expected =
        'CREATE POLICY nested_func_test ON items FOR SELECT USING (test("posts.id" = 1))';

      const policy = createPolicy("nested_func_test")
        .on("items")
        .for("SELECT")
        .when(call("test", [nestedCondition]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Policy Operations", () => {
    test("DELETE operation", () => {
      const expected =
        "CREATE POLICY delete_test ON items FOR DELETE USING (user_id = auth.uid())";

      const policy = createPolicy("delete_test")
        .on("items")
        .for("DELETE")
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("ALL operation", () => {
      const expected =
        "CREATE POLICY all_test ON items FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("all_test")
        .on("items")
        .for("ALL")
        .when(column("user_id").isOwner())
        .withCheck(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Policy Types", () => {
    test("PERMISSIVE policy type (explicit)", () => {
      const expected =
        "CREATE POLICY permissive_test ON items FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("permissive_test")
        .on("items")
        .for("SELECT")
        .permissive()
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Helper Conditions", () => {
    test("releasedBefore helper", () => {
      const testDate = new Date("2025-01-01T00:00:00.000Z");
      const expected =
        "CREATE POLICY released_test ON items FOR SELECT USING (release_date <= '2025-01-01T00:00:00.000Z'::TIMESTAMP)";

      const policy = createPolicy("released_test")
        .on("items")
        .for("SELECT")
        .when(column("release_date").releasedBefore(testDate));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("releasedBefore helper without date (uses current date)", () => {
      const policy = createPolicy("released_now_test")
        .on("items")
        .for("SELECT")
        .when(column("release_date").releasedBefore());

      const sql = policy.toSQL();
      expect(sql).toContain("release_date <=");
      expect(sql).toContain("::TIMESTAMP");
    });

    test("isPublic helper with custom column", () => {
      const expected =
        "CREATE POLICY public_custom_test ON items FOR SELECT USING (visibility = TRUE)";

      const policy = createPolicy("public_custom_test")
        .on("items")
        .for("SELECT")
        .when(column("visibility").isPublic());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("hasRole helper with custom table", () => {
      const expected =
        "CREATE POLICY role_custom_test ON admin_data FOR SELECT USING (EXISTS ( SELECT 1 FROM custom_roles WHERE user_id = auth.uid() AND role = 'admin' ))";

      const policy = createPolicy("role_custom_test")
        .on("admin_data")
        .for("SELECT")
        .when(hasRole("admin", "custom_roles"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Policy Templates", () => {
    test("roleAccess template", () => {
      const expected =
        "CREATE POLICY items_select_admin ON items FOR SELECT USING (EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin' ))";

      const [policy] = policies.roleAccess("items", "admin", "SELECT");

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("roleAccess template with multiple operations", () => {
      const policies_list = policies.roleAccess("items", "admin", [
        "SELECT",
        "INSERT",
      ]);

      expect(policies_list).toHaveLength(2);
      expect(policies_list[0].toDefinition().operation).toBe("SELECT");
      expect(policies_list[1].toDefinition().operation).toBe("INSERT");
    });

    test("userOwned template with multiple operations", () => {
      const policies_list = policies.userOwned("documents", [
        "SELECT",
        "INSERT",
        "UPDATE",
      ]);

      expect(policies_list).toHaveLength(3);
      expect(policies_list[0].toDefinition().operation).toBe("SELECT");
      expect(policies_list[1].toDefinition().operation).toBe("INSERT");
      expect(policies_list[2].toDefinition().operation).toBe("UPDATE");
    });

    test("userOwned template with custom userIdColumn", () => {
      const expected =
        "CREATE POLICY items_select_owner ON items FOR SELECT USING (owner_id = auth.uid())";

      const [policy] = policies.userOwned("items", "SELECT", "owner_id");

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Policy Description", () => {
    test("Policy with description field (not in SQL but stored)", () => {
      const policy = createPolicy("desc_test")
        .on("items")
        .for("SELECT")
        .when(column("user_id").isOwner())
        .description("This policy allows users to read their own items");

      const def = policy.toDefinition();
      expect(def.description).toBe(
        "This policy allows users to read their own items"
      );
    });
  });

  describe("Complex Value Types", () => {
    test("Comparison with null value", () => {
      const expected =
        "CREATE POLICY null_value_test ON items FOR SELECT USING (deleted_at = NULL)";

      const policy = createPolicy("null_value_test")
        .on("items")
        .for("SELECT")
        .when(column("deleted_at").eq(null));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Comparison with false boolean", () => {
      const expected =
        "CREATE POLICY false_test ON items FOR SELECT USING (archived = FALSE)";

      const policy = createPolicy("false_test")
        .on("items")
        .for("SELECT")
        .when(column("archived").eq(false));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Nested condition as value", () => {
      const expected =
        "CREATE POLICY nested_cond_test ON items FOR SELECT USING (user_id = user_id = auth.uid())";

      const policy = createPolicy("nested_cond_test")
        .on("items")
        .for("SELECT")
        .when(column("user_id").eq(column("user_id").isOwner()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Context Values", () => {
    test("auth.uid() context", () => {
      const expected =
        "CREATE POLICY auth_uid_test ON items FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("auth_uid_test")
        .on("items")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("current_user context", () => {
      const expected =
        "CREATE POLICY current_user_context_test ON audit_logs FOR SELECT USING (db_user = current_user)";

      const policy = createPolicy("current_user_context_test")
        .on("audit_logs")
        .for("SELECT")
        .when(column("db_user").eq(currentUser()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Edge Cases", () => {
    test("Special characters in values", () => {
      const expected =
        "CREATE POLICY special_chars_test ON items FOR SELECT USING (name = 'O''Brien')";

      const policy = createPolicy("special_chars_test")
        .on("items")
        .for("SELECT")
        .when(column("name").eq("O'Brien"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Empty array in IN operator", () => {
      const expected =
        "CREATE POLICY empty_array_test ON items FOR SELECT USING (status IN ())";

      const policy = createPolicy("empty_array_test")
        .on("items")
        .for("SELECT")
        .when(column("status").in([]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Array with null values", () => {
      const expected =
        "CREATE POLICY null_array_test ON items FOR SELECT USING (status IN (NULL, 'active'))";

      const policy = createPolicy("null_array_test")
        .on("items")
        .for("SELECT")
        .when(column("status").in([null, "active"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Complex nested logical conditions", () => {
      const expected =
        "CREATE POLICY complex_nested_test ON items FOR SELECT USING (((status = 'active' OR status = 'pending') AND (user_id = auth.uid() OR is_public = TRUE)))";

      const policy = createPolicy("complex_nested_test")
        .on("items")
        .for("SELECT")
        .when(
          column("status")
            .eq("active")
            .or(column("status").eq("pending"))
            .and(column("user_id").isOwner().or(column("is_public").isPublic()))
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("SQLExpression", () => {
    test("sql() function creates SQLExpression", () => {
      const expr = sql("COUNT(*)");
      expect(expr).toBeInstanceOf(SQLExpression);
      expect(expr.toSQL()).toBe("COUNT(*)");
    });

    test("SQLExpression toString() returns expression", () => {
      const expr = sql("NOW()");
      expect(expr.toString()).toBe("NOW()");
    });

    test("SQLExpression in comparison condition", () => {
      const expected =
        "CREATE POLICY count_test ON items FOR SELECT USING (item_count > COUNT(*))";

      const policy = createPolicy("count_test")
        .on("items")
        .for("SELECT")
        .when(column("item_count").gt(sql("COUNT(*)")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("SQLExpression with function calls", () => {
      const expected =
        "CREATE POLICY date_test ON items FOR SELECT USING (created_at >= NOW() - INTERVAL '7 days')";

      const policy = createPolicy("date_test")
        .on("items")
        .for("SELECT")
        .when(column("created_at").gte(sql("NOW() - INTERVAL '7 days'")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("SQLExpression with complex SQL", () => {
      const expected =
        "CREATE POLICY complex_sql_test ON items FOR SELECT USING (score = COALESCE(rating * 10, 0))";

      const policy = createPolicy("complex_sql_test")
        .on("items")
        .for("SELECT")
        .when(column("score").eq(sql("COALESCE(rating * 10, 0)")));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("SQLExpression prevents string escaping", () => {
      const expected =
        "CREATE POLICY raw_sql_test ON items FOR SELECT USING (status = CASE WHEN is_admin THEN 'active' ELSE 'pending' END)";

      const policy = createPolicy("raw_sql_test")
        .on("items")
        .for("SELECT")
        .when(
          column("status").eq(
            sql("CASE WHEN is_admin THEN 'active' ELSE 'pending' END")
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Modern Column-Based API", () => {
    test("Basic column equality", () => {
      const expected =
        "CREATE POLICY test ON documents FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("test")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column OR condition", () => {
      const expected =
        "CREATE POLICY test ON projects FOR SELECT USING ((user_id = auth.uid() OR is_public = TRUE))";

      const policy = createPolicy("test")
        .on("projects")
        .for("SELECT")
        .when(
          column("user_id").eq(auth.uid()).or(column("is_public").eq(true))
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column AND condition", () => {
      const expected =
        "CREATE POLICY test ON articles FOR SELECT USING ((status = 'draft' AND author_id = auth.uid()))";

      const policy = createPolicy("test")
        .on("articles")
        .for("SELECT")
        .when(
          column("status").eq("draft").and(column("author_id").eq(auth.uid()))
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Complex nested column conditions", () => {
      const expected =
        "CREATE POLICY test ON items FOR SELECT USING ((is_public = TRUE OR (user_id = auth.uid() AND status = 'active')))";

      const policy = createPolicy("test")
        .on("items")
        .for("SELECT")
        .when(
          column("is_public")
            .eq(true)
            .or(
              column("user_id")
                .eq(auth.uid())
                .and(column("status").eq("active"))
            )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column comparison operators", () => {
      const expected =
        "CREATE POLICY test ON products FOR SELECT USING ((price > 10 AND quantity <= 100))";

      const policy = createPolicy("test")
        .on("products")
        .for("SELECT")
        .when(column("price").gt(10).and(column("quantity").lte(100)));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column pattern matching", () => {
      const expected =
        "CREATE POLICY test ON users FOR SELECT USING (email LIKE '%@company.com')";

      const policy = createPolicy("test")
        .on("users")
        .for("SELECT")
        .when(column("email").like("%@company.com"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column IN operator with array", () => {
      const expected =
        "CREATE POLICY test ON orders FOR SELECT USING (status IN ('pending', 'processing', 'shipped'))";

      const policy = createPolicy("test")
        .on("orders")
        .for("SELECT")
        .when(column("status").in(["pending", "processing", "shipped"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column null checks", () => {
      const expected =
        "CREATE POLICY test ON items FOR SELECT USING ((deleted_at IS NULL AND verified_at IS NOT NULL))";

      const policy = createPolicy("test")
        .on("items")
        .for("SELECT")
        .when(
          column("deleted_at").isNull().and(column("verified_at").isNotNull())
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column helper methods - isOwner", () => {
      const expected =
        "CREATE POLICY test ON documents FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("test")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column helper methods - isPublic", () => {
      const expected =
        "CREATE POLICY test ON posts FOR SELECT USING (is_public = TRUE)";

      const policy = createPolicy("test")
        .on("posts")
        .for("SELECT")
        .when(column("is_public").isPublic());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Using .when() method", () => {
      const expected =
        "CREATE POLICY test ON items FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("test")
        .on("items")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Using .allow() method", () => {
      const expected =
        "CREATE POLICY test ON resources FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())";

      const policy = createPolicy("test")
        .on("resources")
        .for("UPDATE")
        .allow(column("owner_id").eq(auth.uid()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column conditions work with INSERT", () => {
      const expected =
        "CREATE POLICY test ON posts FOR INSERT WITH CHECK (author_id = auth.uid())";

      const policy = createPolicy("test")
        .on("posts")
        .for("INSERT")
        .allow(column("author_id").eq(auth.uid()));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column conditions with multiple OR branches", () => {
      const expected =
        "CREATE POLICY test ON projects FOR SELECT USING ((user_id = auth.uid() OR is_public = TRUE OR organization_id = '123'))";

      const policy = createPolicy("test")
        .on("projects")
        .for("SELECT")
        .when(
          column("user_id")
            .eq(auth.uid())
            .or(column("is_public").eq(true))
            .or(column("organization_id").eq("123"))
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column conditions with multiple AND branches", () => {
      const expected =
        "CREATE POLICY test ON articles FOR SELECT USING ((status = 'active' AND published = TRUE AND deleted_at IS NULL))";

      const policy = createPolicy("test")
        .on("articles")
        .for("SELECT")
        .when(
          column("status")
            .eq("active")
            .and(column("published").eq(true))
            .and(column("deleted_at").isNull())
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column conditions chaining", () => {
      const expected =
        "CREATE POLICY test ON items FOR SELECT USING ((user_id = auth.uid() OR is_public = TRUE))";

      const policy = createPolicy("test")
        .on("items")
        .for("SELECT")
        .when(
          column("user_id").eq(auth.uid()).or(column("is_public").isPublic())
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column with session variable", () => {
      const expected =
        "CREATE POLICY test ON data FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER)";

      const policy = createPolicy("test")
        .on("data")
        .for("ALL")
        .when(
          column("tenant_id").eq(
            session.get("app.current_tenant_id", "integer")
          )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column with date comparison", () => {
      const date = new Date("2024-01-01");
      const expected =
        "CREATE POLICY test ON reports FOR SELECT USING (release_date <= '2024-01-01T00:00:00.000Z'::TIMESTAMP)";

      const policy = createPolicy("test")
        .on("reports")
        .for("SELECT")
        .when(column("release_date").lte(date));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column with contains operator", () => {
      const expected =
        "CREATE POLICY test ON items FOR SELECT USING (tags @> ARRAY['important', 'urgent'])";

      const policy = createPolicy("test")
        .on("items")
        .for("SELECT")
        .when(column("tags").contains(["important", "urgent"]));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Column with ilike (case-insensitive)", () => {
      const expected =
        "CREATE POLICY test ON users FOR SELECT USING (name ILIKE 'john%')";

      const policy = createPolicy("test")
        .on("users")
        .for("SELECT")
        .when(column("name").ilike("john%"));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("Very complex nested column conditions", () => {
      const expected =
        "CREATE POLICY test ON documents FOR SELECT USING (((is_public = TRUE OR user_id = auth.uid()) AND (status = 'active' OR status = 'pending')))";

      const policy = createPolicy("test")
        .on("documents")
        .for("SELECT")
        .when(
          column("is_public")
            .eq(true)
            .or(column("user_id").eq(auth.uid()))
            .and(
              column("status").eq("active").or(column("status").eq("pending"))
            )
        );

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });

  describe("Index Generation", () => {
    test("Generate index for user_id equality comparison", () => {
      const policy = createPolicy("user_docs")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("CREATE POLICY");
      expect(sql).toContain("CREATE INDEX");
      expect(sql).toContain("idx_documents_user_id");
      expect(sql).toContain("ON documents (user_id)");
    });

    test("Generate index for isOwner helper", () => {
      const policy = createPolicy("user_docs")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").isOwner());

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("CREATE INDEX");
      expect(sql).toContain("idx_documents_user_id");
    });

    test("Generate index for tenant isolation", () => {
      const policy = createPolicy("tenant_data")
        .on("data")
        .for("SELECT")
        .when(column("tenant_id").belongsToTenant());

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("CREATE INDEX");
      expect(sql).toContain("idx_data_tenant_id");
    });

    test("Generate index for IN clause with subquery", () => {
      const policy = createPolicy("member_access")
        .on("projects")
        .for("SELECT")
        .when(
          column("id").in(
            from("project_members")
              .select("project_id")
              .where(column("user_id").eq(auth.uid()))
          )
        );

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("CREATE INDEX");
      expect(sql).toContain("idx_projects_id");
      expect(sql).toContain("idx_project_members_user_id");
    });

    test("Generate indexes for multiple columns", () => {
      const policy = createPolicy("complex_policy")
        .on("documents")
        .for("SELECT")
        .when(
          column("user_id")
            .eq(auth.uid())
            .or(column("organization_id").eq(session.get("app.org_id", "uuid")))
        );

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("idx_documents_user_id");
      expect(sql).toContain("idx_documents_organization_id");
    });

    test("No indexes generated when flag is false", () => {
      const policy = createPolicy("user_docs")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      const sql = policy.toSQL();
      expect(sql).not.toContain("CREATE INDEX");
      expect(sql).toContain("CREATE POLICY");
    });

    test("No indexes generated when flag is undefined", () => {
      const policy = createPolicy("user_docs")
        .on("documents")
        .for("SELECT")
        .when(column("user_id").eq(auth.uid()));

      const sql = policy.toSQL();
      expect(sql).not.toContain("CREATE INDEX");
    });

    test("Generate indexes for isMemberOf helper", () => {
      const policy = createPolicy("member_projects")
        .on("projects")
        .for("SELECT")
        .when(column("id").isMemberOf("project_members", "project_id"));

      const sql = policy.toSQL({ includeIndexes: true });
      expect(sql).toContain("idx_projects_id");
      expect(sql).toContain("idx_project_members_project_id");
      expect(sql).toContain("idx_project_members_user_id");
    });

    test("Generate indexes for policy group", () => {
      const policies = [
        createPolicy("user_docs")
          .on("documents")
          .for("SELECT")
          .when(column("user_id").eq(auth.uid())),
        createPolicy("user_posts")
          .on("posts")
          .for("SELECT")
          .when(column("author_id").eq(auth.uid())),
      ];

      const group = createPolicyGroup("user_policies", policies);
      const sql = policyGroupToSQL(group, { includeIndexes: true });

      expect(sql).toContain("CREATE POLICY");
      expect(sql).toContain("idx_documents_user_id");
      expect(sql).toContain("idx_posts_author_id");
    });
  });

  describe("User-Focused API", () => {
    test("read() method - alias for SELECT", () => {
      const expected =
        "CREATE POLICY read_docs ON documents FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("read_docs")
        .on("documents")
        .read()
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("write() method - alias for INSERT", () => {
      const expected =
        "CREATE POLICY write_docs ON documents FOR INSERT WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("write_docs")
        .on("documents")
        .write()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("update() method - alias for UPDATE", () => {
      const expected =
        "CREATE POLICY update_docs ON documents FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("update_docs")
        .on("documents")
        .update()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("delete() method - alias for DELETE", () => {
      const expected =
        "CREATE POLICY delete_docs ON documents FOR DELETE USING (user_id = auth.uid())";

      const policy = createPolicy("delete_docs")
        .on("documents")
        .delete()
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("all() method - alias for ALL", () => {
      const expected =
        "CREATE POLICY all_docs ON documents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("all_docs")
        .on("documents")
        .all()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("requireAll() method - alias for restrictive()", () => {
      const expected =
        "CREATE POLICY restrictive_policy ON data AS RESTRICTIVE FOR ALL USING (tenant_id = 1)";

      const policy = createPolicy("restrictive_policy")
        .on("data")
        .all()
        .requireAll()
        .when(column("tenant_id").eq(1));

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("allowAny() method - alias for permissive()", () => {
      const expected =
        "CREATE POLICY permissive_policy ON data FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("permissive_policy")
        .on("data")
        .read()
        .allowAny()
        .when(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("User-focused API with allow() method", () => {
      const expected =
        "CREATE POLICY read_policy ON posts FOR SELECT USING (user_id = auth.uid())";

      const policy = createPolicy("read_policy")
        .on("posts")
        .read()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("User-focused API chaining - read with requireAll", () => {
      const expected =
        "CREATE POLICY tenant_read ON tenant_data AS RESTRICTIVE FOR SELECT USING (tenant_id = current_setting('app.current_tenant_id', true)::INTEGER)";

      const policy = createPolicy("tenant_read")
        .on("tenant_data")
        .read()
        .requireAll()
        .when(column("tenant_id").belongsToTenant());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("User-focused API - write with allow()", () => {
      const expected =
        "CREATE POLICY write_policy ON posts FOR INSERT WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("write_policy")
        .on("posts")
        .write()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("User-focused API - update with allow()", () => {
      const expected =
        "CREATE POLICY update_policy ON posts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())";

      const policy = createPolicy("update_policy")
        .on("posts")
        .update()
        .allow(column("user_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });

    test("User-focused API - all operations with allow()", () => {
      const expected =
        "CREATE POLICY full_access ON resources FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())";

      const policy = createPolicy("full_access")
        .on("resources")
        .all()
        .allow(column("owner_id").isOwner());

      expect(normalizeSQL(policy.toSQL())).toBe(normalizeSQL(expected));
    });
  });
});
