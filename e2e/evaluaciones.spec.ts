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

test("evaluaciones: rúbrica, propuesta, aprobación con grupos sugeridos y certificado", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  // Grupo del nivel siguiente para la sugerencia.
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Grupo B");
  await page.locator('input[name="capacity"]').fill("10");
  await page.locator('select[name="levelId"]').selectOption({ label: "2. Formación" });
  await page.locator('select[name="defaultFeePlanId"]').selectOption({ label: "Mensual · $ 100.000" });
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  const sofiaPage = new URL(page.url()).pathname;

  // Rúbrica editable por nivel.
  await page.goto(`${school}/configuracion/deportivo`);
  await page.getByLabel("Nivel de la rúbrica").selectOption({ label: "Iniciación" });
  await page.getByLabel("Nuevo criterio").fill("Equilibrio en un pie");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("list", { name: "Criterios del nivel" })).toContainText("Equilibrio en un pie");

  await page.goto(school);
  await page.getByRole("link", { name: "Evaluaciones" }).first().click();
  await page
    .getByRole("navigation", { name: "Alumnos del grupo" })
    .getByRole("link", { name: "Sofía Restrepo" })
    .click();
  const form = page.getByLabel("Evaluación de Sofía Restrepo");
  await expect(form).toContainText("Nivel Iniciación");
  const groups = form.getByRole("radiogroup");
  const count = await groups.count();
  expect(count).toBe(5);
  for (let i = 0; i < count; i++) await groups.nth(i).getByRole("radio", { name: /^4 ·/ }).click();
  await page.getByLabel("Fortalezas").fill("Muy buena postura");
  await page.getByLabel("Aspectos a mejorar").fill("Frenado a velocidad");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(page.getByText(/quedó como propuesta de promoción/)).toBeVisible();

  const proposals = page.getByRole("list", { name: "Propuestas de promoción" });
  await expect(proposals).toContainText("Iniciación → Formación");
  await proposals.getByRole("button", { name: "Aprobar promoción de Sofía Restrepo" }).click();
  await expect(page.getByText("Sofía Restrepo subió a Formación.", { exact: false })).toBeVisible();
  await expect(page.getByText(/Grupos sugeridos: Grupo B/)).toBeVisible();

  await page.goto(sofiaPage);
  const card = page.getByLabel("Nivel y evaluaciones");
  await expect(card).toContainText("Nivel actual: Formación");
  await expect(card).toContainText("Muy buena postura");
  const certificate = card.getByRole("link", { name: "Certificado de nivel Iniciación" });
  const href = (await certificate.getAttribute("href"))!;
  const result = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { status: r.status, type: r.headers.get("content-type") };
  }, href);
  expect(result).toEqual({ status: 200, type: "application/pdf" });
});
