import { expect, test } from "@playwright/test";

test("la página inicial presenta Podium: secciones, segmentos, precios y preguntas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tu escuela, al día.");
  for (const id of ["que-es", "beneficios", "para-quien", "precios", "preguntas"]) {
    await expect(page.locator(`section#${id}`)).toBeAttached();
  }
  // Pestañas de "Para quién".
  await page.getByRole("tab", { name: "Natación" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Reposición de clases");
  // Precios desde los planes.
  await expect(page.locator("#precios").getByText("Semilla")).toBeVisible();
  // Preguntas desplegables.
  await page.getByText("¿Necesito instalar algo?").click();
  await expect(page.getByText(/sin pasar por tiendas/)).toBeVisible();
  // Llamados a la acción llevan al registro.
  await page.getByRole("link", { name: /Prueba gratis 30 días/ }).click();
  await page.waitForURL("**/registro");
});
