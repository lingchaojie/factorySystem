-- Add order pricing.
ALTER TABLE "Order" ADD COLUMN "unitPriceCents" INTEGER;

-- Existing MVP orders allowed an empty order number. Backfill before making the
-- field required and unique per workspace.
UPDATE "Order"
SET "orderNo" = 'LEGACY-' || left("id", 12)
WHERE "orderNo" IS NULL OR btrim("orderNo") = '';

ALTER TABLE "Order" ALTER COLUMN "orderNo" SET NOT NULL;

CREATE UNIQUE INDEX "Order_workspaceId_orderNo_key" ON "Order"("workspaceId", "orderNo");

-- Store uploaded drawing metadata; file bytes live in the configured storage
-- directory and are resolved through storedPath.
CREATE TABLE "OrderDrawing" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "storedPath" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderDrawing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderDrawing_workspaceId_id_key" ON "OrderDrawing"("workspaceId", "id");
CREATE INDEX "OrderDrawing_workspaceId_orderId_idx" ON "OrderDrawing"("workspaceId", "orderId");

ALTER TABLE "OrderDrawing"
ADD CONSTRAINT "OrderDrawing_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderDrawing"
ADD CONSTRAINT "OrderDrawing_workspaceId_orderId_fkey"
FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
