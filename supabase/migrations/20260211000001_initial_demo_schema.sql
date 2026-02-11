-- Rowguard Demo Schema
-- This migration creates tables for demonstrating RLS policies

-- ============================================================================
-- 1. DOCUMENTS - Basic user ownership pattern
-- ============================================================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE documents IS 'Demo table for basic user ownership RLS patterns';
COMMENT ON COLUMN documents.user_id IS 'Owner of the document - used for RLS policies';

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. POSTS - Public/private content with user_id
-- ============================================================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE posts IS 'Demo table for public/private content patterns';
COMMENT ON COLUMN posts.is_published IS 'When true, post is visible to all users';

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. TENANT_DATA - Multi-tenant isolation
-- ============================================================================
CREATE TABLE tenant_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_data IS 'Demo table for multi-tenant isolation patterns';
COMMENT ON COLUMN tenant_data.tenant_id IS 'Tenant identifier for data isolation';

CREATE INDEX idx_tenant_data_tenant_id ON tenant_data(tenant_id);
ALTER TABLE tenant_data ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. PROJECTS - Project management
-- ============================================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE projects IS 'Demo table for project ownership and membership patterns';
COMMENT ON COLUMN projects.owner_id IS 'Project owner - has full control';
COMMENT ON COLUMN projects.is_public IS 'When true, project is readable by all users';

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. PROJECT_MEMBERS - Many-to-many project membership
-- ============================================================================
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

COMMENT ON TABLE project_members IS 'Demo table for many-to-many membership with roles';
COMMENT ON COLUMN project_members.role IS 'Member role: owner (full access), editor (can modify), viewer (read-only)';

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. USER_ROLES - Role-based access control
-- ============================================================================
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

COMMENT ON TABLE user_roles IS 'Demo table for role-based access control patterns';
COMMENT ON COLUMN user_roles.role IS 'User role: admin (full access), moderator (moderate content), user (normal access)';

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. ORGANIZATIONS - Organization structure
-- ============================================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Demo table for organization-based access patterns';
COMMENT ON COLUMN organizations.slug IS 'URL-friendly identifier';

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. ORGANIZATION_MEMBERS - Organization membership
-- ============================================================================
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

COMMENT ON TABLE organization_members IS 'Demo table for organization membership patterns';
COMMENT ON COLUMN organization_members.role IS 'Organization role: owner (full control), admin (manage members), member (basic access)';

CREATE INDEX idx_organization_members_organization_id ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
