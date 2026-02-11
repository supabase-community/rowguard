-- Rowguard Demo Seed Data
-- Creates test users and sample data for all demo tables

-- ============================================================================
-- TEST USERS
-- ============================================================================
-- Note: Using fixed UUIDs for predictable testing
-- Passwords are all 'password123' (hashed)

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'alice@example.com',
    '$2a$10$vZ3qT9Y5KH6KH5kH5kH5ku8H5kH5kH5kH5kH5kH5kH5kH5kH5kH5k',
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Alice"}',
    FALSE,
    'authenticated'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'bob@example.com',
    '$2a$10$vZ3qT9Y5KH6KH5kH5kH5ku8H5kH5kH5kH5kH5kH5kH5kH5kH5kH5k',
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Bob"}',
    FALSE,
    'authenticated'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000000',
    'charlie@example.com',
    '$2a$10$vZ3qT9Y5KH6KH5kH5kH5ku8H5kH5kH5kH5kH5kH5kH5kH5kH5kH5k',
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Charlie"}',
    FALSE,
    'authenticated'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '00000000-0000-0000-0000-000000000000',
    'diana@example.com',
    '$2a$10$vZ3qT9Y5KH6KH5kH5kH5ku8H5kH5kH5kH5kH5kH5kH5kH5kH5kH5k',
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Diana"}',
    FALSE,
    'authenticated'
  );

-- Also create identities for these users
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"alice@example.com"}',
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"bob@example.com"}',
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    '{"sub":"33333333-3333-3333-3333-333333333333","email":"charlie@example.com"}',
    'email',
    NOW(),
    NOW(),
    NOW()
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '44444444-4444-4444-4444-444444444444',
    '44444444-4444-4444-4444-444444444444',
    '{"sub":"44444444-4444-4444-4444-444444444444","email":"diana@example.com"}',
    'email',
    NOW(),
    NOW(),
    NOW()
  );

-- ============================================================================
-- DOCUMENTS - Alice has 2, Bob has 2, Charlie has 1
-- ============================================================================
INSERT INTO documents (user_id, title, content) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice''s Meeting Notes', 'Notes from the team meeting on Monday'),
  ('11111111-1111-1111-1111-111111111111', 'Alice''s Project Ideas', 'Brainstorming for next quarter'),
  ('22222222-2222-2222-2222-222222222222', 'Bob''s Technical Spec', 'Architecture documentation for the new API'),
  ('22222222-2222-2222-2222-222222222222', 'Bob''s Code Review Notes', 'PR feedback and suggestions'),
  ('33333333-3333-3333-3333-333333333333', 'Charlie''s Research', 'Market research findings');

-- ============================================================================
-- POSTS - Mix of published and unpublished
-- ============================================================================
INSERT INTO posts (user_id, title, content, is_published) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Welcome to the Platform', 'This is Alice''s first public post', TRUE),
  ('11111111-1111-1111-1111-111111111111', 'Draft: Future Plans', 'Work in progress...', FALSE),
  ('22222222-2222-2222-2222-222222222222', 'Getting Started Guide', 'Bob''s guide for new users', TRUE),
  ('22222222-2222-2222-2222-222222222222', 'Internal Notes', 'Private notes not for publication', FALSE),
  ('33333333-3333-3333-3333-333333333333', 'Charlie''s Blog Post', 'Public thoughts on technology', TRUE);

-- ============================================================================
-- TENANT_DATA - Data for two different tenants
-- ============================================================================
INSERT INTO tenant_data (tenant_id, user_id, data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '{"type":"config","settings":{"theme":"dark"}}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '{"type":"config","settings":{"theme":"light"}}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', '{"type":"analytics","views":1234}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '{"type":"analytics","views":5678}');

-- ============================================================================
-- PROJECTS - Public and private projects
-- ============================================================================
INSERT INTO projects (id, name, description, owner_id, is_public) VALUES
  ('eeeeeeee-1111-1111-1111-111111111111', 'Website Redesign', 'Redesigning the company website', '11111111-1111-1111-1111-111111111111', FALSE),
  ('eeeeeeee-2222-2222-2222-222222222222', 'Open Source Library', 'Public open source project', '22222222-2222-2222-2222-222222222222', TRUE),
  ('eeeeeeee-3333-3333-3333-333333333333', 'Internal Tools', 'Tools for team use only', '33333333-3333-3333-3333-333333333333', FALSE);

-- ============================================================================
-- PROJECT_MEMBERS - Team members on various projects
-- ============================================================================
INSERT INTO project_members (project_id, user_id, role) VALUES
  -- Website Redesign team (Alice's project)
  ('eeeeeeee-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('eeeeeeee-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('eeeeeeee-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'viewer'),
  -- Open Source Library (Bob's project)
  ('eeeeeeee-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('eeeeeeee-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'editor'),
  -- Internal Tools (Charlie's project)
  ('eeeeeeee-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'owner'),
  ('eeeeeeee-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'editor');

-- ============================================================================
-- USER_ROLES - Role assignments
-- ============================================================================
INSERT INTO user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'moderator'),
  ('33333333-3333-3333-3333-333333333333', 'user'),
  ('44444444-4444-4444-4444-444444444444', 'user');

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
INSERT INTO organizations (id, name, slug, owner_id) VALUES
  ('ffff1111-1111-1111-1111-111111111111', 'Acme Corporation', 'acme', '11111111-1111-1111-1111-111111111111'),
  ('ffff2222-2222-2222-2222-222222222222', 'Tech Startup Inc', 'tech-startup', '22222222-2222-2222-2222-222222222222');

-- ============================================================================
-- ORGANIZATION_MEMBERS
-- ============================================================================
INSERT INTO organization_members (organization_id, user_id, role) VALUES
  -- Acme Corporation
  ('ffff1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('ffff1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('ffff1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'member'),
  -- Tech Startup Inc
  ('ffff2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('ffff2222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'admin');
