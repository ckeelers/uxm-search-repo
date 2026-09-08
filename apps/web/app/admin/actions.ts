"use server";

import { revalidatePath } from "next/cache";
import { prisma, Platform, MatchOutcome, Track } from "@searchexperience/core";

function revalidate() {
  revalidatePath("/admin/companies");
  revalidatePath("/admin/review");
  revalidatePath("/");
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const PLATFORMS = new Set(Object.values(Platform));

export async function upsertCompany(form: FormData): Promise<void> {
  const id = str(form, "id");
  const slug = str(form, "slug").toLowerCase();
  const name = str(form, "name");
  const platform = str(form, "platform");
  const platformId = str(form, "platformId");
  const careersUrl = str(form, "careersUrl");

  if (!slug || !name || !PLATFORMS.has(platform as Platform)) {
    throw new Error("slug, name and a valid platform are required");
  }

  const data = {
    slug,
    name,
    platform: platform as Platform,
    platformId: platformId || null,
    careersUrl: careersUrl || `https://example.com/${slug}`,
  };

  if (id) {
    await prisma.company.update({ where: { id }, data });
  } else {
    await prisma.company.create({ data });
  }
  revalidate();
}

export async function toggleCompanyFlag(form: FormData): Promise<void> {
  const id = str(form, "id");
  const flag = str(form, "flag");
  if (!id || (flag !== "active" && flag !== "excluded")) {
    throw new Error("bad toggle");
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { id } });
  await prisma.company.update({
    where: { id },
    data: { [flag]: !company[flag] },
  });
  revalidate();
}

export async function deleteCompany(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (!id) throw new Error("id required");
  // jobs reference the company (onDelete: Restrict) — clear them first.
  await prisma.job.deleteMany({ where: { companyId: id } });
  await prisma.company.delete({ where: { id } });
  revalidate();
}

export async function reviewDecision(form: FormData): Promise<void> {
  const jobId = str(form, "jobId");
  const decision = str(form, "decision"); // "design" | "research" | "reject"
  if (!jobId) throw new Error("jobId required");

  if (decision === "reject") {
    await prisma.job.update({
      where: { id: jobId },
      data: { matchOutcome: MatchOutcome.REJECTED, matchReason: "admin-reject", track: null },
    });
  } else if (decision === "design" || decision === "research") {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        matchOutcome: MatchOutcome.STAGE2_INCLUDE,
        matchReason: "admin-approve",
        track:
          decision === "research" ? Track.UX_RESEARCH_MGR : Track.UX_DESIGN_MGR,
      },
    });
  } else {
    throw new Error("bad decision");
  }
  revalidate();
}
