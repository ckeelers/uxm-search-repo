import { NextResponse } from "next/server";
import { prisma } from "@searchexperience/core";

export const dynamic = "force-dynamic";

// Liveness + DB readiness. Always 200 for liveness; `db` field reports the
// database probe so a bad DATABASE_URL is visible without failing the check.
export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }

  return NextResponse.json({
    status: "ok",
    service: "web",
    db,
    ts: new Date().toISOString(),
  });
}
