import { expect, test } from "@playwright/test";
import {
  acceptInviteAsNewUser,
  createFeePlans,
  createSchool,
  fillNewAthlete,
  generateInviteLink,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("check-in con QR: la familia marca la llegada desde el link de la clase", async ({ page, browser }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  // Clase todos los días a toda hora para que la ventana de check-in esté abierta.
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Todo el día");
  const days = page.getByLabel("Día", { exact: true });
  while ((await days.count()) < 7) await page.getByRole("button", { name: "Agregar día" }).click();
  for (let i = 0; i < 7; i++) {
    await days.nth(i).selectOption(String(i));
    await page.getByLabel("Desde").nth(i).fill("00:00");
    await page.getByLabel("Hasta").nth(i).fill("23:59");
  }
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Todo el día",
  });
  await saveAthlete(page);
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Gómez");

  await page.goto(`${school}/asistencia`);
  await page
    .getByRole("link", { name: /Todo el día/ })
    .first()
    .click();
  await page.waitForURL(/\/asistencia\/[0-9a-f-]{36}$/);
  const sessionPage = new URL(page.url()).pathname;
  const qr = page.getByLabel("Check-in con QR");
  await qr.getByText("Check-in con QR").click();
  await expect(qr.getByRole("img", { name: "Código QR de la clase" })).toBeVisible();
  const checkInUrl = new URL((await qr.getByLabel("Link de check-in").getAttribute("href"))!);

  // Un link sin firma válida no sirve.
  await family.goto(`${checkInUrl.pathname}?t=falso`);
  await expect(family.getByText("Este código no corresponde a una clase")).toBeVisible();

  await family.goto(checkInUrl.pathname + checkInUrl.search);
  await family.waitForLoadState("networkidle");
  await expect(family.getByRole("list", { name: "Alumnos en la clase" })).toContainText("Sofía Restrepo");
  await family.getByRole("button", { name: "Marcar llegada" }).click();
  await expect(family.getByText(/Llegada registrada/)).toBeVisible();

  await page.goto(sessionPage);
  await expect(page.getByLabel("Check-in con QR")).toContainText("1 llegada registrada");
});
