import { describe, it, expect } from 'vitest';
import { createRowguard } from '../src/typed';

type TestDatabase = {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; age: number; created_at: string };
        Insert: { id?: string; email: string; age: number; created_at?: string };
        Update: { id?: string; email?: string; age?: number; created_at?: string };
      };
      posts: {
        Row: { id: string; user_id: string; title: string; published: boolean };
        Insert: { id?: string; user_id: string; title: string; published?: boolean };
        Update: { id?: string; user_id?: string; title?: string; published?: boolean };
      };
      project_members: {
        Row: { id: string; project_id: string; user_id: string; role: string };
        Insert: { id?: string; project_id: string; user_id: string; role?: string };
        Update: { id?: string; project_id?: string; user_id?: string; role?: string };
      };
    };
  };
};

describe('Typed Rowguard', () => {
  const rg = createRowguard<TestDatabase>();

  it('generates SQL with typed columns', () => {
    const policy = rg.policy('user_posts').on('posts').read()
      .when(rg.column('posts', 'user_id').eq(rg.auth.uid()));

    const sql = policy.toSQL();
    expect(sql).toContain('CREATE POLICY "user_posts"');
    expect(sql).toContain('ON "posts"');
    expect(sql).toContain('"posts"."user_id"');
  });

  it('supports string equality', () => {
    const policy = rg.policy('email_check').on('users').read()
      .when(rg.column('users', 'email').eq('test@example.com'));

    expect(policy.toSQL()).toContain(`"users"."email" = 'test@example.com'`);
  });

  it('supports numeric comparisons', () => {
    const policy = rg.policy('age_check').on('users').read()
      .when(rg.column('users', 'age').gt(18));

    expect(policy.toSQL()).toContain('"users"."age" > 18');
  });

  it('supports boolean equality', () => {
    const policy = rg.policy('published_posts').on('posts').read()
      .when(rg.column('posts', 'published').eq(true));

    expect(policy.toSQL()).toContain('"posts"."published" = TRUE');
  });

  it('supports chaining with and/or', () => {
    const policy = rg.policy('complex').on('posts').read()
      .when(
        rg.column('posts', 'user_id').eq(rg.auth.uid())
          .or(rg.column('posts', 'published').eq(true))
      );

    const sql = policy.toSQL();
    expect(sql).toContain('"posts"."user_id"');
    expect(sql).toContain('OR');
    expect(sql).toContain('"posts"."published"');
  });

  it('supports null checks', () => {
    const policy = rg.policy('not_deleted').on('posts').read()
      .when(rg.column('posts', 'user_id').isNotNull());

    expect(policy.toSQL()).toContain('"posts"."user_id" IS NOT NULL');
  });

  it('supports isOwner helper', () => {
    const policy = rg.policy('owner_check').on('posts').read()
      .when(rg.column('posts', 'user_id').isOwner());

    expect(policy.toSQL()).toContain('"posts"."user_id" = (SELECT auth.uid())');
  });

  it('supports isPublic helper', () => {
    const policy = rg.policy('public_check').on('posts').read()
      .when(rg.column('posts', 'published').isPublic());

    expect(policy.toSQL()).toContain('"posts"."published" = TRUE');
  });

  it('supports IN operator', () => {
    const policy = rg.policy('status_check').on('posts').read()
      .when(rg.column('posts', 'title').in(['Draft', 'Published']));

    const sql = policy.toSQL();
    expect(sql).toContain('"posts"."title" IN');
    expect(sql).toContain("'Draft'");
  });

  it('supports LIKE / ILIKE', () => {
    expect(
      rg.policy('p').on('users').read()
        .when(rg.column('users', 'email').like('%@example.com'))
        .toSQL()
    ).toContain(`"users"."email" LIKE '%@example.com'`);

    expect(
      rg.policy('p').on('users').read()
        .when(rg.column('users', 'email').ilike('%@EXAMPLE.COM'))
        .toSQL()
    ).toContain(`"users"."email" ILIKE '%@EXAMPLE.COM'`);
  });

  it('supports comparison operators', () => {
    const policy = rg.policy('age_range').on('users').read()
      .when(rg.column('users', 'age').gte(18).and(rg.column('users', 'age').lte(65)));

    const sql = policy.toSQL();
    expect(sql).toContain('"users"."age" >= 18');
    expect(sql).toContain('"users"."age" <= 65');
  });

  it('supports USING + WITH CHECK', () => {
    const policy = rg.policy('update_own').on('posts').update()
      .when(rg.column('posts', 'user_id').isOwner())
      .withCheck(rg.column('posts', 'user_id').isOwner());

    const sql = policy.toSQL();
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('USING');
    expect(sql).toContain('WITH CHECK');
  });

  it('allow() sets correct clauses per operation', () => {
    const read = rg.policy('r').on('posts').read().allow(rg.column('posts', 'published').eq(true)).toSQL();
    expect(read).toContain('USING');
    expect(read).not.toContain('WITH CHECK');

    const insert = rg.policy('i').on('posts').write().allow(rg.column('posts', 'user_id').isOwner()).toSQL();
    expect(insert).toContain('WITH CHECK');
    expect(insert).not.toContain('USING');

    const update = rg.policy('u').on('posts').update().allow(rg.column('posts', 'user_id').isOwner()).toSQL();
    expect(update).toContain('USING');
    expect(update).toContain('WITH CHECK');
  });
});

