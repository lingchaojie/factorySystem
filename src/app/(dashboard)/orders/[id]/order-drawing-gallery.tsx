"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  Folder,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOrderDrawingPreviewMimeType } from "@/domain/order-drawings";

export type DrawingGalleryItem = {
  id: string;
  originalName: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string | null;
};

type DrawingFolder = {
  name: string;
  path: string;
  folders: Map<string, DrawingFolder>;
  files: DrawingGalleryItem[];
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createFolder(name: string, path: string): DrawingFolder {
  return { name, path, folders: new Map(), files: [] };
}

function buildDrawingTree(drawings: DrawingGalleryItem[]) {
  const root = createFolder("", "");
  for (const drawing of drawings) {
    const parts = drawing.relativePath.split("/").filter(Boolean);
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const childPath = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.get(part);
      if (!child) {
        child = createFolder(part, childPath);
        folder.folders.set(part, child);
      }
      folder = child;
    }
    folder.files.push(drawing);
  }
  return root;
}

function archiveHref(orderId: string, prefix = "") {
  const params = new URLSearchParams({ orderId });
  if (prefix) params.set("prefix", prefix);
  return `/api/order-drawings/archive?${params.toString()}`;
}

function sortFolders(folders: Iterable<DrawingFolder>) {
  return Array.from(folders).sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN"),
  );
}

function sortFiles(files: DrawingGalleryItem[]) {
  return [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "zh-CN"),
  );
}

