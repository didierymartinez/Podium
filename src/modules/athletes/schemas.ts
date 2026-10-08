import { z } from "zod";
import { normalizeColombianMobile } from "@/lib/phone";

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `Escribe ${label}`)
    .max(60)
    .transform((v) => v.replace(/\s+/g, " "));

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const PERSON_DOCUMENT_TYPES = ["RC", "TI", "CC", "CE", "PPT", "PASSPORT"] as const;
export const DOCUMENT_TYPE_LABELS: Record<(typeof PERSON_DOCUMENT_TYPES)[number], string> = {
  RC: "Registro civil",
  TI: "Tarjeta de identidad",
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  PPT: "Permiso de protección temporal",
  PASSPORT: "Pasaporte",
};

export const RELATIONSHIPS = ["MOTHER", "FATHER", "GUARDIAN", "OTHER"] as const;
export const RELATIONSHIP_LABELS: Record<(typeof RELATIONSHIPS)[number], string> = {
  MOTHER: "Madre",
  FATHER: "Padre",
  GUARDIAN: "Tutor(a)",
  OTHER: "Otro",
};

export const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

/** Tipo + número de documento opcionales y normalizados (RC/TI/CC solo dígitos). */
function withDocument<T extends { documentType: string | null; documentNumber: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
): T {
  if (!value.documentNumber) return { ...value, documentType: null, documentNumber: null };
  if (!value.documentType) {
    ctx.addIssue({ code: "custom", path: ["documentType"], message: "Elige el tipo de documento" });
    return value;
  }
  const numeric = ["RC", "TI", "CC"].includes(value.documentType);
  const documentNumber = numeric
    ? value.documentNumber.replace(/\D/g, "")
    : value.documentNumber.replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (documentNumber.length < 4 || documentNumber.length > 15) {
    ctx.addIssue({
      code: "custom",
      path: ["documentNumber"],
      message: "El número de documento no es válido",
    });
  }
  return { ...value, documentNumber };
}

function mobile(value: string | null, path: string, ctx: z.RefinementCtx, required = false) {
  if (!value) {
    if (required) ctx.addIssue({ code: "custom", path: [path], message: "Escribe el celular" });
    return null;
  }
  const phone = normalizeColombianMobile(value);
  if (!phone) ctx.addIssue({ code: "custom", path: [path], message: "Escribe un celular colombiano válido" });
  return phone;
}

export const athleteSchema = z
  .object({
    firstName: name("los nombres"),
    lastName: name("los apellidos"),
    documentType: z.enum(PERSON_DOCUMENT_TYPES).nullable(),
    documentNumber: optional(20),
    birthDate: z.iso.date("Escribe la fecha de nacimiento"),
    sex: z.enum(["F", "M"]).nullable(),
    phone: optional(30),
    email: optional(120),
    healthInsurer: optional(60),
    bloodType: z.enum(BLOOD_TYPES).nullable(),
    medicalNotes: optional(1000),
    emergencyContactName: optional(80),
    emergencyContactPhone: optional(30),
    schoolName: optional(80),
    notes: optional(1000),
  })
  .transform((value, ctx) => {
    const withDoc = withDocument(value, ctx);
    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "El email no es válido" });
    }
    if (value.birthDate > new Date().toISOString().slice(0, 10) || value.birthDate < "1920-01-01") {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "La fecha de nacimiento no es válida" });
    }
    return {
      ...withDoc,
      phone: mobile(value.phone, "phone", ctx),
      emergencyContactPhone: mobile(value.emergencyContactPhone, "emergencyContactPhone", ctx),
    };
  });

export type AthleteInput = z.output<typeof athleteSchema>;

export const guardianSchema = z
  .object({
    firstName: name("los nombres"),
    lastName: name("los apellidos"),
    documentType: z.enum(PERSON_DOCUMENT_TYPES).nullable(),
    documentNumber: optional(20),
    phone: optional(30),
    email: optional(120),
  })
  .transform((value, ctx) => {
    const withDoc = withDocument(value, ctx);
    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "El email no es válido" });
    }
    return { ...withDoc, phone: mobile(value.phone, "phone", ctx, true) as string };
  });

export type GuardianInput = z.output<typeof guardianSchema>;

export const enrollmentInputSchema = z.object({
  groupId: z.uuid("Elige el grupo"),
  feePlanId: z.uuid("Elige la tarifa"),
  startDate: z.iso.date("Escribe la fecha de inicio"),
  status: z.enum(["ACTIVE", "PRE_ENROLLED"]),
  allowOverCapacity: z.boolean().default(false),
});

export type EnrollmentInput = z.input<typeof enrollmentInputSchema>;
