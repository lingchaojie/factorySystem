-- Replace old open/closed order statuses with the CNC workflow statuses.
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
UPDATE "Order"
SET "status" = CASE
  WHEN "status" = 'closed' THEN 'completed'
  ELSE 'development_pending'
END;
DROP TYPE "OrderStatus";
CREATE TYPE "OrderStatus" AS ENUM (
  'development_pending',
  'processing_pending',
  'in_progress',
  'completed'
);
ALTER TABLE "Order"
ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'development_pending';

-- Planned quantity is optional for early-stage orders.
ALTER TABLE "Order" ALTER COLUMN "plannedQuantity" DROP NOT NULL;

-- The app has not been put into production, so old combined records are
-- intentionally discarded and the table is reshaped to one type/quantity row.
TRUNCATE TABLE "ProductionRecord";
CREATE TYPE "ProductionRecordType" AS ENUM ('completed', 'shipped');
ALTER TABLE "ProductionRecord" DROP COLUMN "completedQuantity";
ALTER TABLE "ProductionRecord" DROP COLUMN "shippedQuantity";
ALTER TABLE "ProductionRecord" ADD COLUMN "type" "ProductionRecordType" NOT NULL;
ALTER TABLE "ProductionRecord" ADD COLUMN "quantity" INTEGER NOT NULL;
CREATE INDEX "ProductionRecord_workspaceId_type_idx" ON "ProductionRecord"("workspaceId", "type");
