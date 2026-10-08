import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("segundo deporte: escuela de natación con su plantilla y modalidad de patinaje adicional", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/nueva-escuela");
  await page.locator('input[name="name"]').fill(`Club E2E Nado ${Date.now().toString(36)}`);
  await page.locator('input[name="city"]').fill("Cali");
  await page.locator('select[name="discipline"]').selectOption({ label: "Natación · Formativa" });
  await page.locator('select[name="estimatedStudents"]').selectOption("31-80");
  await expect(page.getByText("✓ Disponible")).toBeVisible();
  await page.getByRole("button", { name: /Crear escuela/ }).click();
  await page.waitForURL(/\/club-e2e-[a-z0-9-]+$/);
  const school = new URL(page.url()).pathname;
  await expect(page.getByText("Natación · Formativa").first()).toBeVisible();

  await page.goto(`${school}/configuracion/deportivo`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Adaptación").first()).toBeVisible();
  await page.getByRole("button", { name: "Patinaje · Velocidad" }).click();
  await expect(page.getByRole("button", { name: "Patinaje · Velocidad" })).toHaveCount(0);

  await page.goto(`${school}/grupos/nuevo`);
  const options = page.locator('select[name="disciplineId"] option');
  await expect(options).toHaveText(["Natación · Formativa", "Patinaje · Velocidad"]);
});
