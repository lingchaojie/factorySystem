import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { OrderDrawingGallery } from "@/app/(dashboard)/orders/[id]/order-drawing-gallery";

const drawings = [
  {
    id: "jpg-1",
    originalName: "a.jpg",
    relativePath: "a.jpg",
    sizeBytes: 2048,
    mimeType: "image/jpeg",
  },
  {
    id: "png-1",
    originalName: "b.png",
    relativePath: "folder/b.png",
    sizeBytes: 3072,
    mimeType: "image/png",
  },
  {
    id: "step-1",
    originalName: "model.step",
    relativePath: "folder/model.step",
    sizeBytes: 4096,
    mimeType: "model/step",
  },
];

describe("order drawing gallery", () => {
  it("previews all order images in stable path order and preserves downloads", () => {
    render(<OrderDrawingGallery orderId="order-1" drawings={drawings} />);

    expect(screen.getByRole("link", { name: "下载全部图纸" })).toHaveAttribute(
      "href",
      "/api/order-drawings/archive?orderId=order-1",
    );
    expect(screen.getByRole("link", { name: "folder" })).toHaveAttribute(
      "href",
      "/api/order-drawings/archive?orderId=order-1&prefix=folder",
    );
    expect(screen.getByRole("link", { name: "model.step" })).toHaveAttribute(
      "href",
      "/api/order-drawings/step-1",
    );
    expect(screen.getByRole("link", { name: "下载 a.jpg" })).toHaveAttribute(
      "href",
      "/api/order-drawings/jpg-1",
    );
    expect(screen.getByRole("link", { name: "下载 b.png" })).toHaveAttribute(
      "href",
      "/api/order-drawings/png-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "预览 b.png" }));
    expect(
      screen.getByRole("dialog", { name: "预览 b.png" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "b.png" })).toHaveAttribute(
      "src",
      expect.stringContaining("/api/order-drawings/png-1?preview=1"),
    );
    expect(screen.getByText("第 2 张 / 共 2 张")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "上一张" }));
    expect(screen.getByRole("img", { name: "a.jpg" })).toBeInTheDocument();
    expect(screen.getByText("第 1 张 / 共 2 张")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
  });

  it("supports keyboard navigation, backdrop close, scroll lock, and focus restoration", async () => {
    render(<OrderDrawingGallery orderId="order-1" drawings={drawings} />);
    const openButton = screen.getByRole("button", { name: "预览 a.jpg" });

    fireEvent.click(openButton);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("img", { name: "b.png" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("img", { name: "a.jpg" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    await waitFor(() => expect(openButton).toHaveFocus());

    fireEvent.click(openButton);
    const dialog = screen.getByRole("dialog", { name: "预览 a.jpg" });
    fireEvent.mouseDown(within(dialog).getByRole("img", { name: "a.jpg" }));
    expect(dialog).toBeInTheDocument();
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(openButton).toHaveFocus());
  });

  it("shows a download fallback when an image cannot load", () => {
    render(<OrderDrawingGallery orderId="order-1" drawings={drawings} />);
    fireEvent.click(screen.getByRole("button", { name: "预览 b.png" }));
    const dialog = screen.getByRole("dialog", { name: "预览 b.png" });

    fireEvent.error(within(dialog).getByRole("img", { name: "b.png" }));

    expect(within(dialog).getByText("图片加载失败")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "下载 b.png" })).toHaveAttribute(
      "href",
      "/api/order-drawings/png-1",
    );
  });
});
