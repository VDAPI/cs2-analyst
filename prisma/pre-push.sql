-- Runs before `prisma db push` (predev / preworker:parse). Creates indexes
-- that db push would otherwise refuse to add without --accept-data-loss,
-- even when existing rows already satisfy them. Idempotent; a no-op on a
-- fresh database (tables don't exist yet, db push creates them).

-- Audit fix: FACEIT matches are unique per user, not globally.
DO $$
BEGIN
  IF to_regclass('"FaceitMatch"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "FaceitMatch_userId_faceitMatchId_key"
      ON "FaceitMatch" ("userId", "faceitMatchId");
  END IF;
  IF to_regclass('"DemoUpload"') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "DemoUpload_userId_faceitMatchId_key"
      ON "DemoUpload" ("userId", "faceitMatchId");
  END IF;
END $$;

-- S26: Discord columns with unique indexes on User. db push refuses to add a
-- unique constraint to an existing table without --accept-data-loss, so the
-- columns and indexes are created here first (new columns are all NULL).
DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordId" TEXT;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordLinkCode" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User" ("discordId");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_discordLinkCode_key" ON "User" ("discordLinkCode");
  END IF;
END $$;
