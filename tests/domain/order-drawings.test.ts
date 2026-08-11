import { describe, expect, it } from "vitest";
import { getOrderDrawingPreviewMimeType } from "@/domain/order-drawings";

describe("order drawing image classification", () => {
  it.each([
    ["part.JPG", "image/jpeg", "image/jpeg"],
    ["part.jpeg", null, "image/jpeg"],
    ["part.png", "image/png", "image/png"],
    ["part.webp", "image/webp", "image/webp"],
    ["part.gif", "image/gif", "image/gif"],
  ])("allows safe raster image %s", (name, stored, expected) => {
    expect(getOrderDrawingPreviewMimeType(name, stored)).toBe(expected);
  });

  it.each([
    ["drawing.svg", "image/svg+xml"],
    ["drawing.pdf", "application/pdf"],
    ["drawing.step", "model/step"],
    ["fake.png", "text/html"],
    ["no-extension", "image/png"],
  ])("rejects non-previewable or mismatched file %s", (name, stored) => {
    expect(getOrderDrawingPreviewMimeType(name, stored)).toBeNull();
  });
});
