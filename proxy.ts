import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/auth-config";

const clerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Routes authorize browser sessions or the scoped integration token themselves.
  if (request.nextUrl.pathname === "/api/platform-pilot/findings") return NextResponse.next();
  if (!isClerkConfigured()) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
