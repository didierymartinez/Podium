import { expect, test } from "@playwright/test";
import {
  createFeePlans,
  createGroup,
  createSchool,
  fillNewAthlete,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("insignias: récord personal automático y configuración por escuela", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  const sofiaPage = new URL(page.url()).pathname;
  await expect(page.getByLabel("Insignias")).toContainText("Aún no tiene insignias");

  // La escuela puede apagar insignias; el récord personal queda activo.
  await page.goto(`${school}/configuracion/deportivo`);
  await page.getByRole("checkbox", { name: /Aniversario/ }).uncheck();
  await page.getByRole("button", { name: "Guardar insignias" }).click();
  await expect(page.getByText("Insignias actualizadas.")).toBeVisible();

  // Dos marcas: la segunda supera a la primera.
  await page.goto(`${school}/marcas`);
  await page.getByLabel("Prueba").selectOption({ label: "500 m sprint" });
  await page.getByLabel("Marca de Sofía Restrepo").fill("50");
  await page.getByRole("button", { name: "Guardar marcas" }).click();
  await expect(page.getByText("1 marcas guardadas.")).toBeVisible();
  await page.getByLabel("Prueba").selectOption({ label: "500 m sprint" });
  await page.getByLabel("Marca de Sofía Restrepo").fill("47");
  await page.getByRole("button", { name: "Guardar marcas" }).click();
  await expect(page.getByText(/Nuevas mejores marcas/)).toBeVisible();

  await page.goto(sofiaPage);
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel("Insignias")).toContainText("Récord personal en 500 m sprint", {
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
});
