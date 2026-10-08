import { expect, test, type Page } from "@playwright/test";
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

/** Hora actual en Bogotá; el horario del grupo cubre "ahora" para que el profesor pueda registrar. */
function classAroundNow() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${pad(Math.max(hour - 1, 0))}:00`, end: `${pad(Math.min(hour + 1, 23))}:59` };
}

/** Deja el grupo con clase los 7 días (incluye fines de semana y festivos). */
async function setEveryDaySchedule(page: Page, start: string, end: string) {
  const days = page.getByLabel("Día", { exact: true });
  while ((await days.count()) < 7) await page.getByRole("button", { name: "Agregar día" }).click();
  for (let i = 0; i < 7; i++) {
    await days.nth(i).selectOption(String(i));
    await page.getByLabel("Desde").nth(i).fill(start);
    await page.getByLabel("Hasta").nth(i).fill(end);
  }
}

test("el profesor toma la asistencia de hoy y el tablero lo refleja", async ({ page, browser }) => {
  const { start, end } = classAroundNow();
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación", "120000"]]);
  const coachPage = await createCoach(page, school, "Juan", "Pérez");

  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Todos los días");
  await page.locator('select[name="headCoachId"]').selectOption({ label: "Juan Pérez" });
  await setEveryDaySchedule(page, start, end);
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);

  for (const firstName of ["Sofía", "Tomás"]) {
    await fillNewAthlete(page, school, {
      firstName,
      birthDate: "2015-03-14",
      guardianPhone: randomPhone(),
      group: "Todos los días",
    });
    await saveAthlete(page);
  }

  await page.goto(coachPage);
  const coachLink = await generateInviteLink(page);
  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  await acceptInviteAsNewUser(coach, coachLink, "Juan Pérez");

  // Inicio del profesor: acceso directo a la clase de hoy.
  await expect(coach.getByRole("heading", { name: "Clases de hoy" })).toBeVisible();
  await coach.getByRole("link", { name: /Todos los días/ }).click();
  await coach.waitForURL(/\/asistencia\/[0-9a-f-]{36}$/);

  await coach.getByRole("button", { name: "Todos presentes" }).click();
  await coach
    .getByRole("radiogroup", { name: "Asistencia de Tomás Restrepo" })
    .getByRole("radio", { name: "Excusa" })
    .click();
  await coach.getByLabel("Motivo de la excusa de Tomás Restrepo").fill("Cita médica");
  await coach.getByRole("button", { name: "Guardar asistencia" }).click();
  await expect(coach.getByText("Asistencia guardada (2)")).toBeVisible();
  await expect(coach.getByText("Tomada · 2")).toBeVisible();

  // El profesor no administra la escuela.
  await coach.goto(`${school}/configuracion/calendario`);
  await expect(coach.getByRole("heading", { name: "Sin acceso" })).toBeVisible();

  // La administración ve la clase tomada en el tablero y en la asistencia del día.
  await page.goto(school);
  await expect(page.getByTitle(/Todos los días · .* · asistencia tomada/)).toBeVisible();
  await page.goto(`${school}/asistencia`);
  await expect(page.getByText("Tomada · 2")).toBeVisible();

  // Cancelar la clase de mañana (p. ej. por lluvia) y restablecerla.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(tomorrow);
  await page.goto(`${school}/asistencia?fecha=${iso}`);
  await page.getByRole("link", { name: /Todos los días/ }).click();
  await page.getByLabel("Motivo", { exact: true }).fill("Lluvia");
  await page.getByRole("button", { name: "Cancelar clase" }).click();
  await expect(page.getByText("Clase cancelada: Lluvia. No se toma asistencia.")).toBeVisible();
  await page.getByRole("button", { name: "Restablecer clase" }).click();
  await expect(page.getByRole("button", { name: "Cancelar clase" })).toBeVisible();
});

test("los festivos son referencia y los días sin clase se configuran", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await page.goto(`${school}/configuracion/calendario`);
  await expect(page.getByRole("heading", { name: "Festivos de Colombia" })).toBeVisible();

  const holidays = page.getByRole("list", { name: "Festivos" });
  const firstHoliday = holidays.getByRole("listitem").first();
  const holidayName = (await firstHoliday.locator("p").first().textContent())!.trim();
  await firstHoliday.getByRole("button", { name: /Marcar sin clase/ }).click();
  await expect(firstHoliday.getByText("Sin clase")).toBeVisible();
  const closures = page.getByRole("list", { name: "Días sin clase" });
  await expect(closures.getByText(holidayName)).toBeVisible();

  await closures.getByRole("button", { name: `Quitar ${holidayName}` }).click();
  await expect(closures.getByText("No hay días sin clase programados.")).toBeVisible();

  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(Date.now() + 30 * 86_400_000),
  );
  await page.locator('input[name="startDate"]').fill(iso);
  await page.locator('input[name="reason"]').fill("Vacaciones de mitad de año");
  await page.getByRole("button", { name: "Agregar días sin clase" }).click();
  await expect(closures.getByText("Vacaciones de mitad de año")).toBeVisible();
});
