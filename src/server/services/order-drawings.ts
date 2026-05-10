import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OrderDrawing } from "@prisma/client";
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

function normalizeArchivePrefix(prefix: string | null | undefined) {
  if (!prefix?.trim()) return "";
  const rawPath = prefix.trim();
  if (path.isAbsolute(rawPath) || rawPath.includes("..")) {
    throw new Error("图纸目录无效");
  }
  const segments = rawPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(sanitizePathSegment);
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
      await tx.order.updateMany({
        where: { id: orderId, workspaceId, status: "development_pending" },
        data: { status: "processing_pending", closedAt: null },
      });
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

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function zipEntryName(name: string) {
  return Buffer.from(name.replace(/\\/g, "/"), "utf8");
}

function buildStoredZip(
  entries: Array<{ name: string; data: Buffer; date: Date }>,
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = zipEntryName(entry.name);
    const checksum = crc32(entry.data);
    const { time, date } = dosDateTime(entry.date);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.byteLength, 18);
    localHeader.writeUInt32LE(entry.data.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.byteLength, 20);
    centralHeader.writeUInt32LE(entry.data.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.byteLength + name.byteLength + entry.data.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function archiveFilename(prefix: string) {
  const name = prefix ? path.posix.basename(prefix) : "order-drawings";
  return `${sanitizePathSegment(name)}.zip`;
}

function isInArchivePrefix(drawing: OrderDrawing, prefix: string) {
  if (!prefix) return true;
  return drawing.relativePath.startsWith(`${prefix}/`);
}

export async function getOrderDrawingArchive(
  workspaceId: string,
  orderId: string,
  prefix: string | null | undefined = "",
) {
  await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  const normalizedPrefix = normalizeArchivePrefix(prefix);
  const drawings = (
    await prisma.orderDrawing.findMany({
      where: { workspaceId, orderId },
      orderBy: { relativePath: "asc" },
    })
  ).filter((drawing) => isInArchivePrefix(drawing, normalizedPrefix));

  if (drawings.length === 0) {
    throw new Error("图纸文件不存在");
  }

  const root = getStorageRoot();
  const entries = await Promise.all(
    drawings.map(async (drawing) => ({
      name: drawing.relativePath,
      data: await readFile(assertSafeStoredPath(root, drawing.storedPath)),
      date: drawing.createdAt,
    })),
  );

  return {
    filename: archiveFilename(normalizedPrefix),
    mimeType: "application/zip",
    data: buildStoredZip(entries),
  };
}
