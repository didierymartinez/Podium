import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInTenant } from "@/db/rls";
import { athletes, enrollments, guardians, invoiceLines } from "@/db/schema";
import { readFirstSheet, writeWorkbook } from "@/lib/xlsx";
import { generateMonth, previewMonth } from "@/modules/billing/invoices";
import { DEFAULT_BILLING_POLICY } from "@/modules/billing/policy";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { randomMobile, schoolFixture } from "@/test/fixtures";
import {
  IMPORT_COLUMNS,
  commitImport,
  importTemplate,
  parseDate,
  parseMoney,
  previewImport,
} from "./athletes";

describe("lectura de valores", () => {
  it("fechas en formatos comunes", () => {
    expect(parseDate("2015-03-14")).toBe("2015-03-14");
    expect(parseDate("14/03/2015")).toBe("2015-03-14");
    expect(parseDate("4-3-2015")).toBe("2015-03-04");
    expect(parseDate("2015/3/4")).toBe("2015-03-04");
  });

  it("valores en pesos", () => {
    expect(parseMoney("$ 120.000")).toBe(120000);
    expect(parseMoney("120000")).toBe(120000);
    expect(parseMoney("120,000.00")).toBe(120000);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("mucho")).toBeNull();
  });
});

const header = IMPORT_COLUMNS.map((c) => `${c.header}${c.required ? "*" : ""}`);
const row = (values: Partial<Record<(typeof IMPORT_COLUMNS)[number]["key"], string>>) =>
  IMPORT_COLUMNS.map((c) => values[c.key] ?? "");

