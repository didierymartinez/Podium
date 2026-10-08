import { expect, test } from "@playwright/test";
import { createFeePlans, createGroup, createSchool, randomPhone, signUp } from "./helpers";

test("reportes: ver, filtrar, exportar a Excel y exportación completa", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 8, "Mensual · $ 100.000");
  await page.goto(`${school}/alumnos/importar`);
  await page.getByLabel("Archivo de alumnos").setInputFiles({
    name: "alumnos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `Nombres*;Apellidos*;Fecha de nacimiento*;Nombres del acudiente;Apellidos del acudiente;Celular del acudiente;Grupo\nLuna;Mora;2014-02-02;Sara;Mora;${randomPhone()};Grupo A`,
    ),
  });
  await page.getByRole("button", { name: "Revisar archivo" }).click();
  await page.getByRole("button", { name: "Importar 1 alumnos" }).click();
  await expect(page.getByText("Importación lista")).toBeVisible();

  await page.goto(school);
  await page.getByRole("link", { name: "Reportes" }).first().click();
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await page.getByRole("link", { name: /Alumnos activos/ }).click();
  const table = page.getByRole("table", { name: "Alumnos activos" });
  await expect(table.getByRole("cell", { name: "Luna Mora" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Grupo A" })).toBeVisible();

  const excel = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar a Excel" }).click();
  expect((await excel).suggestedFilename()).toMatch(/^alumnos-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.goto(`${school}/reportes/altas-y-retiros?desde=2000-01-01&hasta=2100-12-31`);
  await expect(page.getByLabel("Desde")).toHaveValue("2000-01-01");
  await expect(page.getByRole("cell", { name: "Alta", exact: true })).toBeVisible();

  await page.goto(`${school}/reportes`);
  const zip = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar exportación completa" }).click();
  expect((await zip).suggestedFilename()).toMatch(/^podium-.*\.zip$/);
});
