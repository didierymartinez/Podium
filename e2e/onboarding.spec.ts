import { expect, test } from "@playwright/test";
import { createSchool, signUp, uniq } from "./helpers";

test("registro exige términos, crea escuela en prueba y permite salir", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Crea tu escuela gratis" }).click();
  await page.locator('input[name="name"]').fill("Ana Restrepo");
  await page.locator('input[name="email"]').fill(`e2e-${uniq()}@example.com`);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Debes aceptar los términos" })).toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/escuelas");
  await expect(page.getByText("Aún no tienes escuelas")).toBeVisible();

  const school = await createSchool(page);
  await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
  await expect(page.getByText("Prueba gratis · 30 días")).toBeVisible();
  await expect(page.getByText("Fin de la prueba gratis")).toBeVisible();

  await page.goto("/escuelas");
  await expect(page.locator(`a[href="${school}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL("/");
  await page.goto("/escuelas");
  await expect(page).toHaveURL(/\/ingresar$/);
});

test("valida la URL de la escuela", async ({ page }) => {
  await signUp(page);
  await page.goto("/nueva-escuela");
  await page.locator('input[name="name"]').fill("Registro");
  await expect(page.getByText("Esa URL está reservada")).toBeVisible();
  await page.locator('input[name="slug"]').fill("Club Malo");
  await expect(page.getByText(/Usa solo letras minúsculas/)).toBeVisible();
});
