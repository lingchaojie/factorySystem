import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";

function getStorageRoot() {
  return path.resolve(
    process.env.ORDER_DRAWING_STORAGE_DIR ??
      path.join(process.cwd(), "storage", "order-drawings"),
  );
}

function assertSafeStoredPath(root: string, storedPath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(root, storedPath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Unsafe drawing path: ${storedPath}`);
  }
  return resolvedTarget;
}

function placeholderBytes(drawing: {
  originalName: string;
  relativePath: string;
  storedPath: string;
  order: {
    customerName: string;
    partName: string;
  };
}) {
  return [
    "Local placeholder drawing file",
    "Generated because local database metadata exists but the original uploaded file is missing on this machine.",
    `Order: ${drawing.order.customerName} / ${drawing.order.partName}`,
    `Original name: ${drawing.originalName}`,
    `Relative path: ${drawing.relativePath}`,
    `Stored path: ${drawing.storedPath}`,
    "",
  ].join("\n");
}

async function main() {
  const root = getStorageRoot();
  const drawings = await prisma.orderDrawing.findMany({
    include: {
      order: {
        select: {
          customerName: true,
          partName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let existing = 0;
  let repaired = 0;

  for (const drawing of drawings) {
    const filePath = assertSafeStoredPath(root, drawing.storedPath);
    try {
      await access(filePath);
      existing += 1;
      continue;
    } catch {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, placeholderBytes(drawing));
      repaired += 1;
    }
  }

  console.log(`Missing drawing files repaired: ${repaired}`);
  console.log(`Existing drawing files kept: ${existing}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
