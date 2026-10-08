import { expect, test } from "@playwright/test";
import {
  acceptInviteAsNewUser,
  createCoach,
  createFeePlans,
  createSchool,
  fillNewAthlete,
  generateInviteLink,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("profesor y acudiente reciben su invitación y ven solo lo suyo", async ({ page, browser }) => {
  // Escuela con profesor titular, grupo y alumna.
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación 3 días", "120000"]]);
  const coachPage = await createCoach(page, school, "Juan", "Pérez");

  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Iniciación tarde");
  await page.locator('select[name="headCoachId"]').selectOption({ label: "Juan Pérez" });
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
  await expect(page.getByText("Juan Pérez", { exact: true })).toBeVisible();

  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
  });
  await saveAthlete(page);
  await expect(page.getByText("Sin invitar")).toBeVisible();

  // Acudiente.
  const guardianLink = await generateInviteLink(page);
  await page.reload();
  await expect(page.getByText("Invitación enviada")).toBeVisible();

  const guardianCtx = await browser.newContext();
  const guardian = await guardianCtx.newPage();
  await guardian.goto(guardianLink);
  await expect(guardian.getByText(/te invita a Podium/)).toBeVisible();
  await expect(guardian.getByText(/las clases, la asistencia y los pagos de Sofía/)).toBeVisible();
  await acceptInviteAsNewUser(guardian, guardianLink, "Laura Gómez");
  await expect(guardian.getByRole("heading", { name: "Mis hijos" })).toBeVisible();
  await expect(guardian.getByText("Sofía Restrepo")).toBeVisible();
  await expect(guardian.getByText("Iniciación tarde")).toBeVisible();
  // Sin acceso a administración.
  await expect(guardian.getByRole("link", { name: "Alumnos" })).toHaveCount(0);
  await guardian.goto(`${school}/alumnos`);
  await expect(guardian.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
  await guardian.goto(`${school}/configuracion/cobros`);
  await expect(guardian.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
  // El link ya no sirve.
  await guardian.goto(guardianLink);
  await expect(guardian.getByText("Esta invitación ya fue aceptada.")).toBeVisible();

  // La escuela ve el avance.
  await page.goto(`${school}/invitaciones`);
  await expect(page.getByText("1 de 1")).toBeVisible();
  await expect(page.getByText("Todas las familias ya tienen cuenta.")).toBeVisible();

  // Profesor.
  await page.goto(coachPage);
  const coachLink = await generateInviteLink(page);
  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  await acceptInviteAsNewUser(coach, coachLink, "Juan Pérez");
  await expect(coach.getByRole("heading", { name: "Mis grupos" })).toBeVisible();
  await expect(coach.getByText("Titular")).toBeVisible();
  await expect(coach.getByText("Sofía Restrepo")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Con cuenta")).toBeVisible();
});

test("detecta cruces de horario del profesor y reenviar invalida el link anterior", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  const coachPage = await createCoach(page, school, "Ana", "Ruiz");

  for (const name of ["Grupo A", "Grupo B"]) {
    await page.goto(`${school}/grupos/nuevo`);
    await page.locator('input[name="name"]').fill(name);
    await page.locator('select[name="headCoachId"]').selectOption({ label: "Ana Ruiz" });
    await page.getByRole("button", { name: "Crear grupo" }).click();
    await page.waitForURL(`**${school}/grupos`);
  }
  await expect(
    page.getByText("Ana Ruiz tiene Grupo A y Grupo B al mismo tiempo el lunes").first(),
  ).toBeVisible();
  await page.goto(`${school}/profesores`);
  await expect(page.getByText("Cruce de horario")).toBeVisible();

  await page.goto(coachPage);
  const first = await generateInviteLink(page);
  const second = await generateInviteLink(page);
  expect(first).not.toBe(second);
  await page.goto(first);
  await expect(page.getByText(/reemplazada por una más reciente/)).toBeVisible();
  await page.goto(second);
  await expect(page.getByText(/te invita a Podium/)).toBeVisible();
});
