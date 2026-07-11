-- Add DATABASE-level defaults for columns Prisma only defaults CLIENT-side.
--
-- Prisma applies @default(cuid()) and @updatedAt inside its own client. Any
-- other writer — here, the dashboard going through Supabase/PostgREST — must
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

NOTIFY pgrst, 'reload schema';
