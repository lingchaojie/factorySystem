CREATE TYPE "UserRole" AS ENUM ('manager', 'employee');

ALTER TABLE "User"
ADD COLUMN "displayName" TEXT,
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'manager';

UPDATE "User"
SET "displayName" = "username"
WHERE "displayName" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "displayName" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_username_key" ON "PlatformAdmin"("username");

CREATE TABLE "PlatformAdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdminSession_tokenHash_key" ON "PlatformAdminSession"("tokenHash");
CREATE INDEX "PlatformAdminSession_adminId_idx" ON "PlatformAdminSession"("adminId");
CREATE INDEX "PlatformAdminSession_expiresAt_idx" ON "PlatformAdminSession"("expiresAt");

ALTER TABLE "PlatformAdminSession"
ADD CONSTRAINT "PlatformAdminSession_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionRecord"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "updatedByUserId" TEXT;

CREATE INDEX "ProductionRecord_createdByUserId_idx" ON "ProductionRecord"("createdByUserId");
CREATE INDEX "ProductionRecord_updatedByUserId_idx" ON "ProductionRecord"("updatedByUserId");

ALTER TABLE "ProductionRecord"
ADD CONSTRAINT "ProductionRecord_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionRecord"
ADD CONSTRAINT "ProductionRecord_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
