import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("estructura deportiva: niveles, categorías, modalidades y pruebas", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await page.goto(`${school}/configuracion`);
  await page.getByRole("link", { name: "Deportivo" }).click();

  const levels = page.getByRole("list", { name: "Niveles de Velocidad" });
  await expect(levels.getByRole("listitem")).toHaveCount(5);
  await page.getByRole("button", { name: "Nivel", exact: true }).click();
  await page.getByLabel("Nombre del nivel").fill("Élite");
  await page.getByRole("button", { name: "Guardar nivel" }).click();
  await expect(levels.getByRole("listitem")).toHaveCount(6);
  await page.getByRole("button", { name: "Subir Élite" }).click();
  await expect(levels.getByRole("listitem").nth(4)).toContainText("Élite");
  await page.getByRole("button", { name: "Eliminar Élite" }).click();
  await expect(levels.getByRole("listitem")).toHaveCount(5);

  await page.getByRole("button", { name: "Categoría", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Sub-12");
  await page.getByLabel("Desde (años)").fill("10");
  await page.getByLabel("Hasta (años)").fill("12");
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await expect(page.getByText(/Se cruza con la categoría/)).toBeVisible();

  await page.getByRole("button", { name: "Artístico" }).click();
  await expect(page.getByRole("list", { name: "Niveles de Artístico" })).toBeVisible();

  await page.getByRole("button", { name: "Prueba", exact: true }).click();
  await page.getByLabel("Nombre de la prueba").fill("Rutina libre");
  await page.getByLabel("Tipo").selectOption("SCORE");
  await page.getByLabel("Unidad").fill("pts");
  await page.getByLabel("Mejor marca").selectOption("higher");
  await page.getByRole("button", { name: "Guardar prueba" }).click();
  await expect(page.getByRole("list", { name: "Pruebas de Pista" }).getByText("Rutina libre")).toBeVisible();
});
