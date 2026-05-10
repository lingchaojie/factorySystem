ALTER TABLE "Order"
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "updatedByUserId" TEXT;

CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");
CREATE INDEX "Order_updatedByUserId_idx" ON "Order"("updatedByUserId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
