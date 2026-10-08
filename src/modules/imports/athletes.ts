import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database, type Tx } from "@/db/rls";
import { athletes, auditLogs, enrollments, feePlans, groups, guardians } from "@/db/schema";
import { CURRENT_STATUSES, ADULT_AGE, ageOn } from "@/modules/athletes/enrollment-status";
import { ATHLETE_ERROR_MESSAGES, AthleteDomainError, createAthleteTx } from "@/modules/athletes/athletes";
import {
  DOCUMENT_TYPE_LABELS,
  PERSON_DOCUMENT_TYPES,
  RELATIONSHIP_LABELS,
  RELATIONSHIPS,
  athleteSchema,
  guardianSchema,
  type AthleteInput,
  type GuardianInput,
} from "@/modules/athletes/schemas";
import { chargePreviousBalanceTx } from "@/modules/billing/invoices";
import type { BillingPolicy } from "@/modules/billing/policy";
import type { Sheet } from "@/lib/xlsx";

/** Importación de alumnos y acudientes desde Excel (#23). */

type ColumnKey =
  | "firstName"
  | "lastName"
  | "documentType"
  | "documentNumber"
  | "birthDate"
  | "sex"
  | "healthInsurer"
  | "bloodType"
  | "schoolName"
  | "guardianFirstName"
  | "guardianLastName"
  | "relationship"
  | "guardianPhone"
  | "guardianEmail"
  | "guardianDocumentType"
  | "guardianDocumentNumber"
  | "group"
  | "feePlan"
  | "startDate"
  | "discount"
  | "balance";

type Column = { key: ColumnKey; header: string; example: string; help: string; required?: boolean };

export const IMPORT_COLUMNS: Column[] = [
  { key: "firstName", header: "Nombres", example: "Sofía", help: "Obligatorio", required: true },
  { key: "lastName", header: "Apellidos", example: "Restrepo Gómez", help: "Obligatorio", required: true },
  {
    key: "documentType",
    header: "Tipo de documento",
    example: "TI",
    help: "RC, TI, CC, CE, PPT o Pasaporte",
  },
  { key: "documentNumber", header: "Número de documento", example: "1020304050", help: "Opcional" },
  {
    key: "birthDate",
    header: "Fecha de nacimiento",
    example: "2015-03-14",
    help: "Obligatorio. AAAA-MM-DD o DD/MM/AAAA",
    required: true,
  },
  { key: "sex", header: "Sexo", example: "F", help: "F o M" },
  { key: "healthInsurer", header: "EPS", example: "Sura", help: "Opcional" },
  { key: "bloodType", header: "Tipo de sangre", example: "O+", help: "O+, O-, A+, A-, B+, B-, AB+, AB-" },
  { key: "schoolName", header: "Colegio", example: "Colegio San José", help: "Opcional" },
  {
    key: "guardianFirstName",
    header: "Nombres del acudiente",
    example: "Laura",
    help: "Obligatorio para menores de edad",
  },
  { key: "guardianLastName", header: "Apellidos del acudiente", example: "Gómez", help: "Con el nombre" },
  { key: "relationship", header: "Parentesco", example: "Madre", help: "Madre, Padre, Tutor u Otro" },
  {
    key: "guardianPhone",
    header: "Celular del acudiente",
    example: "300 123 4567",
    help: "Celular colombiano. Hermanos: el mismo celular",
  },
  { key: "guardianEmail", header: "Email del acudiente", example: "laura@correo.com", help: "Opcional" },
  { key: "guardianDocumentType", header: "Tipo de documento del acudiente", example: "CC", help: "Opcional" },
  { key: "guardianDocumentNumber", header: "Documento del acudiente", example: "43123456", help: "Opcional" },
  {
    key: "group",
    header: "Grupo",
    example: "Iniciación",
    help: "Nombre exacto del grupo. Vacío: sin matrícula",
  },
  { key: "feePlan", header: "Tarifa", example: "", help: "Vacío: la tarifa del grupo" },
  { key: "startDate", header: "Fecha de inicio", example: "", help: "Vacío: hoy" },
  {
    key: "discount",
    header: "Descuento %",
    example: "10",
    help: "Descuento particular sobre la mensualidad",
  },
  { key: "balance", header: "Saldo pendiente", example: "120000", help: "Lo que debía antes de Podium" },
];

export const MAX_IMPORT_ROWS = 1000;

