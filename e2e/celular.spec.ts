import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("navegación en celular", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);

  // Barra superior: el nombre de la escuela es visible y el botón de escritorio no.
  const header = page.locator("header");
  await expect(header.getByText(/Club E2E/)).toBeVisible();
  await expect(header.getByRole("link", { name: "Agregar alumno" })).toBeHidden();

  // Sin desborde horizontal.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Navegación inferior.
  const bottomNav = page.getByRole("navigation", { name: "Secciones" }).last();
  await bottomNav.getByRole("link", { name: "Alumnos" }).click();
  await page.waitForURL(`**${school}/alumnos`);
  await bottomNav.getByRole("link", { name: "Ajustes" }).click();
  await page.waitForURL(`**${school}/configuracion`);
  await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
});
