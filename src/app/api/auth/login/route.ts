import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";

function redirectUrl(request: Request, pathname: string) {
  if (process.env.APP_ORIGIN) {
    return new URL(pathname, process.env.APP_ORIGIN);
  }

  return new URL(pathname, request.url);
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
