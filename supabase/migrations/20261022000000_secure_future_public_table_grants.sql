
-- VANT: Review future default privileges for public-schema tables.
--
-- PURPOSE:
-- Prevent future public tables created by the postgres role from
-- automatically receiving broad Data API privileges.
--
-- SAFETY:
-- This changes default privileges for FUTURE objects only.
-- It does not revoke grants from existing tables.
-- It does not replace row-level security (RLS).
--
-- Before applying:
-- 1. Verify that postgres is the role used to create future tables.
-- 2. Review every future table migration and explicitly grant only
--    the privileges required by its intended API roles.
-- 3. Verify server-side service-role access and sequence requirements.
-- 4. Test in a non-production environment first.

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL ON TABLES
FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL ON SEQUENCES
FROM anon, authenticated, service_role;
