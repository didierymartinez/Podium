import { expect, test } from "@playwright/test";
import { createSchool, signUp, uniq } from "./helpers";

test("registro con aviso de términos (sin casilla), crea escuela en prueba y permite salir", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Prueba gratis 30 días/ }).click();
  await page.locator('input[name="name"]').fill("Ana Restrepo");
  await page.locator('input[name="email"]').fill(`e2e-${uniq()}@example.com`);
  // Aceptación por clic: el aviso enlaza términos y privacidad y no hay casilla que bloquee.
  await expect(page.getByText(/Al crear tu cuenta o continuar con Google aceptas/)).toBeVisible();
  await expect(page.getByRole("link", { name: "política de privacidad" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
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

test("ingresar con una cuenta nueva entra directo con el aviso de términos", async ({ page }) => {
  await page.goto("/ingresar");
  await expect(page.getByText(/Si es tu primera vez en Podium, al ingresar aceptas/)).toBeVisible();
  await page.locator('input[name="email"]').fill(`e2e-${uniq()}@example.com`);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/escuelas");
});
