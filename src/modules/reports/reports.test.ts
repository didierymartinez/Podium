import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { enrollments } from "@/db/schema";
import { diskStorage } from "@/lib/storage/local";
import { readZip } from "@/lib/xlsx/zip";
import { readFirstSheet, writeWorkbook } from "@/lib/xlsx";
import { changeEnrollmentStatus } from "@/modules/athletes/athletes";
import { listGuardians } from "@/modules/athletes/guardians";
import { saveAttendance } from "@/modules/attendance/attendance";
import { listSessions, syncSessions } from "@/modules/attendance/sessions";
import { generateMonth } from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/payments";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { fullExport } from "./full-export";
import { REPORTS, buildReport, reportSheet, type ReportId, type ReportTable } from "./reports";

describe.skipIf(!testDatabaseUrl)("reportes (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("calcula los reportes del MVP y la exportación completa", async () => {
    const f = await schoolFixture(conn.db);
    const today = f.today;
    const range = { from: `${today.slice(0, 7)}-01`, to: today };
    const ctx = { ...f.ctx, slug: f.school.slug };
    const ana = await f.athlete("Ana", { startDate: range.from });
    const bruno = await f.athlete("Bruno", { startDate: range.from });
    await generateMonth(conn.db, ctx, today.slice(0, 7), today, DEFAULT_BILLING_POLICY);
    const guardians = await listGuardians(conn.db, f.ctx.schoolId);
    await recordPayment(
      conn.db,
      diskStorage({ dir: "/tmp/podium-reports-test", secret: "x" }),
      ctx,
      {
        guardianId: guardians[0].id,
        amount: 100_000,
        paidOn: today,
        method: "TRANSFER",
        reference: "ABC",
        notes: null,
        proofFileId: null,
      },
      today,
      DEFAULT_BILLING_POLICY,
    );
    const [brunoEnrollment] = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(enrollments),
    ).then((rows) => rows.filter((r) => r.athleteId === bruno));
    await changeEnrollmentStatus(conn.db, f.ctx, brunoEnrollment.id, {
      to: "WITHDRAWN",
      date: today,
      reason: "SCHEDULE",
    });

    // Una clase de hoy con asistencia de Ana.
    await syncSessions(conn.db, f.school, today);
    const [session] = await listSessions(conn.db, f.ctx.schoolId, { from: today, to: today });
    const saved = await saveAttendance(
      conn.db,
      { ...f.ctx, timeZone: f.school.timezone, isManager: true },
      session.id,
      { entries: [{ athleteId: ana, status: "PRESENT" }] },
    );
    expect(saved.ok).toBe(true);

    const all = Object.fromEntries(
      await Promise.all(
        (Object.keys(REPORTS) as ReportId[]).map(
          async (id) => [id, await buildReport(conn.db, f.ctx.schoolId, id, range, today)] as const,
        ),
      ),
    ) as Record<ReportId, ReportTable>;
    expect(all["facturado-vs-recaudado"].rows).toHaveLength(12);
    expect(all["facturado-vs-recaudado"].totals).toMatchObject({
      billed: 200_000,
      collected: 100_000,
      rate: 0.5,
    });
    expect(all.pagos.rows).toEqual([
      expect.objectContaining({ method: "Transferencia", reference: "ABC", amount: 100_000 }),
    ]);
    expect(all.cartera.rows).toHaveLength(1);
    expect(all.alumnos.rows.map((r) => r.name)).toEqual(["Ana Gómez"]);
    expect(all.alumnos.rows[0]).toMatchObject({
      group: "Iniciación",
      status: "Activo",
      payer: "Laura Gómez",
    });
    expect(all["altas-y-retiros"].rows.map((r) => [r.kind, r.name, r.reason])).toEqual(
      expect.arrayContaining([
        ["Alta", "Ana Gómez", null],
        ["Alta", "Bruno Gómez", null],
        ["Retiro", "Bruno Gómez", "Horario"],
      ]),
    );
    expect(all["asistencia-grupos"].rows[0]).toMatchObject({
      name: "Iniciación",
      recorded: 1,
      present: 1,
      rate: 1,
    });
    expect(all["asistencia-profesores"].rows[0]).toMatchObject({ name: "Juan Pérez", recorded: 1 });
    expect(all["asistencia-alumnos"].rows).toEqual([
      expect.objectContaining({ name: "Ana Gómez", sessions: 1, present: 1 }),
    ]);

    // Excel: encabezados, filas y totales; porcentajes en 0–100.
    const sheet = readFirstSheet(writeWorkbook([reportSheet(all["facturado-vs-recaudado"])]));
    expect(sheet[0]).toEqual(["Mes", "Facturado", "Recaudado", "Recaudado / facturado (%)"]);
    expect(sheet.at(-1)).toEqual(["Total", "200000", "100000", "50"]);

    const zip = readZip(await fullExport(conn.db, f.ctx.schoolId, new Date()));
    expect([...zip.keys()]).toEqual(
      expect.arrayContaining(["LEEME.txt", "escuela.csv", "alumnos.csv", "pagos.csv"]),
    );
    const athletesCsv = zip.get("alumnos.csv")!.toString("utf8");
    expect(athletesCsv).toMatch(/first_name/);
    expect(athletesCsv).toMatch(/Ana/);
    expect(athletesCsv).not.toMatch(/encrypted/);
    expect(zip.get("escuela.csv")!.toString("utf8")).toMatch(/Club Prueba/);
  });
});
