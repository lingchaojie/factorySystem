import { readSessionUser } from "@/lib/session";
import { getOrderDrawingArchive } from "@/server/services/order-drawings";

export const runtime = "nodejs";

function contentDisposition(filename: string) {
  const safeName = filename.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request) {
  const user = await readSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const prefix = url.searchParams.get("prefix");
  if (!orderId) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const archive = await getOrderDrawingArchive(
      user.workspaceId,
      orderId,
      prefix,
    );
    return new Response(new Uint8Array(archive.data), {
      headers: {
        "content-type": archive.mimeType,
        "content-length": String(archive.data.byteLength),
        "content-disposition": contentDisposition(archive.filename),
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
