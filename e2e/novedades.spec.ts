import { expect, test } from "@playwright/test";
import {
  acceptInviteAsNewUser,
  createFeePlans,
  createGroup,
  createSchool,
  fillNewAthlete,
  generateInviteLink,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("excusa del acudiente, novedad médica y clase de reposición", async ({ page, browser }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  await createGroup(page, school, "Grupo B", 10, "Mensual · $ 100.000");
  await fillNewAthlete(page, school, {
    firstName: "Mateo",
    birthDate: "2014-01-01",
    guardianPhone: randomPhone(),
    group: "Grupo B",
  });
  await saveAthlete(page);
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Grupo A",
  });
  await saveAthlete(page);
  const athletePath = new URL(page.url()).pathname;
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Restrepo");

  // La familia avisa que Sofía no asistirá a su próxima clase.
  await family.goto(`${school}/mis-hijos`);
  const classes = family.getByRole("list", { name: "Próximas clases de Sofía" });
  const first = classes.getByRole("listitem").first();
  const sessionId = await first.getAttribute("data-session-id");
  await first.getByRole("button", { name: "No asistirá" }).click();
  await first.getByLabel("Motivo").fill("Cita médica");
  await first.getByRole("button", { name: "Avisar" }).click();
  await expect(family.getByText("Le avisamos al profesor")).toBeVisible();
  await expect(first.getByText("Avisaste que no asiste")).toBeVisible();

  // La escuela la ve pre-marcada, reporta una novedad médica y suma una reposición.
  await page.goto(`${school}/asistencia/${sessionId}`);
  await expect(page.getByText("Excusa del acudiente: Cita médica")).toBeVisible();
  await page.getByRole("combobox", { name: "Alumno", exact: true }).selectOption({ label: "Sofía Restrepo" });
  await page.getByLabel("Novedad").fill("Esguince de tobillo");
  await page.getByLabel("Restricción").fill("No saltos por 2 semanas");
  await page.getByRole("button", { name: "Registrar novedad" }).click();
  await expect(page.getByLabel("Restricciones de Sofía Restrepo")).toContainText(
    "Esguince de tobillo: No saltos por 2 semanas",
  );

  await page.getByLabel("Alumno de otro grupo").selectOption({ label: "Mateo Restrepo · Grupo B" });
  await page.getByRole("button", { name: "Agregar reposición" }).click();
  await expect(page.getByRole("list", { name: "Alumnos" }).getByText("Reposición")).toBeVisible();

  // En la ficha del alumno se da de alta.
  await page.goto(athletePath);
  const injuries = page.getByRole("list", { name: "Lesiones y restricciones" });
  await expect(injuries.getByText("Vigente")).toBeVisible();
  await injuries.getByRole("button", { name: "Dar de alta hoy" }).click();
  await expect(injuries.getByText(/^Alta /)).toBeVisible();
});