/** Minúsculas, sin tildes ni signos: "Celular del acudiente*" → "celulardelacudiente". */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, ColumnKey> = {
  nombre: "firstName",
  nombredelalumno: "firstName",
  nombresdelalumno: "firstName",
  apellido: "lastName",
  apellidosdelalumno: "lastName",
  documento: "documentNumber",
  numerodedocumento: "documentNumber",
  nacimiento: "birthDate",
  fechanacimiento: "birthDate",
  rh: "bloodType",
  acudiente: "guardianFirstName",
  celular: "guardianPhone",
  telefonodelacudiente: "guardianPhone",
  celularacudiente: "guardianPhone",
  email: "guardianEmail",
  correo: "guardianEmail",
  correodelacudiente: "guardianEmail",
  plan: "feePlan",
  descuento: "discount",
  saldo: "balance",
  saldoanterior: "balance",
  deuda: "balance",
};
for (const c of IMPORT_COLUMNS) ALIASES[normalize(c.header)] = c.key;

const DOCUMENT_ALIASES: Record<string, (typeof PERSON_DOCUMENT_TYPES)[number]> = {
  pasaporte: "PASSPORT",
  ...Object.fromEntries(PERSON_DOCUMENT_TYPES.map((t) => [normalize(t), t])),
  ...Object.fromEntries(Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => [normalize(v), k])),
};
const RELATIONSHIP_ALIASES: Record<string, (typeof RELATIONSHIPS)[number]> = {
  mama: "MOTHER",
  papa: "FATHER",
  tutor: "GUARDIAN",
  tutora: "GUARDIAN",
  acudiente: "GUARDIAN",
  ...Object.fromEntries(Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => [normalize(v), k])),
  ...Object.fromEntries(RELATIONSHIPS.map((r) => [normalize(r), r])),
};

/** Fecha en "AAAA-MM-DD", "DD/MM/AAAA" o "DD-MM-AAAA"; texto vacío si no se reconoce. */
export function parseDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = v.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return v;
}

/** "$ 120.000", "120000", "120,000.50" → pesos enteros; null si no es un número. */
export function parseMoney(value: string): number | null {
  const v = value.replace(/\s|\$|COP/gi, "");
  if (!v) return 0;
  // En Colombia el punto separa miles; si hay decimales se ignoran.
  const integer = v.replace(/[.,]\d{1,2}$/, "").replace(/[.,]/g, "");
  return /^\d+$/.test(integer) ? Number(integer) : null;
}

export type ImportRecord = {
  athlete: AthleteInput;
  guardian: (GuardianInput & { relationship: (typeof RELATIONSHIPS)[number] }) | null;
  enrollment: { groupId: string; feePlanId: string; startDate: string } | null;
  discountPercent: number;
  balance: number;
};

export type PreviewRow = {
  line: number;
  name: string;
  guardian: string | null;
  group: string | null;
  balance: number;
  errors: string[];
  notes: string[];
};

export type ImportPreview =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: PreviewRow[];
      summary: { total: number; valid: number; withErrors: number; newGuardians: number; balance: number };
    };

type Analyzed = { preview: ImportPreview; records: ImportRecord[] };

const firstIssue = (error: z.ZodError) => error.issues.map((i) => i.message);

