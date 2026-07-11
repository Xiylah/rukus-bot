-- Grant Supabase's API roles access to the `rukus` schema.
--
-- Why this is needed: Prisma created the `rukus` schema directly over Postgres,
-- outside Supabase's UI. Exposing the schema in Settings → API tells PostgREST
-- to ROUTE requests there, but the API roles still have no Postgres privileges
-- on it - hence "permission denied for schema rukus". These grants close that
-- gap. (Supabase does this automatically for schemas it creates itself.)
--
-- Safe to re-run. Touches ONLY the `rukus` schema - never `public`, so the
-- Roblox game's tables are unaffected.
--
-- `service_role` is what the dashboard uses (server-side, after Discord OAuth).
-- `anon` / `authenticated` are granted USAGE only, so nothing is readable from
-- the browser without the service key.

-- Let the API roles see the schema.
GRANT USAGE ON SCHEMA rukus TO service_role, anon, authenticated;

-- Full table access for the server-side dashboard role.
GRANT ALL ON ALL TABLES IN SCHEMA rukus TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rukus TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA rukus TO service_role;

-- Apply the same to any tables Prisma creates in the future.
ALTER DEFAULT PRIVILEGES IN SCHEMA rukus
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rukus
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rukus
  GRANT ALL ON FUNCTIONS TO service_role;

-- Ask PostgREST to reload its schema cache so the change takes effect at once.
NOTIFY pgrst, 'reload schema';
