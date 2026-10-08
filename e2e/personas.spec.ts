import { expect, test } from "@playwright/test";
import { createFeePlans, createGroup, createSchool, fillNewAthlete, saveAthlete, signUp } from "./helpers";

const phone = () => `31${Math.floor(1e7 + Math.random() * 9e7)}`;

test("grupos validan cruces de horario", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Competencia 5 días", "180000"]]);

  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Competencia");
  const days = page.getByLabel("Día", { exact: true });
  await days.nth(0).selectOption("1");
  await days.nth(1).selectOption("1");
  await page.getByLabel("Desde").nth(1).fill("17:00");
  await page.getByLabel("Hasta").nth(1).fill("19:00");
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.getByText("Hay horarios que se cruzan el martes")).toBeVisible();

  await page.getByRole("button", { name: "Quitar día" }).nth(1).click();
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
  await expect(page.getByText("Mar y Vie · 4:00 p. m. – 6:00 p. m.")).toBeVisible();
});

test("alumnos: hermanos, cupo, estados de matrícula y responsable de pago", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación 3 días", "120000"]]);
  await createGroup(page, school, "Iniciación tarde", 2, "Iniciación 3 días · $ 120.000");
  const laura = phone();

  await fillNewAthlete(page, school, { firstName: "Sofía", birthDate: "2015-03-14", guardianPhone: laura });
  await expect(page.getByText("11 años · menor de edad")).toBeVisible();
  await saveAthlete(page);
  await expect(page.getByText("Categoría Infantil")).toBeVisible();
  await expect(page.getByText("Asma leve, usa inhalador")).toBeVisible();

  // Hermano: el mismo celular reutiliza al acudiente.
  await fillNewAthlete(page, school, {
    firstName: "Tomás",
    birthDate: "2018-06-01",
    guardianPhone: laura,
    useExistingGuardian: true,
  });
  await saveAthlete(page);

  // Grupo lleno → sobrecupo explícito.
  await fillNewAthlete(page, school, {
    firstName: "Mateo",
    birthDate: "2016-01-20",
    guardianPhone: phone(),
    group: "Iniciación tarde (lleno)",
  });
  await page.getByRole("button", { name: "Guardar alumno" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El grupo está lleno" })).toBeVisible();
  await page.locator('input[name="enrollment.allowOverCapacity"]').check();
  await saveAthlete(page);

  // Congelar, retirar y reactivar.
  await page.getByRole("button", { name: "Congelar" }).click();
  await page.locator('input[name="frozenUntil"]').fill("2099-12-15");
  await page.getByRole("button", { name: "Congelar matrícula" }).click();
  await expect(page.getByText(/Congelada hasta el 15 de diciembre de 2099/)).toBeVisible();
  await page.getByRole("button", { name: "Retirar" }).click();
  await page.locator('select[name="reason"]').selectOption("SCHEDULE");
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(page.getByText(/Retirado el .* · Horario/)).toBeVisible();
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.locator("span", { hasText: /^Activo$/ })).toBeVisible();

  // Otro acudiente que pasa a ser el responsable de pago.
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.locator('input[name="guardian.phone"]').fill(phone());
  await page.locator('input[name="guardian.firstName"]').fill("Carlos");
  await page.locator('input[name="guardian.lastName"]').fill("Restrepo");
  await page.locator('select[name="guardian.relationship"]').selectOption("FATHER");
  await page.getByRole("button", { name: "Agregar acudiente" }).click();
  await page.getByRole("button", { name: "Hacer a Carlos Restrepo responsable de pago" }).click();
  await expect(page.locator("li", { hasText: "Responsable de pago" })).toContainText("Carlos Restrepo");

  // Listados.
  await page.goto(`${school}/alumnos`);
  await expect(page.locator("ul.divide-y > li")).toHaveCount(3);
  await page.goto(`${school}/alumnos?q=tom`);
  await expect(page.locator("ul.divide-y > li")).toHaveCount(1);
  await page.goto(`${school}/acudientes`);
  await expect(page.locator("li", { hasText: "Laura Gómez" }).first()).toContainText("Tomás Restrepo");

  // El tablero del inicio muestra las clases del grupo.
  await page.goto(school);
  await expect(page.getByText("4–6pm").first()).toBeVisible();
  await expect(page.getByText(`Iniciación · 3/2`)).toBeVisible();
});