/** Lee y valida las filas sin escribir nada: es la vista previa y también la validación antes de confirmar. */
async function analyze(tx: Tx, sheet: string[][], today: string): Promise<Analyzed> {
  const fail = (error: string): Analyzed => ({ preview: { ok: false, error }, records: [] });
  const headerIndex = sheet.findIndex((r) => r.some((c) => c && c.trim()));
  if (headerIndex < 0) return fail("El archivo está vacío");
  const columns = new Map<ColumnKey, number>();
  sheet[headerIndex].forEach((h, i) => {
    const key = ALIASES[normalize(h ?? "")];
    if (key && !columns.has(key)) columns.set(key, i);
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columns.has(c.key)).map((c) => c.header);
  if (missing.length) return fail(`Faltan columnas: ${missing.join(", ")}. Usa la plantilla.`);

  const body = sheet
    .slice(headerIndex + 1)
    .map((cells, i) => ({ cells, line: headerIndex + i + 2 }))
    .filter(({ cells }) => cells.some((c) => c && c.trim()));
  if (body.length === 0) return fail("El archivo no tiene alumnos");
  if (body.length > MAX_IMPORT_ROWS) return fail(`Máximo ${MAX_IMPORT_ROWS} alumnos por archivo`);

  const [groupRows, planRows, existingAthletes, existingGuardians, enrolledRows] = await Promise.all([
    tx.select().from(groups).where(eq(groups.active, true)),
    tx.select().from(feePlans).where(eq(feePlans.active, true)),
    tx
      .select({
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        birthDate: athletes.birthDate,
        documentType: athletes.documentType,
        documentNumber: athletes.documentNumber,
      })
      .from(athletes),
    tx.select({ phone: guardians.phone }).from(guardians),
    tx
      .select({ groupId: enrollments.groupId })
      .from(enrollments)
      .where(inArray(enrollments.status, CURRENT_STATUSES)),
  ]);
  const groupByName = new Map(groupRows.map((g) => [normalize(g.name), g]));
  const planByName = new Map(planRows.map((p) => [normalize(p.name), p]));
  const planIds = new Set(planRows.map((p) => p.id));
  const docKey = (type: string | null, number: string | null) => (number ? `${type}:${number}` : null);
  const personKey = (a: { firstName: string; lastName: string; birthDate: string }) =>
    `${normalize(a.firstName)}|${normalize(a.lastName)}|${a.birthDate}`;
  const takenDocs = new Set(existingAthletes.map((a) => docKey(a.documentType, a.documentNumber)));
  const takenPeople = new Set(existingAthletes.map(personKey));
  const knownPhones = new Set(existingGuardians.map((g) => g.phone));
  const occupancy = new Map<string, number>();
  for (const e of enrolledRows) occupancy.set(e.groupId, (occupancy.get(e.groupId) ?? 0) + 1);

  const seenDocs = new Map<string, number>();
  const seenPeople = new Map<string, number>();
  const seenPhones = new Map<string, number>();
  const rows: PreviewRow[] = [];
  const records: ImportRecord[] = [];

  for (const { cells, line } of body) {
    const get = (key: ColumnKey) => {
      const i = columns.get(key);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };
    const errors: string[] = [];
    const notes: string[] = [];
    const documentType = (raw: string): (typeof PERSON_DOCUMENT_TYPES)[number] | "invalid" | null =>
      raw ? (DOCUMENT_ALIASES[normalize(raw)] ?? "invalid") : null;

    const athleteDocType = documentType(get("documentType"));
    if (athleteDocType === "invalid") errors.push(`Tipo de documento desconocido: ${get("documentType")}`);
    const sex = get("sex").toUpperCase().slice(0, 1);
    const blood = get("bloodType").toUpperCase().replace(/\s/g, "");
    const athlete = athleteSchema.safeParse({
      firstName: get("firstName"),
      lastName: get("lastName"),
      documentType: athleteDocType === "invalid" ? null : athleteDocType,
      documentNumber: athleteDocType === "invalid" ? "" : get("documentNumber"),
      birthDate: parseDate(get("birthDate")),
      sex: sex === "F" || sex === "M" ? sex : null,
      phone: "",
      email: "",
      healthInsurer: get("healthInsurer"),
      bloodType: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].includes(blood) ? blood : null,
      medicalNotes: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      schoolName: get("schoolName"),
      notes: "",
    });
    if (!athlete.success) errors.push(...firstIssue(athlete.error));
    if (athlete.success && get("bloodType") && athlete.data.bloodType === null)
      notes.push("Tipo de sangre no reconocido: se deja vacío");

    // Acudiente: basta con que tenga celular o nombre para intentar crearlo.
    let guardian: ImportRecord["guardian"] = null;
    const hasGuardian = ["guardianFirstName", "guardianLastName", "guardianPhone"].some((k) =>
      Boolean(get(k as ColumnKey)),
    );
    if (hasGuardian) {
      const gDocType = documentType(get("guardianDocumentType"));
      if (gDocType === "invalid") errors.push(`Tipo de documento del acudiente desconocido`);
      const parsed = guardianSchema.safeParse({
        firstName: get("guardianFirstName"),
        lastName: get("guardianLastName"),
        documentType: gDocType === "invalid" ? null : gDocType,
        documentNumber: gDocType === "invalid" ? "" : get("guardianDocumentNumber"),
        phone: get("guardianPhone"),
        email: get("guardianEmail"),
      });
      if (!parsed.success) errors.push(...firstIssue(parsed.error).map((m) => `Acudiente: ${m}`));
      else {
        const relationship = RELATIONSHIP_ALIASES[normalize(get("relationship"))] ?? "GUARDIAN";
        guardian = { ...parsed.data, relationship };
        if (knownPhones.has(parsed.data.phone)) notes.push("Acudiente ya registrado: se vincula (hermanos)");
        else if (seenPhones.has(parsed.data.phone))
          notes.push(`Hermano de la fila ${seenPhones.get(parsed.data.phone)}`);
        if (!seenPhones.has(parsed.data.phone)) seenPhones.set(parsed.data.phone, line);
      }
    }
    if (athlete.success && !hasGuardian && ageOn(athlete.data.birthDate, today) < ADULT_AGE)
      errors.push(ATHLETE_ERROR_MESSAGES.guardian_required);

    if (athlete.success) {
      const doc = docKey(athlete.data.documentType, athlete.data.documentNumber);
      const person = personKey(athlete.data);
      if (doc && takenDocs.has(doc)) errors.push(ATHLETE_ERROR_MESSAGES.document_taken);
      else if (doc && seenDocs.has(doc)) errors.push(`Documento repetido en la fila ${seenDocs.get(doc)}`);
      else if (takenPeople.has(person))
        errors.push("Ya existe un alumno con ese nombre y fecha de nacimiento");
      else if (seenPeople.has(person)) errors.push(`Alumno repetido en la fila ${seenPeople.get(person)}`);
      if (doc && !seenDocs.has(doc)) seenDocs.set(doc, line);
      if (!seenPeople.has(person)) seenPeople.set(person, line);
    }

    // Matrícula.
    let enrollment: ImportRecord["enrollment"] = null;
    const groupName = get("group");
    if (groupName) {
      const group = groupByName.get(normalize(groupName));
      if (!group) errors.push(`No existe el grupo "${groupName}"`);
      else {
        const planName = get("feePlan");
        const plan = planName ? planByName.get(normalize(planName)) : null;
        const feePlanId =
          plan?.id ??
          (group.defaultFeePlanId && planIds.has(group.defaultFeePlanId) ? group.defaultFeePlanId : null);
        if (planName && !plan) errors.push(`No existe la tarifa "${planName}"`);
        else if (!feePlanId) errors.push(`El grupo "${group.name}" no tiene tarifa: escribe la tarifa`);
        const startDate = get("startDate") ? parseDate(get("startDate")) : today;
        if (!z.iso.date().safeParse(startDate).success) errors.push("La fecha de inicio no es válida");
        if (feePlanId && errors.length === 0) {
          enrollment = { groupId: group.id, feePlanId, startDate };
          const taken = (occupancy.get(group.id) ?? 0) + 1;
          occupancy.set(group.id, taken);
          if (taken > group.capacity)
            notes.push(`El grupo ${group.name} queda sobre su cupo (${group.capacity})`);
        }
      }
    }

    const discountRaw = get("discount").replace("%", "").trim();
    const discountPercent = discountRaw ? Number(discountRaw.replace(",", ".")) : 0;
    if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100)
      errors.push("El descuento debe ser un número entero entre 0 y 100");
    else if (discountPercent > 0 && !groupName) notes.push("El descuento solo aplica con grupo: se ignora");

    const balance = parseMoney(get("balance"));
    if (balance === null) errors.push("El saldo pendiente no es un valor válido");
    else if (balance > 50_000_000) errors.push("El saldo pendiente es demasiado alto");
    else if (balance > 0 && !hasGuardian) errors.push("El saldo necesita un acudiente responsable de pago");

    const name = athlete.success
      ? `${athlete.data.firstName} ${athlete.data.lastName}`
      : `${get("firstName")} ${get("lastName")}`.trim() || "(sin nombre)";
    rows.push({
      line,
      name,
      guardian: guardian ? `${guardian.firstName} ${guardian.lastName}` : null,
      group: enrollment ? (groupRows.find((g) => g.id === enrollment.groupId)?.name ?? null) : null,
      balance: balance ?? 0,
      errors,
      notes,
    });
    if (errors.length === 0 && athlete.success) {
      records.push({
        athlete: athlete.data,
        guardian,
        enrollment,
        discountPercent: enrollment ? discountPercent : 0,
        balance: balance ?? 0,
      });
    }
  }

  const withErrors = rows.filter((r) => r.errors.length > 0).length;
  return {
    preview: {
      ok: true,
      rows,
      summary: {
        total: rows.length,
        valid: rows.length - withErrors,
        withErrors,
        newGuardians: new Set(
          records.flatMap((r) =>
            r.guardian && !knownPhones.has(r.guardian.phone) ? [r.guardian.phone] : [],
          ),
        ).size,
        balance: records.reduce((s, r) => s + r.balance, 0),
      },
    },
    records,
  };
}

