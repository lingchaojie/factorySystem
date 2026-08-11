import { readSessionUser } from "@/lib/session";
import { getOrderDrawingFile } from "@/server/services/order-drawings";
import { getOrderDrawingPreviewMimeType } from "@/domain/order-drawings";

export const runtime = "nodejs";

function contentDisposition(filename: string, mode: "inline" | "attachment") {
  const safeName = filename.replace(/["\\\r\n]/g, "_");
  return `${mode}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  try {
    const { drawing, data } = await getOrderDrawingFile(user.workspaceId, id);
    const previewRequested =
      new URL(request.url).searchParams.get("preview") === "1";
    const previewMimeType = getOrderDrawingPreviewMimeType(
      drawing.originalName,
      drawing.mimeType,
    );
    if (previewRequested && !previewMimeType) {
      return new Response("Unsupported Media Type", { status: 415 });
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": previewRequested
          ? previewMimeType!
          : drawing.mimeType || "application/octet-stream",
        "content-length": String(data.byteLength),
        "content-disposition": contentDisposition(
          drawing.originalName,
          previewRequested ? "inline" : "attachment",
        ),
        ...(previewRequested
          ? {
              "cache-control": "private, max-age=3600",
              "x-content-type-options": "nosniff",
            }
          : {}),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
