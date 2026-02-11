import { describe, it, expect } from 'vitest';
import { createRowguard } from '../src/typed';

// Mock Database type for testing
type TestDatabase = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          age: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          age: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          age?: number;
          created_at?: string;
        };
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          published: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          published?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          published?: boolean;
        };
      };
    };
  };
};

describe('Typed Rowguard', () => {
  const rg = createRowguard<TestDatabase>();

  it('generates SQL with typed columns', () => {
    const policy = rg
      .policy('user_posts')
      .on('posts')
      .read()
      .when(rg.column('posts', 'user_id').eq(rg.auth.uid()));

    const sql = policy.toSQL();
    expect(sql).toContain('CREATE POLICY user_posts');
    expect(sql).toContain('ON posts');
    expect(sql).toContain('posts.user_id');
  });

  it('supports string equality', () => {
    const policy = rg
      .policy('email_check')
      .on('users')
      .read()
      .when(rg.column('users', 'email').eq('test@example.com'));

    const sql = policy.toSQL();
    expect(sql).toContain("users.email = 'test@example.com'");
  });

  it('supports numeric comparisons', () => {
    const policy = rg
      .policy('age_check')
      .on('users')
      .read()
      .when(rg.column('users', 'age').gt(18));

    const sql = policy.toSQL();
    expect(sql).toContain('users.age > 18');
  });

  it('supports boolean equality', () => {
    const policy = rg
      .policy('published_posts')
      .on('posts')
      .read()
      .when(rg.column('posts', 'published').eq(true));

    const sql = policy.toSQL();
    expect(sql).toContain('posts.published = TRUE');
  });

  it('supports chaining with and/or', () => {
    const policy = rg
      .policy('complex')
      .on('posts')
      .read()
      .when(
        rg
          .column('posts', 'user_id')
          .eq(rg.auth.uid())
          .or(rg.column('posts', 'published').eq(true))
      );

    const sql = policy.toSQL();
    expect(sql).toContain('posts.user_id');
    expect(sql).toContain('OR');
    expect(sql).toContain('posts.published');
  });

  it('supports null checks', () => {
    const policy = rg
      .policy('not_deleted')
      .on('posts')
      .read()
      .when(rg.column('posts', 'user_id').isNotNull());

    const sql = policy.toSQL();
    expect(sql).toContain('posts.user_id IS NOT NULL');
  });

  it('supports isOwner helper', () => {
    const policy = rg
      .policy('owner_check')
      .on('posts')
      .read()
      .when(rg.column('posts', 'user_id').isOwner());

    const sql = policy.toSQL();
    expect(sql).toContain('posts.user_id = auth.uid()');
  });

  it('supports isPublic helper', () => {
    const policy = rg
      .policy('public_check')
      .on('posts')
      .read()
      .when(rg.column('posts', 'published').isPublic());

    const sql = policy.toSQL();
    expect(sql).toContain('posts.published = TRUE');
  });

  it('supports IN operator with array', () => {
    const policy = rg
      .policy('status_check')
      .on('posts')
      .read()
      .when(rg.column('posts', 'title').in(['Draft', 'Published']));

    const sql = policy.toSQL();
    expect(sql).toContain('posts.title IN');
    expect(sql).toContain("'Draft'");
    expect(sql).toContain("'Published'");
  });

  it('supports LIKE pattern matching', () => {
    const policy = rg
      .policy('pattern_check')
      .on('users')
      .read()
      .when(rg.column('users', 'email').like('%@example.com'));

    const sql = policy.toSQL();
    expect(sql).toContain("users.email LIKE '%@example.com'");
  });

  it('supports ILIKE pattern matching', () => {
    const policy = rg
      .policy('case_insensitive')
      .on('users')
      .read()
      .when(rg.column('users', 'email').ilike('%@EXAMPLE.COM'));

    const sql = policy.toSQL();
    expect(sql).toContain("users.email ILIKE '%@EXAMPLE.COM'");
  });

  it('supports multiple comparison operators', () => {
    const policy = rg
      .policy('age_range')
      .on('users')
      .read()
      .when(
        rg.column('users', 'age').gte(18).and(rg.column('users', 'age').lte(65))
      );

    const sql = policy.toSQL();
    expect(sql).toContain('users.age >= 18');
    expect(sql).toContain('AND');
    expect(sql).toContain('users.age <= 65');
  });

  it('supports session variables with belongsToTenant', () => {
    const policy = rg
      .policy('tenant_isolation')
      .on('posts')
      .all()
      .requireAll()
      .when(rg.column('posts', 'user_id').belongsToTenant());

    const sql = policy.toSQL();
    expect(sql).toContain('RESTRICTIVE');
    expect(sql).toContain('posts.user_id');
    expect(sql).toContain(
      "current_setting('app.current_tenant_id', true)::INTEGER"
    );
  });

  it('generates policy with both USING and WITH CHECK', () => {
    const policy = rg
      .policy('update_own')
      .on('posts')
      .update()
      .when(rg.column('posts', 'user_id').isOwner())
      .withCheck(rg.column('posts', 'user_id').isOwner());

    const sql = policy.toSQL();
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('USING');
    expect(sql).toContain('WITH CHECK');
  });

  it('uses allow() method to set appropriate clauses', () => {
    const readPolicy = rg
      .policy('read_posts')
      .on('posts')
      .read()
      .allow(rg.column('posts', 'published').eq(true));

    const readSQL = readPolicy.toSQL();
    expect(readSQL).toContain('USING');
    expect(readSQL).not.toContain('WITH CHECK');

    const insertPolicy = rg
      .policy('insert_posts')
      .on('posts')
      .write()
      .allow(rg.column('posts', 'user_id').isOwner());

    const insertSQL = insertPolicy.toSQL();
    expect(insertSQL).toContain('WITH CHECK');
    expect(insertSQL).not.toContain('USING');

    const updatePolicy = rg
      .policy('update_posts')
      .on('posts')
      .update()
      .allow(rg.column('posts', 'user_id').isOwner());

    const updateSQL = updatePolicy.toSQL();
    expect(updateSQL).toContain('USING');
    expect(updateSQL).toContain('WITH CHECK');
  });
});

// Type-level tests (these will fail compilation if types are wrong)
describe('Type Safety', () => {
  it('should allow valid table names', () => {
    const rg = createRowguard<TestDatabase>();
    // These should compile without errors
    rg.policy('test').on('users');
    rg.policy('test').on('posts');
  });

  it('should allow valid column names for table', () => {
    const rg = createRowguard<TestDatabase>();
    // These should compile without errors
    rg.column('users', 'id');
    rg.column('users', 'email');
    rg.column('users', 'age');
    rg.column('posts', 'title');
  });

  it('should validate value types', () => {
    const rg = createRowguard<TestDatabase>();
    // String column accepts string
    rg.column('users', 'email').eq('test@example.com');
    // Number column accepts number
    rg.column('users', 'age').eq(25);
    // Boolean column accepts boolean
    rg.column('posts', 'published').eq(true);
  });
});
