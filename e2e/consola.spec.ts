import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

const ADMIN = "e2e-admin@example.com";

test("consola de Podium: métricas, acciones y 'entrar como' en solo lectura", async ({ page }) => {
  await signUp(page, "Dueña Consola");
  const school = await createSchool(page);
  const slug = school.slice(1);

  // Una persona sin rol de Podium no entra a la consola.
  await page.goto("/admin");
  await page.waitForURL("**/escuelas");

  // Super admin definido por PLATFORM_ADMIN_EMAILS.
  await page.context().clearCookies();
  await page.goto("/registro");
  await page.locator('input[name="name"]').fill("Soporte Podium");
  await page.locator('input[name="email"]').fill(ADMIN);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/escuelas");

  await page.goto(`/admin?q=${slug}`);
  await expect(page.getByLabel("Métricas de la plataforma").getByText("MRR")).toBeVisible();
  const table = page.getByRole("table", { name: "Escuelas" });
  await expect(table.getByRole("row")).toHaveCount(2);
  await table.getByRole("link").first().click();

  await page.getByLabel("Días").fill("10");
  await page.getByRole("button", { name: "Extender prueba" }).click();
  await expect(page.getByText("Prueba extendida 10 días")).toBeVisible();

  await page.getByLabel("Motivo (obligatorio, queda auditado)").fill("Ticket 42: no ve sus grupos");
  await page.getByRole("button", { name: "Entrar como (solo lectura)" }).click();
  await page.waitForURL(`**${school}`);
  await expect(page.getByText("Modo soporte de Podium · solo lectura.")).toBeVisible();

  // Nada se puede guardar en modo soporte.
  await page.goto(`${school}/configuracion/cobros`);
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Intento");
  await page.locator('input[name="monthlyAmount"]').fill("1000");
  await page.getByRole("button", { name: "Crear tarifa" }).click();
  await expect(page.getByText(/No tienes permiso|Solo el propietario/)).toBeVisible();

  await page.getByRole("button", { name: "Salir del modo soporte" }).click();
  await page.waitForURL("**/admin/escuelas/**");
  const audit = page.getByLabel("Auditoría reciente");
  await expect(audit.getByText("platform.support_access")).toBeVisible();
  await expect(audit.getByText("platform.trial_extended")).toBeVisible();
});
