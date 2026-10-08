import { expect, test } from "@playwright/test";
import {
  createFeePlans,
  createGroup,
  createSchool,
  fillNewAthlete,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("cierre de caja: lo recibido hoy por medio, diferencia explicada y Excel", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  await page.goto(`${school}/acudientes`);
  const href = await page
    .getByRole("link", { name: /Laura Gómez/ })
    .first()
    .getAttribute("href");
  const guardianId = href!.split("/").at(-1);

  await page.goto(`${school}/cobros/pagos/nuevo?acudiente=${guardianId}`);
  await page.locator('input[name="amount"]').fill("80000");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("heading", { name: /Recibo RC-/ })).toBeVisible();

  await page.goto(`${school}/cobros`);
  await page.getByRole("link", { name: "Caja" }).click();
  await expect(page.getByLabel("Recibido hoy por medio")).toContainText("$ 80.000");
  const form = page.getByRole("form", { name: "Cerrar caja" });
  await form.getByLabel("Efectivo contado").fill("75000");
  await form.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(form.getByText("Explica la diferencia")).toBeVisible();
  await form.getByLabel("Observación").fill("Faltan 5.000 de vueltas");
  await form.getByRole("button", { name: "Cerrar caja" }).click();
  await expect(page.getByText("Cerrada", { exact: true })).toBeVisible();
  const closings = page.getByRole("list", { name: "Cierres de caja" });
  await expect(closings.getByText("diferencia -$ 5.000")).toBeVisible();

  const download = page.waitForEvent("download");
  await closings.getByRole("link").first().click();
  expect((await download).suggestedFilename()).toMatch(/^cierre-caja-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