export function previewImport(database: Database, schoolId: string, sheet: string[][], today: string) {
  return runInTenant(database, { schoolId }, async (tx) => (await analyze(tx, sheet, today)).preview);
}

export type ImportResult =
  | { ok: true; athletes: number; guardians: number; enrollments: number; balanceInvoices: number }
  | { ok: false; error: string; preview?: ImportPreview };

/**
 * Importa todo o nada: vuelve a validar en el servidor y crea alumnos, acudientes (reutilizando por celular),
 * matrículas con su descuento y una cuenta "Saldo anterior" por responsable de pago.
 */
export async function commitImport(
  database: Database,
  ctx: { schoolId: string; actorUserId: string },
  sheet: string[][],
  today: string,
  policy: BillingPolicy,
): Promise<ImportResult> {
  try {
    return await runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
      const { preview, records } = await analyze(tx, sheet, today);
      if (!preview.ok) return { ok: false as const, error: preview.error, preview };
      if (preview.summary.withErrors > 0)
        return { ok: false as const, error: "Corrige las filas con errores antes de importar", preview };

      const guardiansBefore = await tx.select({ id: guardians.id }).from(guardians);
      const known = new Set(guardiansBefore.map((g) => g.id));
      const newGuardians = new Set<string>();
      const balances = new Map<string, { athleteId: string; firstName: string; amount: number }[]>();
      let enrolled = 0;

      for (const record of records) {
        const created = await createAthleteTx(tx, ctx, {
          athlete: record.athlete,
          guardian: record.guardian,
          enrollment: record.enrollment
            ? { ...record.enrollment, status: "ACTIVE", allowOverCapacity: true }
            : null,
          today,
          discountPercent: record.discountPercent,
        });
        if (created.enrollmentId) enrolled++;
        if (created.guardianId && !known.has(created.guardianId)) newGuardians.add(created.guardianId);
        if (record.balance > 0 && created.guardianId) {
          const list = balances.get(created.guardianId) ?? [];
          list.push({
            athleteId: created.athleteId,
            firstName: record.athlete.firstName,
            amount: record.balance,
          });
          balances.set(created.guardianId, list);
        }
      }
      for (const [guardianId, items] of balances) {
        await chargePreviousBalanceTx(tx, ctx, { guardianId, items, today }, policy);
      }
      const result = {
        ok: true as const,
        athletes: records.length,
        guardians: newGuardians.size,
        enrollments: enrolled,
        balanceInvoices: balances.size,
      };
      await tx.insert(auditLogs).values({
        schoolId: ctx.schoolId,
        actorUserId: ctx.actorUserId,
        action: "athletes.imported",
        entity: "school",
        entityId: ctx.schoolId,
        data: result,
      });
      return result;
    });
  } catch (err) {
    if (err instanceof AthleteDomainError) return { ok: false, error: ATHLETE_ERROR_MESSAGES[err.code] };
    throw err;
  }
}