describe('Typed policies', () => {
  const rg = createRowguard<TestDatabase>();

  it('owned — generates four CRUD policies', () => {
    const builders = rg.policies.owned({ tables: ['posts'] });
    expect(builders).toHaveLength(4);
    const sql = builders.map((b) => b.toSQL()).join('\n');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('FOR DELETE');
    expect(sql).toContain('(SELECT auth.uid())');
  });

  it('owned — custom userColumn', () => {
    const [p] = rg.policies.owned({ tables: ['posts'], userColumn: 'user_id', operations: ['SELECT'] });
    expect(p.toSQL()).toContain('"user_id" = (SELECT auth.uid())');
  });

  it('shared — SELECT policy covers owner OR public', () => {
    const builders = rg.policies.shared({ tables: ['posts'], publicColumn: 'published' });
    const selectPolicy = builders.find((b) => b.toDefinition().operation === 'SELECT')!;
    expect(selectPolicy.toSQL()).toContain('OR');
    expect(selectPolicy.toSQL()).toContain('"published" = TRUE');
  });

  it('membership — via constrains key to columns of the membership table', () => {
    // `key: 'project_id'` autocompletes from project_members columns
    const builders = rg.policies.membership({
      tables: ['posts'],
      via: 'project_members',
      key: 'project_id',
      operations: ['SELECT'],
    });
    expect(builders).toHaveLength(1);
    expect(builders[0].toSQL()).toContain('"project_id"');
    expect(builders[0].toSQL()).toContain('"project_members"');
  });

  it('tenant — generates restrictive isolation + owner CRUD', () => {
    const builders = rg.policies.tenant({ tables: ['posts'] });
    expect(builders).toHaveLength(5);
    const restrictive = builders.find((b) => b.toDefinition().type === 'RESTRICTIVE')!;
    expect(restrictive.toSQL()).toContain('AS RESTRICTIVE');
  });

  it('role — generates JWT-claim policy', () => {
    const [p] = rg.policies.role({ tables: ['posts'], is: 'admin', operations: ['SELECT'] });
    expect(p.toSQL()).toContain("auth.jwt() ->> 'user_role'");
    expect(p.toSQL()).toContain("'admin'");
  });

  it('immutable — INSERT only by default', () => {
    const builders = rg.policies.immutable({ tables: ['posts'] });
    expect(builders).toHaveLength(1);
    expect(builders[0].toDefinition().operation).toBe('INSERT');
  });

  it('open — SELECT TO public', () => {
    const [p] = rg.policies.open({ tables: ['posts'] });
    expect(p.toSQL()).toContain('TO public');
    expect(p.toSQL()).toContain('USING (true)');
  });

  it('multi-table — produces policies for every table', () => {
    const builders = rg.policies.owned({ tables: ['posts', 'users'] });
    expect(builders).toHaveLength(8); // 4 ops × 2 tables
    const tables = [...new Set(builders.map((b) => b.toDefinition().table))];
    expect(tables).toContain('posts');
    expect(tables).toContain('users');
  });
});

// ─── Compile-time type checks ─────────────────────────────────────────────────
// These tests prove the type constraints are enforced at compile time.
// @ts-expect-error lines must trigger a TypeScript error — if they don't, the test fails.

describe('Type Safety', () => {
  const rg = createRowguard<TestDatabase>();

  it('rejects unknown table names on policy().on()', () => {
    // @ts-expect-error 'nonexistent' is not a valid table name
    rg.policy('test').on('nonexistent');
  });

  it('rejects unknown column names on column()', () => {
    // @ts-expect-error 'nonexistent_col' is not a column of 'posts'
    rg.column('posts', 'nonexistent_col');
  });

  it('rejects unknown tables in owned.tables', () => {
    // @ts-expect-error 'nonexistent' is not a valid table name
    rg.policies.owned({ tables: ['nonexistent'] });
  });

  it('rejects unknown column in userColumn', () => {
    // @ts-expect-error 'not_a_column' is not a column in any table
    rg.policies.owned({ tables: ['posts'], userColumn: 'not_a_column' });
  });

  it('rejects unknown table in membership.via', () => {
    // @ts-expect-error 'nonexistent_table' is not a valid table name
    rg.policies.membership({ tables: ['posts'], via: 'nonexistent_table', key: 'id' });
  });

  it('rejects column not in membership.via table', () => {
    // @ts-expect-error 'email' is a column of 'users', not 'project_members'
    rg.policies.membership({ tables: ['posts'], via: 'project_members', key: 'email' });
  });

  it('accepts valid table names', () => {
    rg.policy('test').on('users');
    rg.policy('test').on('posts');
  });

  it('accepts valid column names', () => {
    rg.column('users', 'id');
    rg.column('users', 'email');
    rg.column('posts', 'user_id');
  });

  it('accepts valid membership config', () => {
    rg.policies.membership({ tables: ['posts'], via: 'project_members', key: 'project_id' });
    rg.policies.membership({ tables: ['posts'], via: 'project_members', key: 'user_id' });
  });
});
