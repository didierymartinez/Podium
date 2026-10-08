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

test("egresos, utilidad del mes e inventario con ventas", async ({ page }) => {
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

  // Inventario: producto, entrada y ventas.
  await page.goto(`${school}/cobros`);
  await page.getByRole("link", { name: "Inventario" }).click();
  await page.waitForLoadState("networkidle");
  const product = page.getByRole("form", { name: "Nuevo producto" });
  await product.getByLabel("Nombre del producto").fill("Licra");
  await product.getByLabel("Precio").fill("60000");
  await product.getByRole("button", { name: "Crear producto" }).click();
  await expect(page.getByRole("list", { name: "Productos" })).toContainText("0 en stock");
  const entry = page.getByRole("form", { name: "Entrada de mercancía" });
  await entry.getByRole("spinbutton", { name: /^Unidades/ }).fill("2");
  await entry.getByRole("button", { name: "Guardar movimiento" }).click();
  await expect(page.getByRole("list", { name: "Productos" })).toContainText("2 en stock");

  const sale = page.getByRole("form", { name: "Vender producto" });
  await sale.getByRole("button", { name: "Registrar venta" }).click();
  await expect(sale.getByText("Venta registrada.")).toBeVisible();
  await sale.getByRole("radio", { name: "A la cuenta de un alumno" }).check();
  await sale.getByRole("button", { name: "Registrar venta" }).click();
  await expect(sale.getByText("Venta cargada a la cuenta del alumno.")).toBeVisible();
  await sale.getByRole("button", { name: "Registrar venta" }).click();
  await expect(sale.getByText("No hay suficiente stock.")).toBeVisible();

  // Egresos y utilidad.
  await page.getByRole("link", { name: "Egresos" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Descripción").fill("Arriendo de la pista");
  await page.getByLabel("Valor").fill("45000");
  await page.getByRole("button", { name: "Registrar egreso" }).click();
  await expect(page.getByRole("list", { name: "Egresos", exact: true })).toContainText("Arriendo de la pista");
  const kpis = page.getByLabel("Utilidad del mes");
  await expect(kpis).toContainText("Ventas de contado$ 60.000");
  await expect(kpis).toContainText("Egresos$ 45.000");
  await expect(kpis).toContainText("Utilidad$ 15.000");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel" }).click();
  expect((await download).suggestedFilename()).toMatch(/^egresos-\d{4}-\d{2}\.xlsx$/);
});
