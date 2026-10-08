import { expect, type Page } from "@playwright/test";

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registro con autenticación "dev" (solo email). Termina en /escuelas. */
export async function signUp(page: Page, name = "Ana Restrepo") {
  const email = `e2e-${uniq()}@example.com`;
  await page.goto("/registro");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/escuelas");
  return email;
}

/** Crea una escuela y devuelve su ruta ("/club-…"). */
export async function createSchool(page: Page, name = `Club E2E ${uniq()}`) {
  await page.goto("/nueva-escuela");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="city"]').fill("Medellín");
  await page.locator('select[name="estimatedStudents"]').selectOption("31-80");
  await expect(page.getByText("✓ Disponible")).toBeVisible();
  await page.getByRole("button", { name: /Crear escuela/ }).click();
  await page.waitForURL(/\/club-e2e-[a-z0-9-]+$/);
  return new URL(page.url()).pathname;
}

/** Crea tarifas en Configuración → Cobros. */
export async function createFeePlans(page: Page, school: string, plans: [string, string][]) {
  await page.goto(`${school}/configuracion/cobros`);
  for (const [i, [name, amount]] of plans.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Nueva tarifa" }).click();
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="monthlyAmount"]').fill(amount);
    await page.getByRole("button", { name: "Crear tarifa" }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
}

/** Crea un grupo con el horario por defecto (Lun-Mié-Vie 4–6 p. m.). */
export async function createGroup(
  page: Page,
  school: string,
  name: string,
  capacity: number,
  feePlanLabel: string,
) {
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="capacity"]').fill(String(capacity));
  await page.locator('select[name="defaultFeePlanId"]').selectOption({ label: feePlanLabel });
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);
}

type NewAthlete = {
  firstName: string;
  birthDate: string;
  guardianPhone: string;
  guardianName?: [string, string];
  group?: string;
  useExistingGuardian?: boolean;
};

/** Llena el formulario de nuevo alumno (no envía). */
export async function fillNewAthlete(page: Page, school: string, a: NewAthlete) {
  await page.goto(`${school}/alumnos/nuevo`);
  await page.locator('input[name="athlete.firstName"]').fill(a.firstName);
  await page.locator('input[name="athlete.lastName"]').fill("Restrepo");
  await page.locator('input[name="athlete.birthDate"]').fill(a.birthDate);
  await page.locator('textarea[name="athlete.medicalNotes"]').fill("Asma leve, usa inhalador");
  await page.locator('input[name="guardian.phone"]').fill(a.guardianPhone);
  if (a.useExistingGuardian) {
    await expect(page.getByText("Este celular ya pertenece a")).toBeVisible();
    await page.getByRole("button", { name: "Usar sus datos" }).click();
  } else {
    const [first, last] = a.guardianName ?? ["Laura", "Gómez"];
    await page.locator('input[name="guardian.firstName"]').fill(first);
    await page.locator('input[name="guardian.lastName"]').fill(last);
  }
  if (a.group) await page.locator('select[name="enrollment.groupId"]').selectOption({ label: a.group });
}

export async function saveAthlete(page: Page) {
  await page.getByRole("button", { name: "Guardar alumno" }).click();
  await page.waitForURL(/\/alumnos\/[0-9a-f-]{36}$/);
}