/** Plantilla descargable: hoja de alumnos con un ejemplo, instrucciones y los grupos y tarifas vigentes. */
export async function importTemplate(database: Database, schoolId: string): Promise<Sheet[]> {
  const [groupRows, planRows] = await runInTenant(database, { schoolId }, (tx) =>
    Promise.all([
      tx.select().from(groups).where(eq(groups.active, true)).orderBy(groups.name),
      tx.select().from(feePlans).where(eq(feePlans.active, true)).orderBy(feePlans.name),
    ]),
  );
  const planName = new Map(planRows.map((p) => [p.id, p.name]));
  const example = IMPORT_COLUMNS.map((c) =>
    c.key === "group" ? (groupRows[0]?.name ?? c.example) : c.example,
  );
  return [
    {
      name: "Alumnos",
      rows: [IMPORT_COLUMNS.map((c) => (c.required ? `${c.header}*` : c.header)), example],
      widths: IMPORT_COLUMNS.map((c) => Math.max(14, c.header.length + 4)),
    },
    {
      name: "Instrucciones",
      rows: [
        ["Columna", "Cómo llenarla"],
        ...IMPORT_COLUMNS.map((c) => [c.header, c.help]),
        [],
        ["", "Borra la fila de ejemplo antes de subir el archivo. Una fila por alumno."],
        ["", "Hermanos: escribe el mismo celular del acudiente en cada hermano."],
      ],
      widths: [32, 70],
    },
    {
      name: "Grupos y tarifas",
      rows: [
        ["Grupo", "Cupo", "Tarifa del grupo", "", "Tarifas", "Mensualidad"],
        ...Array.from({ length: Math.max(groupRows.length, planRows.length) }, (_, i) => [
          groupRows[i]?.name ?? null,
          groupRows[i]?.capacity ?? null,
          groupRows[i]?.defaultFeePlanId ? (planName.get(groupRows[i].defaultFeePlanId!) ?? null) : null,
          null,
          planRows[i]?.name ?? null,
          planRows[i]?.monthlyAmount ?? null,
        ]),
      ],
      widths: [28, 8, 24, 4, 28, 14],
    },
  ];
}
