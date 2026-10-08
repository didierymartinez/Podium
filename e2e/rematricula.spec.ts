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

test("re-matrícula anual: cobro por familia y confirmación de datos", async ({ page, browser }) => {
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
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Restrepo");

  await page.goto(`${school}/alumnos`);
  await page.getByRole("link", { name: "Re-matrícula" }).click();
  await page.getByLabel("Año").fill("2099");
  await page.getByLabel("Valor de la re-matrícula").fill("150000");
  await page.getByLabel("Vence").fill("2099-01-31");
  await page.getByRole("button", { name: "Lanzar re-matrícula" }).click();
  await expect(page.getByText("Re-matrícula lanzada: 1 alumnos, 1 cuentas")).toBeVisible();
  const campaign = page.getByRole("list", { name: "Re-matrícula 2099" });
  await expect(campaign.getByText("Sin confirmar")).toBeVisible();

  await family.goto(`${school}/mis-datos`);
  const card = family.getByLabel("Re-matrícula");
  await expect(card).toContainText("Re-matrícula 2099");
  await card.getByRole("button", { name: "Mis datos están al día" }).click();
  // Al confirmar, la tarjeta de re-matrícula desaparece.
  await expect(card).toBeHidden();

  await page.reload();
  await expect(campaign.getByText("Datos ok")).toBeVisible();
  await family.goto(`${school}/mis-pagos`);
  await expect(family.getByText("$ 150.000").first()).toBeVisible();
});
