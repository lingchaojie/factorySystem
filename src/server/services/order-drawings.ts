import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

export const MAX_DRAWING_FILES = 200;
export const MAX_DRAWING_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_DRAWING_TOTAL_BYTES = 500 * 1024 * 1024;

type UploadedDrawing = File & {
  webkitRelativePath?: string;
};

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
    throw new Error("图纸路径无效");
  }
  return resolvedTarget;
}

function sanitizePathSegment(segment: string) {
  const cleaned = segment
    .trim()
    .replace(/[<>:"|?*\x00-\x1F]/g, "_")
    .replace(/[\\/]+/g, "_");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("图纸文件名无效");
  }
  return cleaned;
}

function getRawRelativePath(file: UploadedDrawing) {
  const relativePath = file.webkitRelativePath?.trim();
  return relativePath || file.name;
}

function normalizeRelativePath(file: UploadedDrawing) {
  const rawPath = getRawRelativePath(file).trim();
  if (!rawPath || path.isAbsolute(rawPath) || rawPath.includes("..")) {
    throw new Error("图纸文件名无效");
  }

  const segments = rawPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(sanitizePathSegment);
  if (segments.length === 0) {
    throw new Error("图纸文件名无效");
  }
  return segments.join("/");
}

function dedupeRelativePath(relativePath: string, seen: Set<string>) {
  if (!seen.has(relativePath)) {
    seen.add(relativePath);
    return relativePath;
  }

  const directory = path.posix.dirname(relativePath);
  const base = path.posix.basename(relativePath);
  const extension = path.posix.extname(base);
  const stem = extension ? base.slice(0, -extension.length) : base;
  for (let index = 2; index < 1000; index += 1) {
    const nextBase = `${stem}-${index}${extension}`;
    const nextPath = directory === "." ? nextBase : `${directory}/${nextBase}`;
    if (!seen.has(nextPath)) {
      seen.add(nextPath);
      return nextPath;
    }
  }

  throw new Error("重复图纸文件过多");
}

async function normalizeUploads(files: UploadedDrawing[]) {
  const nonEmptyFiles = files.filter((file) => file.size > 0);
  if (nonEmptyFiles.length === 0) {
    throw new Error("请选择要上传的图纸文件");
  }
  if (nonEmptyFiles.length > MAX_DRAWING_FILES) {
    throw new Error(`一次最多上传 ${MAX_DRAWING_FILES} 个图纸文件`);
  }

  let totalBytes = 0;
  const seen = new Set<string>();
  return Promise.all(
    nonEmptyFiles.map(async (file) => {
      if (file.size > MAX_DRAWING_FILE_BYTES) {
        throw new Error("单个图纸文件不能超过 100MB");
      }
      totalBytes += file.size;
      if (totalBytes > MAX_DRAWING_TOTAL_BYTES) {
        throw new Error("图纸文件总大小不能超过 500MB");
      }

      const relativePath = dedupeRelativePath(
        normalizeRelativePath(file),
        seen,
      );
      return {
        file,
        relativePath,
        originalName: path.posix.basename(relativePath),
        bytes: Buffer.from(await file.arrayBuffer()),
      };
    }),
  );
}

export async function replaceOrderDrawings(
  workspaceId: string,
  orderId: string,
  files: UploadedDrawing[],
) {
  await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  const uploads = await normalizeUploads(files);
  const root = getStorageRoot();
  const orderStoredDir = path.posix.join(workspaceId, orderId);
  const targetDir = assertSafeStoredPath(root, orderStoredDir);
  const tempDir = assertSafeStoredPath(
    root,
    path.posix.join(workspaceId, `${orderId}-${randomUUID()}.tmp`),
  );

  await rm(tempDir, { recursive: true, force: true });
  try {
    for (const upload of uploads) {
      const tempFilePath = assertSafeStoredPath(
        tempDir,
        upload.relativePath,
      );
      await mkdir(path.dirname(tempFilePath), { recursive: true });
      await writeFile(tempFilePath, upload.bytes);
    }

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(path.dirname(targetDir), { recursive: true });
    await rename(tempDir, targetDir);

    return prisma.$transaction(async (tx) => {
      await tx.orderDrawing.deleteMany({
        where: { workspaceId, orderId },
      });

      const created = [];
      for (const upload of uploads) {
        created.push(
          await tx.orderDrawing.create({
            data: {
              workspaceId,
              orderId,
              originalName: upload.originalName,
              relativePath: upload.relativePath,
              storedPath: path.posix.join(orderStoredDir, upload.relativePath),
              sizeBytes: upload.file.size,
              mimeType: upload.file.type || null,
            },
          }),
        );
      }
      return created;
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function getOrderDrawingFile(workspaceId: string, drawingId: string) {
  const drawing = await prisma.orderDrawing.findFirstOrThrow({
    where: { id: drawingId, workspaceId },
  });
  const root = getStorageRoot();
  const filePath = assertSafeStoredPath(root, drawing.storedPath);
  const data = await readFile(filePath);
  return { drawing, data };
}