describe.skipIf(!testDatabaseUrl)("importar alumnos (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("valida, detecta hermanos y errores, y no escribe nada en la vista previa", async () => {
    const f = await schoolFixture(conn.db);
    const phone = randomMobile("30");
    const existing = await f.athlete("Mariana", { birthDate: "2014-05-05" });
    const sheet = [
      header,
      row({
        firstName: "Sofía",
        lastName: "Restrepo",
        birthDate: "14/03/2015",
        guardianFirstName: "Laura",
        guardianLastName: "Gómez",
        guardianPhone: phone,
        group: "iniciacion",
        discount: "10",
        balance: "$ 80.000",
        documentType: "TI",
        documentNumber: "1020304050",
      }),
      row({
        firstName: "Tomás",
        lastName: "Restrepo",
        birthDate: "2017-01-02",
        guardianFirstName: "Laura",
        guardianLastName: "Gómez",
        guardianPhone: phone,
        group: "Iniciación",
        balance: "40000",
      }),
      row({ firstName: "Sin", lastName: "Acudiente", birthDate: "2016-01-01" }),
      row({ firstName: "Mal", lastName: "Grupo", birthDate: "1990-01-01", group: "Avanzados" }),
      row({
        firstName: "Mariana",
        lastName: "Gómez",
        birthDate: "2014-05-05",
        guardianFirstName: "Ana",
        guardianLastName: "Ruiz",
        guardianPhone: randomMobile("30"),
      }),
      row({
        firstName: "Doc",
        lastName: "Repetido",
        birthDate: "2015-01-01",
        documentType: "Tarjeta de identidad",
        documentNumber: "1020304050",
        guardianFirstName: "Ana",
        guardianLastName: "Ruiz",
        guardianPhone: "123",
      }),
      [],
    ];
    const preview = await previewImport(conn.db, f.ctx.schoolId, sheet, f.today);
    if (!preview.ok) throw new Error(preview.error);
    expect(existing).toBeTruthy();
    expect(preview.summary).toMatchObject({
      total: 6,
      valid: 2,
      withErrors: 4,
      newGuardians: 1,
      balance: 120000,
    });
    const [sofia, tomas, noGuardian, badGroup, duplicate, badDoc] = preview.rows;
    expect(sofia).toMatchObject({ line: 2, errors: [], group: "Iniciación", balance: 80000 });
    expect(tomas.notes).toContain("Hermano de la fila 2");
    expect(noGuardian.errors.join()).toMatch(/acudiente/);
    expect(badGroup.errors).toContain('No existe el grupo "Avanzados"');
    expect(duplicate.errors.join()).toMatch(/Ya existe un alumno/);
    expect(badDoc.errors.join()).toMatch(/Documento repetido en la fila 2/);
    expect(badDoc.errors.join()).toMatch(/celular/);

    const before = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(athletes),
    );
    expect(before).toHaveLength(1);
    const rejected = await commitImport(conn.db, f.ctx, sheet, f.today, DEFAULT_BILLING_POLICY);
    expect(rejected.ok).toBe(false);
  });

  it("importa todo o nada con matrícula, descuento y saldo anterior", async () => {
    const f = await schoolFixture(conn.db);
    const phone = randomMobile("30");
    const book = writeWorkbook([
      {
        name: "Alumnos",
        rows: [
          header,
          row({
            firstName: "Sofía",
            lastName: "Restrepo",
            birthDate: "2015-03-14",
            guardianFirstName: "Laura",
            guardianLastName: "Gómez",
            relationship: "Mamá",
            guardianPhone: phone,
            group: "Iniciación",
            discount: "10%",
            balance: "80000",
            startDate: `${f.today.slice(0, 7)}-01`,
          }),
          row({
            firstName: "Tomás",
            lastName: "Restrepo",
            birthDate: "2017-01-02",
            guardianFirstName: "Laura",
            guardianLastName: "Gómez",
            guardianPhone: phone,
            group: "Iniciación",
            balance: "40000",
            startDate: `${f.today.slice(0, 7)}-01`,
          }),
          row({ firstName: "Adulto", lastName: "Solo", birthDate: "1990-01-01" }),
        ],
      },
    ]);
    const sheet = readFirstSheet(book);
    const result = await commitImport(conn.db, f.ctx, sheet, f.today, DEFAULT_BILLING_POLICY);
    expect(result).toEqual({ ok: true, athletes: 3, guardians: 1, enrollments: 2, balanceInvoices: 1 });

    const data = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, async (tx) => ({
      athletes: await tx.select().from(athletes),
      guardians: await tx.select().from(guardians),
      enrollments: await tx.select().from(enrollments),
      lines: await tx.select().from(invoiceLines),
    }));
    expect(data.athletes).toHaveLength(3);
    expect(data.guardians).toHaveLength(1);
    expect(data.enrollments.map((e) => e.discountPercent).sort()).toEqual([0, 10]);
    expect(data.lines.map((l) => [l.kind, l.amount]).sort()).toEqual([
      ["PREVIOUS_BALANCE", 40000],
      ["PREVIOUS_BALANCE", 80000],
    ]);

    // El descuento particular se aplica antes del de hermanos en la mensualidad.
    const draft = await previewMonth(conn.db, f.ctx.schoolId, f.today.slice(0, 7), DEFAULT_BILLING_POLICY);
    const sofia = draft.invoices[0].lines.find((l) => l.athleteName.startsWith("Sofía"))!;
    expect(sofia.baseAmount).toBe(90000);
    expect(sofia.description).toMatch(/descuento 10 %/);
    await generateMonth(
      conn.db,
      { ...f.ctx, slug: f.school.slug },
      f.today.slice(0, 7),
      f.today,
      DEFAULT_BILLING_POLICY,
    );

    // Reimportar el mismo archivo no duplica: todo falla y nada se escribe.
    const again = await commitImport(conn.db, f.ctx, sheet, f.today, DEFAULT_BILLING_POLICY);
    expect(again.ok).toBe(false);
    const count = await runInTenant(conn.db, { schoolId: f.ctx.schoolId }, (tx) =>
      tx.select().from(athletes),
    );
    expect(count).toHaveLength(3);
  });

  it("la plantilla trae columnas, instrucciones y los grupos de la escuela", async () => {
    const f = await schoolFixture(conn.db);
    const sheets = await importTemplate(conn.db, f.ctx.schoolId);
    expect(sheets.map((s) => s.name)).toEqual(["Alumnos", "Instrucciones", "Grupos y tarifas"]);
    expect(sheets[0].rows[0][0]).toBe("Nombres*");
    expect(sheets[2].rows[1]).toEqual(["Iniciación", 10, "Plan", null, "Plan", 100000]);
    // La plantilla con su fila de ejemplo es válida tal cual.
    const preview = await previewImport(
      conn.db,
      f.ctx.schoolId,
      readFirstSheet(writeWorkbook(sheets)),
      f.today,
    );
    expect(preview.ok && preview.summary.valid).toBe(1);
  });
});
