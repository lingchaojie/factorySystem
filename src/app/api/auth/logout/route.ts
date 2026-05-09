import { NextResponse } from "next/server";
import { destroyCurrentSession, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(sessionCookieName);
  return response;
}
