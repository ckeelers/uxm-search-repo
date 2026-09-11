"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, Platform, MatchOutcome, Track } from "@searchexperience/core";

function revalidate() {
  revalidatePath("/admin/companies");
  revalidatePath("/admin/review");
  revalidatePath("/admin/rejected");
  revalidatePath("/");
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const PLATFORMS = new Set(Object.values(Platform));

/** Send the admin back to the companies page with a banner instead of crashing. */
function failCompanies(message: string): never {
  redirect(`/admin/companies?error=${encodeURIComponent(message)}`);
}

export async function upsertCompany(form: FormData): Promise<void> {
  const slug = str(form, "slug").toLowerCase();
  const name = str(form, "name");
  const platform = str(form, "platform");
  const platformId = str(form, "platformId");
  const careersUrl = str(form, "careersUrl");

  if (!slug || !name || !PLATFORMS.has(platform as Platform)) {
    failCompanies("Slug, name, and a valid platform are required.");
  }

  let failed = false;
  try {
    // keyed by slug, not an id field the "Add a company" form never sends —
    // re-submitting the same slug updates that row instead of crashing on
    // the unique-constraint violation a plain create() would throw.
    await prisma.company.upsert({
      where: { slug },
      create: {
        slug,
        name,
        platform: platform as Platform,
        platformId: platformId || null,
        careersUrl: careersUrl || `https://example.com/${slug}`,
      },
      update: {
        name,
        platform: platform as Platform,
        platformId: platformId || null,
      },
    });
  } catch (e) {
    console.error("[admin] upsertCompany failed:", e);
    failed = true;
  }
  if (failed) {
    failCompanies("Could not save that company — check the values and try again.");
  }
  revalidate();
}

export async function toggleCompanyFlag(form: FormData): Promise<void> {
  const id = str(form, "id");
  const flag = str(form, "flag");
  if (!id || (flag !== "active" && flag !== "excluded")) {
    failCompanies("Bad toggle request.");
  }
  try {
    const company = await prisma.company.findUniqueOrThrow({ where: { id } });
    await prisma.company.update({
      where: { id },
      data: { [flag]: !company[flag] },
    });
  } catch (e) {
    console.error("[admin] toggleCompanyFlag failed:", e);
    failCompanies("That company could not be found — it may have been deleted.");
  }
  revalidate();
}

export async function deleteCompany(form: FormData): Promise<void> {
  const id = str(form, "id");
  if (!id) failCompanies("id required");
  try {
    // jobs reference the company (onDelete: Restrict) — clear them first.
    await prisma.job.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
  } catch (e) {
    console.error("[admin] deleteCompany failed:", e);
    failCompanies("Could not delete that company.");
  }
  revalidate();
}

/** Pull a wrongly-rejected job back into the review queue. */
export async function reopenToReview(form: FormData): Promise<void> {
  const jobId = str(form, "jobId");
  if (!jobId) throw new Error("jobId required");
  await prisma.job.update({
    where: { id: jobId },
    data: { matchOutcome: MatchOutcome.REVIEW_QUEUE, matchReason: "admin-reopened" },
  });
  revalidate();
}

export async function reviewDecision(form: FormData): Promise<void> {
  const jobId = str(form, "jobId");
  const decision = str(form, "decision"); // "approve" | "reject"
  if (!jobId) throw new Error("jobId required");

  if (decision === "reject") {
    await prisma.job.update({
      where: { id: jobId },
      data: { matchOutcome: MatchOutcome.REJECTED, matchReason: "admin-reject", track: null },
    });
  } else if (decision === "approve") {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        matchOutcome: MatchOutcome.STAGE2_INCLUDE,
        matchReason: "admin-approve",
        track: Track.UX_DESIGN_MGR,
      },
    });
  } else {
    throw new Error("bad decision");
  }
  revalidate();
}
