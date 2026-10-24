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

-- Friends, billing and team invites: unique columns added to existing tables
-- (User, Team). Same reason as above: db push would stop on an upgraded
-- database with the data-loss prompt, so create them here (all NULL).
DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "friendCode" TEXT;
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "User_friendCode_key" ON "User" ("friendCode");
    CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User" ("stripeCustomerId");
  END IF;
  IF to_regclass('"Team"') IS NOT NULL THEN
    ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "Team_inviteCode_key" ON "Team" ("inviteCode");
  END IF;
END $$;
