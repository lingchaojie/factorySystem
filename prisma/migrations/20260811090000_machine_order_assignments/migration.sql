CREATE TABLE "MachineOrderAssignment" (
    "workspaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineOrderAssignment_pkey" PRIMARY KEY ("workspaceId", "machineId", "orderId")
);

INSERT INTO "MachineOrderAssignment" ("workspaceId", "machineId", "orderId")
SELECT "workspaceId", "id", "currentOrderId"
FROM "Machine"
WHERE "currentOrderId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX "MachineOrderAssignment_workspaceId_machineId_idx"
ON "MachineOrderAssignment"("workspaceId", "machineId");

CREATE INDEX "MachineOrderAssignment_workspaceId_orderId_idx"
ON "MachineOrderAssignment"("workspaceId", "orderId");

ALTER TABLE "MachineOrderAssignment"
ADD CONSTRAINT "MachineOrderAssignment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MachineOrderAssignment"
ADD CONSTRAINT "MachineOrderAssignment_workspaceId_machineId_fkey"
FOREIGN KEY ("workspaceId", "machineId") REFERENCES "Machine"("workspaceId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MachineOrderAssignment"
ADD CONSTRAINT "MachineOrderAssignment_workspaceId_orderId_fkey"
FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Machine"
DROP CONSTRAINT "Machine_workspaceId_currentOrderId_fkey";

DROP INDEX "Machine_currentOrderId_idx";

ALTER TABLE "Machine" DROP COLUMN "currentOrderId";
