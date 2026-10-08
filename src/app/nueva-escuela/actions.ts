"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { createSchool, createSchoolSchema } from "@/modules/schools/create-school";
import { isSlugAvailable } from "@/modules/schools/queries";
import { SLUG_ERROR_MESSAGES, validateSlug } from "@/modules/schools/slug";

export type CreateSchoolState = {
  errors?: Partial<Record<"name" | "slug" | "city" | "discipline" | "estimatedStudents", string[]>>;
  values?: Record<string, string>;
};

export async function createSchoolAction(
  _prev: CreateSchoolState,
  formData: FormData,
): Promise<CreateSchoolState> {
  const user = await requireVerifiedUser();
  const values = Object.fromEntries(
    ["name", "slug", "city", "discipline", "estimatedStudents"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );

  const parsed = createSchoolSchema.safeParse(values);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };

  const result = await createSchool(db, user.id, parsed.data);
  if (!result.ok) {
    return { errors: { slug: ["Esa URL ya está en uso, elige otra"] }, values };
  }
  redirect(`/${result.slug}`);
}

export async function checkSlugAction(slug: string): Promise<{ available: boolean; message?: string }> {
  await requireVerifiedUser();
  const error = validateSlug(slug);
  if (error) return { available: false, message: SLUG_ERROR_MESSAGES[error] };
  const available = await isSlugAvailable(db, slug);
  return available ? { available } : { available, message: "Esa URL ya está en uso" };
}
