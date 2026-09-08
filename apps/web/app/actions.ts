"use server";

import { revalidatePath } from "next/cache";
import { prisma, SavedStatus } from "@searchexperience/core";
import { OWNER_ID } from "../lib/owner";

function jobId(form: FormData): string {
  const id = form.get("jobId");
  if (typeof id !== "string" || !id) throw new Error("jobId required");
  return id;
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/saved");
}

export async function saveJob(form: FormData): Promise<void> {
  const id = jobId(form);
  await prisma.savedJob.upsert({
    where: { jobId_userId: { jobId: id, userId: OWNER_ID } },
    create: { jobId: id, userId: OWNER_ID },
    update: {}, // already saved — no-op
  });
  revalidate();
}

export async function removeSaved(form: FormData): Promise<void> {
  await prisma.savedJob.deleteMany({
    where: { jobId: jobId(form), userId: OWNER_ID },
  });
  revalidate();
}

export async function setSavedStatus(form: FormData): Promise<void> {
  const status = form.get("status");
  if (status !== SavedStatus.SAVED && status !== SavedStatus.APPLIED) {
    throw new Error("bad status");
  }
  await prisma.savedJob.updateMany({
    where: { jobId: jobId(form), userId: OWNER_ID },
    data: { status },
  });
  revalidate();
}

export async function setSavedNotes(form: FormData): Promise<void> {
  const notes = (form.get("notes") ?? "").toString().slice(0, 2000);
  await prisma.savedJob.updateMany({
    where: { jobId: jobId(form), userId: OWNER_ID },
    data: { notes: notes || null },
  });
  revalidate();
}