function DrawingTree({
  folder,
  orderId,
  previewIndexes,
  onOpenPreview,
  depth = 0,
}: {
  folder: DrawingFolder;
  orderId: string;
  previewIndexes: Map<string, number>;
  onOpenPreview: (
    index: number,
    returnFocusElement: HTMLButtonElement,
  ) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "mt-4 space-y-1" : "mt-1 space-y-1"}>
      {sortFolders(folder.folders.values()).map((child) => (
        <li key={child.path}>
          <div
            className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
            style={{ paddingLeft: depth * 18 + 8 }}
          >
            <Link
              href={archiveHref(orderId, child.path)}
              className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-950 underline-offset-4 hover:underline"
            >
              <Folder aria-hidden="true" size={16} />
              <span className="truncate">{child.name}</span>
            </Link>
          </div>
          <DrawingTree
            folder={child}
            orderId={orderId}
            previewIndexes={previewIndexes}
            onOpenPreview={onOpenPreview}
            depth={depth + 1}
          />
        </li>
      ))}
      {sortFiles(folder.files).map((drawing) => {
        const previewIndex = previewIndexes.get(drawing.id);
        const previewable = previewIndex !== undefined;

        return (
          <li key={drawing.id}>
            <div
              className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
              style={{ paddingLeft: depth * 18 + 8 }}
            >
              {previewable ? (
                <button
                  type="button"
                  aria-label={`预览 ${drawing.originalName}`}
                  className="inline-flex min-w-0 items-center gap-2 text-left text-slate-950 underline-offset-4 hover:underline"
                  onClick={(event) =>
                    onOpenPreview(previewIndex, event.currentTarget)
                  }
                >
                  <FileImage aria-hidden="true" size={16} />
                  <span className="truncate">{drawing.originalName}</span>
                </button>
              ) : (
                <Link
                  href={`/api/order-drawings/${drawing.id}`}
                  className="inline-flex min-w-0 items-center gap-2 text-slate-950 underline-offset-4 hover:underline"
                >
                  <FileText aria-hidden="true" size={16} />
                  <span className="truncate">{drawing.originalName}</span>
                </Link>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-500">
                  {formatFileSize(drawing.sizeBytes)}
                </span>
                {previewable ? (
                  <Link
                    href={`/api/order-drawings/${drawing.id}`}
                    aria-label={`下载 ${drawing.originalName}`}
                    title={`下载 ${drawing.originalName}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <Download aria-hidden="true" size={15} />
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OrderDrawingGallery({
  orderId,
  drawings,
}: {
  orderId: string;
  drawings: DrawingGalleryItem[];
}) {
  const previewableDrawings = useMemo(
    () =>
      [...drawings]
        .filter((drawing) =>
          Boolean(
            getOrderDrawingPreviewMimeType(
              drawing.originalName,
              drawing.mimeType,
            ),
          ),
        )
        .sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath, "zh-CN"),
        ),
    [drawings],
  );
  const previewIndexes = useMemo(
    () =>
      new Map(
        previewableDrawings.map((drawing, index) => [drawing.id, index]),
      ),
    [previewableDrawings],
  );
  const drawingTree = useMemo(() => buildDrawingTree(drawings), [drawings]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const previewOpen = activeIndex !== null;
  const activeDrawing =
    activeIndex === null ? null : previewableDrawings[activeIndex];

  const closePreview = useCallback(() => {
    setActiveIndex(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, []);

  const showPrevious = useCallback(() => {
    setImageFailed(false);
    setActiveIndex((current) => {
      if (current === null || current <= 0) return current;
      return current - 1;
    });
  }, []);

  const showNext = useCallback(() => {
    setImageFailed(false);
    setActiveIndex((current) => {
      if (current === null || current >= previewableDrawings.length - 1) {
        return current;
      }
      return current + 1;
    });
  }, [previewableDrawings.length]);

  useEffect(() => {
    if (!previewOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
      if (event.key === "ArrowLeft") showPrevious();
      if (event.key === "ArrowRight") showNext();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closePreview, previewOpen, showNext, showPrevious]);

  function openPreview(index: number, returnFocusElement: HTMLButtonElement) {
    returnFocusRef.current = returnFocusElement;
    setImageFailed(false);
    setActiveIndex(index);
  }

  return (
    <>
      <Link
        href={archiveHref(orderId)}
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <Archive aria-hidden="true" size={16} />
        下载全部图纸
      </Link>
      <DrawingTree
        folder={drawingTree}
        orderId={orderId}
        previewIndexes={previewIndexes}
        onOpenPreview={openPreview}
      />

      {activeDrawing && activeIndex !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`预览 ${activeDrawing.originalName}`}
          className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 text-white">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {activeDrawing.originalName}
              </p>
              <p aria-live="polite" className="text-xs text-slate-300">
                第 {activeIndex + 1} 张 / 共 {previewableDrawings.length} 张
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭预览"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
              onClick={closePreview}
            >
              <X aria-hidden="true" size={22} />
            </button>
          </div>

          <div className="relative mx-auto mt-4 min-h-0 w-full max-w-7xl flex-1 overflow-hidden rounded-lg bg-black/30">
            {imageFailed ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white">
                <p className="font-medium">图片加载失败</p>
                <Link
                  href={`/api/order-drawings/${activeDrawing.id}`}
                  aria-label={`下载 ${activeDrawing.originalName}`}
                  className="inline-flex items-center gap-2 rounded-md border border-white/30 px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  <Download aria-hidden="true" size={16} />
                  下载原图
                </Link>
              </div>
            ) : (
              <Image
                key={activeDrawing.id}
                src={`/api/order-drawings/${activeDrawing.id}?preview=1`}
                alt={activeDrawing.originalName}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
                onError={() => setImageFailed(true)}
              />
            )}
          </div>

          <div className="mx-auto mt-4 flex w-full max-w-7xl items-center justify-center gap-3">
            <button
              type="button"
              aria-label="上一张"
              disabled={activeIndex === 0}
              className="inline-flex items-center gap-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300"
              onClick={showPrevious}
            >
              <ChevronLeft aria-hidden="true" size={18} />
              上一张
            </button>
            <button
              type="button"
              aria-label="下一张"
              disabled={activeIndex === previewableDrawings.length - 1}
              className="inline-flex items-center gap-1 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:text-slate-300"
              onClick={showNext}
            >
              下一张
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
