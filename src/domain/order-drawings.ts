const previewMimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function getOrderDrawingPreviewMimeType(
  originalName: string,
  storedMimeType: string | null,
) {
  const dotIndex = originalName.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const expected = previewMimeTypes[extension];
  if (!expected) return null;

  const normalizedStored = storedMimeType?.split(";")[0].trim().toLowerCase();
  if (normalizedStored && normalizedStored !== expected) return null;
  return expected;
}
