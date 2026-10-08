import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("facturación electrónica: la escuela ve la conexión con Alegra y sus validaciones", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await page.goto(`${school}/configuracion/cobros`);
  await page.waitForLoadState("networkidle");
  const card = page.getByLabel("Facturación electrónica");
  await expect(card).toContainText("Facturación electrónica DIAN");
  // Validación local (no llama a Alegra): correo inválido.
  await card.getByLabel("Correo de Alegra").fill("no-es-correo");
  await card.getByLabel("Token de la API").fill("token-de-prueba");
  await card.getByLabel("Id del ítem de servicio").fill("5");
  await card.getByRole("button", { name: "Conectar Alegra" }).click();
  await expect(card.getByText("Escribe el correo de la cuenta de Alegra")).toBeVisible();
});
