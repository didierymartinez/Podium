import { eq, getTableColumns, type Table } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import * as s from "@/db/schema";
import { decryptField } from "@/lib/crypto";
import { toCsv, type Cell } from "@/lib/xlsx";
import { writeZip } from "@/lib/xlsx/zip";

/**
 * Exportación completa de la escuela (ADM-75): un CSV por tabla dentro de un ZIP, para que la escuela
 * pueda llevarse sus datos. No incluye secretos (hashes, llaves cifradas, tokens) ni los archivos binarios.
 */
const TABLES: [string, Table][] = [
  ["sedes", s.venues],
  ["disciplinas", s.disciplines],
  ["niveles", s.levels],
  ["categorias", s.ageCategories],
  ["miembros", s.schoolMemberships],
  ["tarifas", s.feePlans],
  ["alumnos", s.athletes],
  ["acudientes", s.guardians],
  ["alumnos_acudientes", s.athleteGuardians],
  ["grupos", s.groups],
  ["horarios", s.groupSchedules],
  ["matriculas", s.enrollments],
  ["profesores", s.coaches],
  ["grupos_profesores", s.groupCoaches],
  ["cierres", s.schoolClosures],
  ["clases", s.sessions],
  ["clases_alumnos", s.sessionAthletes],
  ["asistencia", s.attendance],
  ["archivos", s.files],
  ["tipos_de_documento", s.documentTypes],
  ["documentos_alumnos", s.athleteDocuments],
  ["certificaciones_profesores", s.coachCertifications],
  ["conceptos_de_cobro", s.chargeConcepts],
  ["cuentas", s.invoices],
  ["lineas_de_cuenta", s.invoiceLines],
  ["notas_credito", s.creditNotes],
  ["pagos", s.payments],
  ["aplicaciones_de_pago", s.paymentAllocations],
  ["pagos_en_linea", s.paymentIntents],
  ["avisos", s.announcements],
  ["avisos_destinatarios", s.announcementRecipients],
  ["auditoria", s.auditLogs],
];

const SECRET = /hash|secret|token|encrypted|privateKey|integrity/i;
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function value(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(v);
}

function tableCsv(table: Table, rows: Record<string, unknown>[]) {
  const keys = Object.keys(getTableColumns(table)).filter((k) => !SECRET.test(k));
  const extra = "medicalNotesEncrypted" in getTableColumns(table) ? ["medicalNotes"] : [];
  const header = [...keys, ...extra];
  return toCsv([
    header.map(snake),
    ...rows.map((r) => [
      ...keys.map((k) => value(r[k])),
      ...extra.map(() => value(decryptField(r.medicalNotesEncrypted as string | null))),
    ]),
  ]);
}

export async function fullExport(database: Database, schoolId: string, exportedAt: Date) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const files: { name: string; data: Buffer }[] = [];
    const counts: string[] = [];
    const [school] = await tx.select().from(s.schools).where(eq(s.schools.id, schoolId));
    files.push({ name: "escuela.csv", data: Buffer.from(tableCsv(s.schools, school ? [school] : [])) });
    for (const [name, table] of TABLES) {
      const rows = (await tx.select().from(table)) as Record<string, unknown>[];
      files.push({ name: `${name}.csv`, data: Buffer.from(tableCsv(table, rows), "utf8") });
      counts.push(`${name}.csv: ${rows.length} filas`);
    }
    files.unshift({
      name: "LEEME.txt",
      data: Buffer.from(
        [
          `Exportación completa de ${school?.name ?? "la escuela"} en Podium`,
          `Fecha: ${exportedAt.toISOString()}`,
          "",
          "Un archivo CSV (UTF-8, separado por comas) por tabla. Los identificadores (id, *_id) relacionan las tablas.",
          "Valores en pesos colombianos enteros. Fechas en formato AAAA-MM-DD; horas en UTC (ISO 8601).",
          "No incluye contraseñas, llaves ni tokens. Los archivos (fotos y documentos) se listan en archivos.csv",
          "y se descargan desde la ficha de cada persona.",
          "",
          ...counts,
          "",
        ].join("\r\n"),
        "utf8",
      ),
    });
    return writeZip(files);
  });
}
