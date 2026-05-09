import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";

function redirectUrl(request: Request, pathname: string) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (host) url.host = host;
  if (forwardedProto) url.protocol = `${forwardedProto}:`;

  return new URL(pathname, url);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await loginWithPassword(username, password);
  if (!user) {
    return NextResponse.redirect(redirectUrl(request, "/login?error=1"), 303);
  }

  return NextResponse.redirect(redirectUrl(request, "/machines"), 303);
}
