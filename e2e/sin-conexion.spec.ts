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

test("el profesor marca sin señal y se sincroniza al volver la conexión", async ({ page, browser }) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${pad(Math.max(hour - 1, 0))}:00`;
  const end = `${pad(Math.min(hour + 1, 23))}:59`;

  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación", "120000"]]);
  const coachPage = await createCoach(page, school, "Juan", "Pérez");
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Pista");
  await page.locator('select[name="headCoachId"]').selectOption({ label: "Juan Pérez" });
  const days = page.getByLabel("Día", { exact: true });
  while ((await days.count()) < 7) await page.getByRole("button", { name: "Agregar día" }).click();
  for (let i = 0; i < 7; i++) {
    await days.nth(i).selectOption(String(i));
    await page.getByLabel("Desde").nth(i).fill(start);
    await page.getByLabel("Hasta").nth(i).fill(end);
  }
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Pista",
  });
  await saveAthlete(page);
  await page.goto(coachPage);
  const link = await generateInviteLink(page);

  const ctx = await browser.newContext();
  const coach = await ctx.newPage();
  await acceptInviteAsNewUser(coach, link, "Juan Pérez");

  // Con señal: abre la asistencia del día (el service worker guarda las listas).
  await coach.goto(`${school}/asistencia`);
  await coach.evaluate(() => navigator.serviceWorker.ready);
  await coach.reload();
  await expect.poll(() => coach.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const sessionLink = coach.getByRole("link", { name: /Pista/ });
  const href = (await sessionLink.getAttribute("href"))!;
  await coach.goto(href);
  await expect(coach.getByRole("button", { name: "Guardar asistencia" })).toBeVisible();

  // Sin señal: recarga desde el celular, marca y guarda.
  await ctx.setOffline(true);
  await coach.reload();
  await expect(coach.getByText("Sin conexión.")).toBeVisible();
  await coach.getByRole("button", { name: "Todos presentes" }).click();
  await coach.getByRole("button", { name: "Guardar asistencia" }).click();
  await expect(coach.getByText("Pendiente de sincronizar.", { exact: true })).toBeVisible();
  await expect(coach.getByText("1 lista pendiente de sincronizar.")).toBeVisible();

  // Vuelve la señal: se envía sola.
  await ctx.setOffline(false);
  await coach.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(coach.getByText("Asistencia sincronizada")).toBeVisible({ timeout: 15_000 });

  // La administración la ve registrada.
  await page.goto(`${school}/asistencia`);
  await expect(page.getByText("Tomada · 1")).toBeVisible();
});
