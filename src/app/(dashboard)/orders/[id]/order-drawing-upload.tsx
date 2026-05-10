"use client";

import { Upload } from "lucide-react";
import React, {
  type ChangeEvent,
  type DragEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { uploadOrderDrawingsAction } from "@/app/actions/orders";

type DroppedEntry = {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
};

type DroppedFileEntry = DroppedEntry & {
  file: (success: (file: File) => void, error?: (error: Error) => void) => void;
};

type DroppedDirectoryEntry = DroppedEntry & {
  createReader: () => {
    readEntries: (
      success: (entries: DroppedEntry[]) => void,
      error?: (error: Error) => void,
    ) => void;
  };
};

type DataTransferItemWithEntry = {
  webkitGetAsEntry?: () => DroppedEntry | null;
};

type UploadItem = {
  file: File;
  path: string;
};

function fileRelativePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
}

function readFileEntry(
  entry: DroppedFileEntry,
  parentPath: string,
): Promise<UploadItem> {
  return new Promise((resolve, reject) => {
    entry.file(
      (file) => resolve({ file, path: `${parentPath}${entry.name}` }),
      reject,
    );
  });
}

function readDirectoryEntries(
  entry: DroppedDirectoryEntry,
): Promise<DroppedEntry[]> {
  const reader = entry.createReader();
  const batches: DroppedEntry[] = [];

  return new Promise((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(batches);
          return;
        }
        batches.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function traverseEntry(
  entry: DroppedEntry,
  parentPath = "",
): Promise<UploadItem[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as DroppedFileEntry, parentPath)];
  }
  if (!entry.isDirectory) return [];

  const directory = entry as DroppedDirectoryEntry;
  const children = await readDirectoryEntries(directory);
  const childPath = `${parentPath}${directory.name}/`;
  const nested = await Promise.all(
    children.map((child) => traverseEntry(child, childPath)),
  );
  return nested.flat();
}

async function uploadItems(orderId: string, items: UploadItem[]) {
  const formData = new FormData();
  formData.set("orderId", orderId);
  for (const item of items) {
    formData.append("drawings", item.file, item.path);
  }
  await uploadOrderDrawingsAction(formData);
}

export function OrderDrawingUpload({ orderId }: { orderId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function submit(items: UploadItem[]) {
    if (items.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await uploadItems(orderId, items);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "上传失败");
      }
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    submit(files.map((file) => ({ file, path: fileRelativePath(file) })));
    event.currentTarget.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const entryItems: DroppedEntry[] = [];
    for (const item of Array.from(event.dataTransfer.items)) {
      const entry = (item as DataTransferItemWithEntry).webkitGetAsEntry?.();
      if (entry) entryItems.push(entry);
    }

    if (entryItems.length > 0) {
      const uploads = await Promise.all(
        entryItems.map((entry) => traverseEntry(entry)),
      );
      submit(uploads.flat());
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    submit(files.map((file) => ({ file, path: file.name })));
  }

  return (
    <div
      className={[
        "mt-5 rounded-lg border border-dashed p-4 transition",
        isDragging
          ? "border-slate-500 bg-slate-50"
          : "border-slate-300 bg-white",
      ].join(" ")}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="sr-only"
        name="drawings"
        type="file"
        multiple
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden="true" size={16} />
        {isPending ? "上传中" : "上传图纸"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
