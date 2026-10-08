import { expect, test } from "@playwright/test";
import { createFeePlans, createGroup, createSchool, signUp } from "./helpers";

test("multi-sede: sedes, grupos por sede y filtros", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo Centro", 10, "Mensual · $ 100.000");

  await page.goto(`${school}/configuracion/sedes`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("list", { name: "Sedes" })).toContainText("Sede principal");
  await page.getByLabel("Nombre de la sede").last().fill("Sede Norte");
  await page.getByLabel("Dirección").last().fill("Calle 100 # 15-20");
  await page.getByRole("button", { name: "Crear sede" }).click();
  await expect(page.getByText("Sede creada.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Sedes" })).toContainText("Sede Norte");

  // Grupo en la sede nueva.
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Grupo Norte");
  await page.locator('input[name="capacity"]').fill("10");
  await page.locator('select[name="venueId"]').selectOption({ label: "Sede Norte" });
  await page.locator('select[name="defaultFeePlanId"]').selectOption({ label: "Mensual · $ 100.000" });
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);

  await page.getByRole("navigation", { name: "Sedes" }).getByRole("link", { name: "Sede Norte" }).click();
  await expect(page.getByText("Grupo Norte")).toBeVisible();
  await expect(page.getByText("Grupo Centro")).toHaveCount(0);

  // No se archiva una sede con grupos activos.
  await page.goto(`${school}/configuracion/sedes`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Archivar Sede Norte" }).click();
  await expect(page.getByText("Mueve o archiva primero los grupos de esta sede.")).toBeVisible();

  await page.goto(`${school}/asistencia`);
  await expect(page.getByRole("navigation", { name: "Sedes" })).toContainText("Todas las sedes");
});
