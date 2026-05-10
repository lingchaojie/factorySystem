-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('active', 'idle', 'maintenance', 'disabled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "location" TEXT,
    "status" "MachineStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "currentOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "orderNo" TEXT,
    "partName" TEXT NOT NULL,
    "plannedQuantity" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "completedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shippedQuantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_username_key" ON "User"("workspaceId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Machine_workspaceId_idx" ON "Machine"("workspaceId");

-- CreateIndex
CREATE INDEX "Machine_workspaceId_status_idx" ON "Machine"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Machine_currentOrderId_idx" ON "Machine"("currentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_workspaceId_code_key" ON "Machine"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_workspaceId_id_key" ON "Machine"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Order_workspaceId_idx" ON "Order"("workspaceId");

-- CreateIndex
CREATE INDEX "Order_workspaceId_status_idx" ON "Order"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Order_workspaceId_customerName_idx" ON "Order"("workspaceId", "customerName");

-- CreateIndex
CREATE INDEX "Order_workspaceId_dueDate_idx" ON "Order"("workspaceId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Order_workspaceId_id_key" ON "Order"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ProductionRecord_workspaceId_recordedAt_idx" ON "ProductionRecord"("workspaceId", "recordedAt");

-- CreateIndex
CREATE INDEX "ProductionRecord_workspaceId_machineId_idx" ON "ProductionRecord"("workspaceId", "machineId");

-- CreateIndex
CREATE INDEX "ProductionRecord_workspaceId_orderId_idx" ON "ProductionRecord"("workspaceId", "orderId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workspaceId_currentOrderId_fkey" FOREIGN KEY ("workspaceId", "currentOrderId") REFERENCES "Order"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_workspaceId_machineId_fkey" FOREIGN KEY ("workspaceId", "machineId") REFERENCES "Machine"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_workspaceId_orderId_fkey" FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
