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

test("rutina individual: el profesor la asigna, la familia registra el entreno y se ve el progreso", async ({
  page,
  browser,
}) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Competencia", 10, "Mensual · $ 100.000");
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2010-03-14",
    guardianPhone: randomPhone(),
    group: "Competencia",
  });
  await saveAthlete(page);
  const sofiaPage = new URL(page.url()).pathname;
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Gómez");

  await page.goto(sofiaPage);
  await page.waitForLoadState("networkidle");
  const card = page.getByLabel("Rutina y entrenos");
  await card.getByRole("button", { name: "Crear rutina" }).click();
  const builder = card.getByRole("form", { name: "Editar rutina" });
  await builder.getByLabel("Nombre de la rutina").fill("Fuerza de pretemporada");
  await builder.getByLabel("Ejercicio 1 del día 1").fill("Sentadilla");
  await builder.getByLabel("Series").fill("2");
  await builder.getByLabel("Repeticiones").fill("8");
  await builder.getByLabel("Peso (kg)").fill("40");
  await builder.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(card.getByText("Rutina guardada.")).toBeVisible();
  await expect(card).toContainText("Sentadilla: 2 × 8 · 40 kg");

  await family.goto(`${school}/mis-hijos`);
  await family.waitForLoadState("networkidle");
  const routine = family.getByLabel("Rutina de Sofía");
  await expect(routine).toContainText("Fuerza de pretemporada");
  await routine.getByLabel("Repeticiones de Sentadilla serie 1").fill("8");
  await routine.getByLabel("Peso de Sentadilla serie 1").fill("40");
  await routine.getByLabel("Repeticiones de Sentadilla serie 2").fill("6");
  await routine.getByLabel("Peso de Sentadilla serie 2").fill("45");
  await routine.getByRole("button", { name: "Guardar entreno" }).click();
  await expect(routine.getByText("Entreno registrado.")).toBeVisible();
  await expect(routine).toContainText("1RM estimado: 54 kg");

  await page.reload();
  await expect(page.getByRole("list", { name: "Entrenos registrados" })).toContainText(
    "registrado por la familia",
  );
});
