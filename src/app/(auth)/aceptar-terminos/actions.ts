"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { requireUser } from "@/modules/auth/session";
import { recordLegalAcceptance } from "@/modules/auth/users";

export async function acceptLegalAction(
  _prev: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (form.get("accept") !== "on") return { error: "Debes aceptar para continuar." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  await recordLegalAcceptance(db, user.id, ip);
  redirect("/escuelas");
}
