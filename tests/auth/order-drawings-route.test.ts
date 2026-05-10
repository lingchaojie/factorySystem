import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, drawingsMock } = vi.hoisted(() => ({
  sessionMock: {
    readSessionUser: vi.fn(),
  },
  drawingsMock: {
    getOrderDrawingFile: vi.fn(),
    getOrderDrawingArchive: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => sessionMock);
vi.mock("@/server/services/order-drawings", () => drawingsMock);

describe("order drawing download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated downloads", async () => {
    sessionMock.readSessionUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/order-drawings/[id]/route");

    const response = await GET(
      new Request("http://factory.test/api/order-drawings/drawing-1"),
      { params: Promise.resolve({ id: "drawing-1" }) },
    );

    expect(response.status).toBe(401);
    expect(drawingsMock.getOrderDrawingFile).not.toHaveBeenCalled();
  });

  it("returns drawing bytes for the current workspace", async () => {
    sessionMock.readSessionUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    drawingsMock.getOrderDrawingFile.mockResolvedValue({
      drawing: {
        id: "drawing-1",
        originalName: "fixture.step",
        relativePath: "fixture.step",
        storedPath: "workspace-1/order-1/fixture.step",
        sizeBytes: 5,
        mimeType: "model/step",
        createdAt: new Date(),
      },
      data: Buffer.from("hello"),
    });
    const { GET } = await import("@/app/api/order-drawings/[id]/route");

    const response = await GET(
      new Request("http://factory.test/api/order-drawings/drawing-1"),
      { params: Promise.resolve({ id: "drawing-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("model/step");
    expect(response.headers.get("content-disposition")).toContain(
      "fixture.step",
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
      "hello",
    );
    expect(drawingsMock.getOrderDrawingFile).toHaveBeenCalledWith(
      "workspace-1",
      "drawing-1",
    );
  });

  it("rejects unauthenticated archive downloads", async () => {
    sessionMock.readSessionUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/order-drawings/archive/route");

    const response = await GET(
      new Request(
        "http://factory.test/api/order-drawings/archive?orderId=order-1&prefix=fixture",
      ),
    );

    expect(response.status).toBe(401);
    expect(drawingsMock.getOrderDrawingArchive).not.toHaveBeenCalled();
  });

  it("returns drawing folder archives for the current workspace", async () => {
    sessionMock.readSessionUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    drawingsMock.getOrderDrawingArchive.mockResolvedValue({
      filename: "fixture.zip",
      mimeType: "application/zip",
      data: Buffer.from("zip-bytes"),
    });
    const { GET } = await import("@/app/api/order-drawings/archive/route");

    const response = await GET(
      new Request(
        "http://factory.test/api/order-drawings/archive?orderId=order-1&prefix=fixture",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(
      "fixture.zip",
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
      "zip-bytes",
    );
    expect(drawingsMock.getOrderDrawingArchive).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
      "fixture",
    );
  });
});
