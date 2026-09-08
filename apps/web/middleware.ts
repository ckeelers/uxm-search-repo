import { NextRequest, NextResponse } from "next/server";

// HTTP Basic Auth on /admin/* (plan decision 2). Single implicit operator;
// credentials in ADMIN_USER / ADMIN_PASS, sent over Railway's HTTPS.
export const config = { matcher: ["/admin/:path*"] };

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return new NextResponse("Admin is not configured (ADMIN_USER / ADMIN_PASS).", {
      status: 503,
    });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = atob(encoded).split(":");
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="searchexperience admin"' },
  });
}
