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

test("marcas: cronómetro, registro en lote, mejor marca y objetivo por categoría", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  await fillNewAthlete(page, school, {
    firstName: "Ana",
    birthDate: "2015-06-01",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  const sofiaPage = new URL(page.url()).pathname;

  // Objetivo para la categoría Infantil.
  await page.goto(`${school}/configuracion/deportivo`);
  await page.getByLabel("Prueba objetivo").selectOption({ label: "500 m sprint" });
  await page.getByLabel("Categoría objetivo").selectOption({ label: "Infantil" });
  await page.getByLabel("Marca objetivo").fill("38");
  await page.getByRole("button", { name: "Guardar objetivo" }).click();
  await expect(page.getByRole("list", { name: "Marcas objetivo" })).toContainText("500 m sprint · Infantil");

  await page.goto(school);
  await page.getByRole("link", { name: "Marcas" }).first().click();
  await page.getByLabel("Prueba").selectOption({ label: "500 m sprint" });
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await page.getByRole("button", { name: "Llegó Sofía Restrepo" }).click();
  await page.getByRole("button", { name: "Detener" }).click();
  await expect(page.getByLabel("Marca de Sofía Restrepo")).not.toHaveValue("");
  await page.getByLabel("Marca de Sofía Restrepo").fill("45,50");
  await page.getByLabel("Marca de Ana Restrepo").fill("48");
  await page.getByRole("button", { name: "Guardar marcas" }).click();
  await expect(page.getByText("2 marcas guardadas.")).toBeVisible();

  await page.getByLabel("Prueba").selectOption({ label: "500 m sprint" });
  await page.getByLabel("Marca de Sofía Restrepo").fill("40");
  await page.getByRole("button", { name: "Guardar marcas" }).click();
  await expect(page.getByText(/Nuevas mejores marcas: Sofía Restrepo \(40,00 s\)/)).toBeVisible();

  await page.goto(sofiaPage);
  const perf = page.getByRole("list", { name: "Rendimiento" });
  await expect(perf.getByText("Mejor marca 40,00 s")).toBeVisible();
  await expect(perf.getByText("Objetivo 38,00 s · 95 %")).toBeVisible();
  await expect(perf.getByText(/Categoría Infantil: promedio/)).toBeVisible();
});
