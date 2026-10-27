-- Add assigned work items only; do not seed or update existing business rows.
CREATE TYPE "WorkItemStatus" AS ENUM ('pending', 'completed');
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "WorkItemStatus" NOT NULL DEFAULT 'pending',
    "assigneeUserId" TEXT,
    "createdByUserId" TEXT,
    "orderId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "requestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkItem_workspaceId_requestId_key" ON "WorkItem"("workspaceId", "requestId");
CREATE INDEX "WorkItem_workspaceId_assigneeUserId_status_idx" ON "WorkItem"("workspaceId", "assigneeUserId", "status");
CREATE INDEX "WorkItem_workspaceId_status_dueDate_idx" ON "WorkItem"("workspaceId", "status", "dueDate");
CREATE INDEX "WorkItem_orderId_idx" ON "WorkItem"("orderId");
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
