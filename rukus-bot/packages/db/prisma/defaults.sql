-- Add DATABASE-level defaults for columns Prisma only defaults CLIENT-side.
--
-- Prisma applies @default(cuid()) and @updatedAt inside its own client. Any
-- other writer - here, the dashboard going through Supabase/PostgREST - must
-- supply those columns itself, or Postgres rejects the row:
--   null value in column "updatedAt" of relation "Guild" violates not-null...
--
-- Giving the columns real DB defaults makes the schema correct for ANY client,
-- so this can't bite again. Safe to re-run; touches only the `rukus` schema.

-- Timestamps: default to now() on insert.
ALTER TABLE rukus."Guild"          ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE rukus."Guild"          ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE rukus."FeatureConfig"  ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE rukus."FeatureConfig"  ALTER COLUMN "createdAt" SET DEFAULT now();

-- Ids: Prisma generates cuids client-side. gen_random_uuid() is a fine
-- server-side stand-in for any writer that doesn't supply one.
ALTER TABLE rukus."FeatureConfig"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE rukus."Ticket"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE rukus."FormSubmission"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- Keep updatedAt fresh on UPDATE too (Prisma does this client-side only).
CREATE OR REPLACE FUNCTION rukus.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guild_set_updated_at ON rukus."Guild";
CREATE TRIGGER guild_set_updated_at
  BEFORE UPDATE ON rukus."Guild"
  FOR EACH ROW EXECUTE FUNCTION rukus.set_updated_at();

DROP TRIGGER IF EXISTS featureconfig_set_updated_at ON rukus."FeatureConfig";
CREATE TRIGGER featureconfig_set_updated_at
  BEFORE UPDATE ON rukus."FeatureConfig"
  FOR EACH ROW EXECUTE FUNCTION rukus.set_updated_at();

-- ---------------------------------------------------------------------------
-- Everything above names tables one by one, which silently goes stale the
-- moment a model is added (and the failure only shows up as a NOT NULL error
-- at runtime, from the dashboard, in production).
--
-- This block instead DISCOVERS the columns: for every table in `rukus`, give
-- any id/createdAt/updatedAt column a real database default and attach the
-- updatedAt trigger. Correct for the 10 tables just added, and for whatever
-- gets added next. Safe to re-run. Touches only `rukus`, never `public`.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t   record;
  col record;
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rukus' AND c.relkind = 'r'
  LOOP
    -- Text primary keys that Prisma fills with a client-side cuid().
    FOR col IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'rukus'
        AND table_name = t.table_name
        AND column_name = 'id'
        AND data_type = 'text'
        AND column_default IS NULL
    LOOP
      EXECUTE format(
        'ALTER TABLE rukus.%I ALTER COLUMN %I SET DEFAULT gen_random_uuid()::text',
        t.table_name, col.column_name);
    END LOOP;

    -- Timestamps Prisma stamps client-side (@default(now()) / @updatedAt).
    FOR col IN
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'rukus'
        AND table_name = t.table_name
        AND column_name IN ('createdAt', 'updatedAt')
        AND column_default IS NULL
    LOOP
      EXECUTE format(
        'ALTER TABLE rukus.%I ALTER COLUMN %I SET DEFAULT now()',
        t.table_name, col.column_name);
    END LOOP;

    -- Keep updatedAt fresh on UPDATE, for tables that have one.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'rukus'
        AND table_name = t.table_name
        AND column_name = 'updatedAt'
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON rukus.%I',
        lower(t.table_name) || '_set_updated_at', t.table_name);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON rukus.%I
           FOR EACH ROW EXECUTE FUNCTION rukus.set_updated_at()',
        lower(t.table_name) || '_set_updated_at', t.table_name);
    END IF;
  END LOOP;
END $$;

-- Re-grant: ALTER DEFAULT PRIVILEGES in grants.sql only covers tables created
-- AFTER it ran, so tables added since then need an explicit grant or the
-- dashboard gets "permission denied".
GRANT ALL ON ALL TABLES IN SCHEMA rukus TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rukus TO service_role;

NOTIFY pgrst, 'reload schema';
