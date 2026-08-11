import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

function migrationDatabaseUrl(schema: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function executeSqlScript(client: PrismaClient, sql: string) {
  for (const statement of sql.split(";").map((part) => part.trim())) {
    if (statement) await client.$executeRawUnsafe(statement);
  }
}

describe("machine order assignment migration", () => {
  it("backfills current machine orders before dropping the old field", async () => {
    const schema = `machine_order_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migrationPrisma = new PrismaClient({
      datasources: { db: { url: migrationDatabaseUrl(schema) } },
    });

    try {
      await executeSqlScript(
        migrationPrisma,
        `
          CREATE TABLE "Workspace" (
            "id" TEXT NOT NULL,
            CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
          );
          CREATE TABLE "Order" (
            "id" TEXT NOT NULL,
            "workspaceId" TEXT NOT NULL,
            CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
          );
          CREATE UNIQUE INDEX "Order_workspaceId_id_key"
            ON "Order"("workspaceId", "id");
          CREATE TABLE "Machine" (
            "id" TEXT NOT NULL,
            "workspaceId" TEXT NOT NULL,
            "currentOrderId" TEXT,
            CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
          );
          CREATE UNIQUE INDEX "Machine_workspaceId_id_key"
            ON "Machine"("workspaceId", "id");
          CREATE INDEX "Machine_currentOrderId_idx"
            ON "Machine"("currentOrderId");
          ALTER TABLE "Machine"
            ADD CONSTRAINT "Machine_workspaceId_currentOrderId_fkey"
            FOREIGN KEY ("workspaceId", "currentOrderId")
            REFERENCES "Order"("workspaceId", "id")
            ON DELETE NO ACTION ON UPDATE CASCADE;
          CREATE TABLE "ProductionRecord" (
            "id" TEXT NOT NULL,
            "marker" TEXT NOT NULL,
            CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
          );
          INSERT INTO "Workspace" ("id") VALUES ('workspace-1');
          INSERT INTO "Order" ("id", "workspaceId")
            VALUES ('order-1', 'workspace-1');
          INSERT INTO "Machine" ("id", "workspaceId", "currentOrderId")
            VALUES ('machine-1', 'workspace-1', 'order-1');
          INSERT INTO "ProductionRecord" ("id", "marker")
            VALUES ('record-1', 'keep-me');
        `,
      );

      const migration = await readFile(
        "prisma/migrations/20260811090000_machine_order_assignments/migration.sql",
        "utf8",
      );
      await executeSqlScript(migrationPrisma, migration);

      const assignments = await migrationPrisma.$queryRawUnsafe<
        Array<{ workspaceId: string; machineId: string; orderId: string }>
      >(
        `SELECT "workspaceId", "machineId", "orderId" FROM "MachineOrderAssignment"`,
      );
      const currentOrderColumns = await migrationPrisma.$queryRawUnsafe<
        Array<{ column_name: string }>
      >(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Machine' AND column_name = 'currentOrderId'`,
        schema,
      );
      const productionRecords = await migrationPrisma.$queryRawUnsafe<
        Array<{ id: string; marker: string }>
      >(`SELECT "id", "marker" FROM "ProductionRecord"`);

      expect(assignments).toEqual([
        {
          workspaceId: "workspace-1",
          machineId: "machine-1",
          orderId: "order-1",
        },
      ]);
      expect(currentOrderColumns).toEqual([]);
      expect(productionRecords).toEqual([
        { id: "record-1", marker: "keep-me" },
      ]);
    } finally {
      await migrationPrisma.$disconnect();
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  });
});
