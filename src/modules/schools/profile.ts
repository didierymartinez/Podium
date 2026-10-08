import { eq } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, schools } from "@/db/schema";
import { normalizeNit } from "@/lib/nit";
import { normalizeColombianMobile } from "@/lib/phone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/**
 * Perfil de la escuela (ADM-01). Las validaciones cruzadas van en un solo `transform`
 * para que el formulario muestre todos los errores a la vez.
 */
export const schoolProfileSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe el nombre de la escuela").max(80),
    legalName: optionalText(120),
    documentType: z.enum(["NIT", "CC", "CE"]).nullable(),
    documentNumber: optionalText(20),
    phone: optionalText(30),
    contactEmail: optionalText(120),
    city: z.string().trim().min(2, "Escribe la ciudad").max(80),
    address: optionalText(160),
    brandColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Color inválido"),
  })
  .transform((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    const phone = p.phone ? normalizeColombianMobile(p.phone) : null;
    if (p.phone && !phone) issue("phone", "Escribe un celular colombiano válido");

    if (p.contactEmail && !z.email().safeParse(p.contactEmail).success)
      issue("contactEmail", "El email no es válido");

    let documentType = p.documentType;
    let documentNumber = p.documentNumber;
    if (!documentNumber) {
      documentType = null;
    } else if (!documentType) {
      issue("documentType", "Elige el tipo de documento");
    } else if (documentType === "NIT") {
      const nit = normalizeNit(documentNumber);
      if (!nit) issue("documentNumber", "El NIT o su dígito de verificación no es válido");
      documentNumber = nit ?? documentNumber;
    } else {
      documentNumber = documentNumber.replace(/\D/g, "");
      if (documentNumber.length < 5 || documentNumber.length > 12) {
        issue("documentNumber", "El número de documento no es válido");
      }
    }

    return { ...p, phone, documentType, documentNumber };
  });

export type SchoolProfileInput = z.input<typeof schoolProfileSchema>;
export type SchoolProfile = z.output<typeof schoolProfileSchema>;

export async function updateSchoolProfile(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  profile: SchoolProfile,
) {
  await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    await tx.update(schools).set(profile).where(eq(schools.id, ctx.schoolId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "school.profile_updated",
      entity: "school",
      entityId: ctx.schoolId,
      data: profile,
    });
  });
}
