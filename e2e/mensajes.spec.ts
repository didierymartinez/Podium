import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("WhatsApp de la escuela: conexión del número y bandeja de mensajes", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);

  await page.goto(school);
  await page.getByRole("link", { name: "Mensajes" }).first().click();
  await expect(page.getByText("Conecta el número de WhatsApp de la escuela")).toBeVisible();
  await expect(page.getByRole("list", { name: "Conversaciones" })).toContainText("Aún no hay mensajes.");

  await page.goto(`${school}/configuracion/comunicaciones`);
  await page.waitForLoadState("networkidle");
  const card = page.getByLabel("Número de WhatsApp de la escuela");
  // Validación local (no llama a Meta).
  await card.getByLabel("Id del número de teléfono").fill("abc");
  await card.getByLabel("Id de la cuenta de WhatsApp Business").fill("123456789");
  await card.getByLabel("Token de acceso permanente").fill("EAAG-token-de-prueba-123456");
  await card.getByRole("button", { name: "Conectar número" }).click();
  await expect(card.getByText("Escribe el id del número (solo dígitos)")).toBeVisible();
});
