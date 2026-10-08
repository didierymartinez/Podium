import { expect, test } from "@playwright/test";
import { createFeePlans, createGroup, createSchool, randomPhone, signUp } from "./helpers";

const HEADER =
  "Nombres*;Apellidos*;Fecha de nacimiento*;Nombres del acudiente;Apellidos del acudiente;Celular del acudiente;Grupo;Descuento %;Saldo pendiente";

const csv = (lines: string[]) => ({
  name: "alumnos.csv",
  mimeType: "text/csv",
  buffer: Buffer.from([HEADER, ...lines].join("\n"), "utf8"),
});

test("importar alumnos desde Excel: plantilla, vista previa con errores y confirmación", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación 3 días", "120000"]]);
  await createGroup(page, school, "Iniciación tarde", 10, "Iniciación 3 días · $ 120.000");

  await page.goto(`${school}/alumnos`);
  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Importar alumnos" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar plantilla de Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/^plantilla-alumnos-.*\.xlsx$/);

  const phone = randomPhone();
  const file = page.getByLabel("Archivo de alumnos");
  await file.setInputFiles(
    csv([
      `Sofía;Restrepo;14/03/2015;Laura;Gómez;${phone};Iniciación tarde;10;$ 80.000`,
      `Tomás;Restrepo;2017-01-02;Laura;Gómez;${phone};Avanzados;;`,
    ]),
  );
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await expect(page.getByText('No existe el grupo "Avanzados"')).toBeVisible();
  await expect(page.getByText("1 con errores")).toBeVisible();
  await expect(page.getByRole("button", { name: /Importar \d+ alumnos/ })).toHaveCount(0);

  await file.setInputFiles(
    csv([
      `Sofía;Restrepo;14/03/2015;Laura;Gómez;${phone};Iniciación tarde;10;$ 80.000`,
      `Tomás;Restrepo;2017-01-02;Laura;Gómez;${phone};Iniciación tarde;;`,
    ]),
  );
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await expect(page.getByText("Hermano de la fila 2")).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 alumnos" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 alumnos, 1 acudientes nuevos" })).toBeVisible();

  await page.getByRole("link", { name: "Ver alumnos" }).click();
  await expect(page.getByRole("link", { name: /Sofía Restrepo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tomás Restrepo/ })).toBeVisible();

  await page.goto(`${school}/cobros/cuentas`);
  await expect(page.getByText("$ 80.000").first()).toBeVisible();
});

test("tablero del administrador muestra los indicadores del mes", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 4, "Mensual · $ 100.000");
  await page.goto(`${school}/alumnos/importar`);
  await page
    .getByLabel("Archivo de alumnos")
    .setInputFiles(csv([`Ana;Pérez;2015-01-01;Luz;Pérez;${randomPhone()};Grupo A;;50000`]));
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await page.getByRole("button", { name: "Importar 1 alumnos" }).click();
  await expect(page.getByText("Importación lista")).toBeVisible();

  await page.goto(school);
  const kpis = page.getByLabel("Indicadores del mes");
  await expect(kpis).toBeVisible();
  await expect(kpis.getByText("Alumnos activos")).toBeVisible();
  await expect(kpis.getByText("1 de 4 cupos")).toBeVisible();
  await expect(kpis.getByText("Facturado $ 50.000")).toBeVisible();
  await expect(page.getByRole("table", { name: "Facturado vs. recaudado por mes" })).toBeAttached();
});
