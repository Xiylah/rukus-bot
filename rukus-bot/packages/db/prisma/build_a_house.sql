BEGIN;

CREATE TABLE IF NOT EXISTS rukus."BuildAHouseStats" (
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" VARCHAR(18),
  "fortniteDisplayName" VARCHAR(64) NOT NULL,
  "collection" INTEGER NOT NULL CHECK ("collection" >= 0),
  "homeValue" BIGINT NOT NULL CHECK ("homeValue" >= 0),
  "playtimeSeconds" BIGINT NOT NULL CHECK ("playtimeSeconds" >= 0),
  "goldBalance" BIGINT NOT NULL DEFAULT 0 CHECK ("goldBalance" >= 0),
  "capturedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildAHouseStats_pkey" PRIMARY KEY ("guildId", "userId")
);

ALTER TABLE rukus."BuildAHouseStats" ADD COLUMN IF NOT EXISTS "cardId" VARCHAR(18);
ALTER TABLE rukus."BuildAHouseStats" ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3);
ALTER TABLE rukus."BuildAHouseStats" ADD COLUMN IF NOT EXISTS "goldBalance" BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'rukus' AND table_name = 'BuildAHouseStats' AND column_name = 'totalMoneyEarned') THEN
    ALTER TABLE rukus."BuildAHouseStats" ALTER COLUMN "totalMoneyEarned" SET DEFAULT 0;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_cardId_key" ON rukus."BuildAHouseStats" ("guildId", "cardId");
CREATE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_collection_userId_idx" ON rukus."BuildAHouseStats" ("guildId", "collection" DESC, "userId");
CREATE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_homeValue_userId_idx" ON rukus."BuildAHouseStats" ("guildId", "homeValue" DESC, "userId");
CREATE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_playtimeSeconds_userId_idx" ON rukus."BuildAHouseStats" ("guildId", "playtimeSeconds" DESC, "userId");
CREATE INDEX IF NOT EXISTS "BuildAHouseStats_guildId_goldBalance_userId_idx" ON rukus."BuildAHouseStats" ("guildId", "goldBalance" DESC, "userId");

COMMIT;
