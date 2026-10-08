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

test("valoración inicial y composición corporal con permiso del acudiente", async ({ page, browser }) => {
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
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Gómez");

  // Valoración inicial en la ficha; sin permiso no hay formulario de medidas.
  await page.goto(sofiaPage);
  const card = page.getByLabel("Valoración y composición corporal");
  await card.getByLabel("Objetivos").fill("Competir en la válida departamental");
  await card.getByRole("textbox", { name: /^Antecedentes de salud/ }).fill("Asma leve");
  await card.getByRole("button", { name: "Guardar valoración" }).click();
  await expect(card.getByText("Valoración guardada.")).toBeVisible();
  await expect(card).toContainText("Sin permiso del acudiente");
  await expect(card.getByLabel("Nueva medición")).toHaveCount(0);

  // La familia da el permiso desde Mis hijos y no ve los antecedentes de salud.
  await family.goto(`${school}/mis-hijos`);
  await family.waitForLoadState("networkidle");
  const familyCard = family.getByLabel("Valoración de Sofía");
  await expect(familyCard).toContainText("Competir en la válida departamental");
  await expect(familyCard).not.toContainText("Asma leve");
  await familyCard.getByRole("button", { name: "Dar permiso" }).click();
  await expect(familyCard.getByText("Permiso registrado.")).toBeVisible();

  // Con el permiso, la escuela registra una medición InBody.
  await page.reload();
  await expect(card).toContainText("por el acudiente");
  const form = card.getByLabel("Nueva medición");
  await form.getByLabel("Peso (kg)").fill("38,5");
  await form.getByLabel("Grasa corporal (%)").fill("18,4");
  await form.getByLabel("Masa muscular esquelética (kg)").fill("15,2");
  await form.getByRole("button", { name: "Guardar medición" }).click();
  await expect(card.getByText("Medición guardada.")).toBeVisible();
  await expect(card.getByRole("list", { name: "Mediciones" })).toContainText("Peso 38,5 kg");

  await family.reload();
  await expect(family.getByLabel("Valoración de Sofía")).toContainText("Peso: 38,5 kg");
});
