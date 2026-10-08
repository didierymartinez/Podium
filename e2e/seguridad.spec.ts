import { expect, test } from "@playwright/test";

test("registro rechaza emails temporales", async ({ page }) => {
  await page.goto("/registro");
  await page.getByLabel("Nombre completo").fill("Bot Falso");
  await page.getByLabel("Email").fill(`bot${Date.now()}@mailinator.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText("Usa un email permanente; no se aceptan emails temporales.")).toBeVisible();
  await expect(page).toHaveURL(/\/registro$/);
});
