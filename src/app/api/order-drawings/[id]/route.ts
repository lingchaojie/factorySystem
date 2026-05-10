import { readSessionUser } from "@/lib/session";
import { getOrderDrawingFile } from "@/server/services/order-drawings";

export const runtime = "nodejs";

function contentDisposition(filename: string) {
  const safeName = filename.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await readSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  try {
    const { drawing, data } = await getOrderDrawingFile(user.workspaceId, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": drawing.mimeType || "application/octet-stream",
        "content-length": String(data.byteLength),
        "content-disposition": contentDisposition(drawing.originalName),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
