BEGIN;
ALTER TABLE rukus."BuildAHouseStats" ADD COLUMN IF NOT EXISTS "houseLikes" BIGINT CHECK ("houseLikes" >= 0);
ALTER TABLE rukus."BuildAHouseStats" ALTER COLUMN "playtimeSeconds" SET DEFAULT 0;
CREATE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_houseLikes_userId_idx" ON rukus."BuildAHouseStats" ("guildId", "houseLikes" DESC, "userId");
COMMIT;
