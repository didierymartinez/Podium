import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("suscripción: datos de facturación, planes, cancelación y reactivación en solo lectura", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);

  await page.goto(`${school}/configuracion`);
  await page.getByRole("link", { name: "Suscripción" }).click();
  await expect(page.getByRole("heading", { name: "Suscripción" })).toBeVisible();
  await expect(page.getByText("Prueba gratis", { exact: true }).first()).toBeVisible();

  // Planes con el sugerido marcado; sin llaves de Podium el pago queda deshabilitado con aviso.
  await expect(page.getByRole("radio", { name: "Plan Semilla" })).toBeVisible();
  await expect(page.getByText("Los pagos en línea de Podium se están configurando.")).toBeVisible();
  await page.getByRole("radio", { name: "Anual · 2 meses gratis" }).click();
  await expect(page.getByRole("button", { name: /Pagar .* con PSE, Nequi o tarjeta/ })).toBeDisabled();

  await page.getByLabel("Razón social o nombre").fill("Club E2E SAS");
  await page.getByLabel("Número").fill("900123456");
  await page.getByLabel("Dirección").fill("Calle 10 # 20-30");
  await page.getByLabel("Email de facturación").fill("pagos@club.co");
  await page.getByRole("button", { name: "Guardar datos de facturación" }).click();
  await expect(page.getByText("Datos de facturación guardados")).toBeVisible();

  // Cancelar en prueba es inmediato; luego se reactiva en solo lectura.
  await page.getByRole("button", { name: "Cancelar suscripción" }).click();
  await page.getByLabel("¿Por qué cancelas?").selectOption("Es muy caro");
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  await expect(page.getByRole("heading", { name: "Esta escuela está cancelada" })).toBeVisible();
  await page.getByRole("button", { name: "Reactivar y elegir plan" }).click();
  await page.waitForURL(`**${school}/suscripcion`);
  await expect(page.getByText("Solo lectura", { exact: true })).toBeVisible();
  await expect(page.getByText(/La escuela está en/)).toBeVisible();

  // En solo lectura no se puede crear.
  await page.goto(`${school}/configuracion/cobros`);
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Mensual");
  await page.locator('input[name="monthlyAmount"]').fill("100000");
  await page.getByRole("button", { name: "Crear tarifa" }).click();
  await expect(page.getByText(/No tienes permiso|Solo el propietario/)).toBeVisible();
});
