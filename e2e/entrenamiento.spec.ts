import { expect, test } from "@playwright/test";
import { createFeePlans, createSchool, signUp } from "./helpers";

test("entrenamiento: biblioteca, plan desde la biblioteca, asignación, plan del día y RPE", async ({
  page,
}) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  // Grupo con clase todos los días para tener una sesión hoy.
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Todos los días");
  const days = page.getByLabel("Día", { exact: true });
  while ((await days.count()) < 7) await page.getByRole("button", { name: "Agregar día" }).click();
  for (let i = 0; i < 7; i++) {
    await days.nth(i).selectOption(String(i));
    await page.getByLabel("Desde").nth(i).fill("06:00");
    await page.getByLabel("Hasta").nth(i).fill("08:00");
  }
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);

  // Biblioteca: plantilla inicial con búsqueda y filtros, y un ejercicio propio.
  await page.goto(school);
  await page.getByRole("link", { name: "Entrenamiento" }).first().click();
  await page.getByLabel("Buscar ejercicio").fill("curva");
  await page.getByRole("button", { name: "Filtrar" }).click();
  const library = page.getByRole("list", { name: "Ejercicios" });
  await expect(library.locator("summary")).toHaveCount(2);
  await expect(library).toContainText("Cruce en curva con conos");
  await page.getByText("Nuevo ejercicio").click();
  await page.getByLabel("Nombre del ejercicio").fill("Circuito de conos");
  await page.getByLabel("Componente").last().selectOption({ label: "Físico" });
  await page.getByRole("button", { name: "Guardar ejercicio" }).click();
  await expect(page.getByText('"Circuito de conos" quedó en la biblioteca.')).toBeVisible();

  // Plan de sesión desde la biblioteca, como plantilla.
  await page.getByRole("link", { name: "Nuevo plan" }).click();
  await page.getByLabel("Nombre del plan").fill("Técnica de curva");
  await page.getByLabel("Objetivo").fill("Cruces sin perder la posición");
  await page.getByLabel("Guardar como plantilla reutilizable").check();
  await page.getByLabel("Buscar en la biblioteca").fill("Movilidad");
  await page.getByRole("button", { name: "Agregar Movilidad articular" }).click();
  await page.getByLabel("Buscar en la biblioteca").fill("Cruce en curva");
  await page.getByRole("button", { name: "Agregar Cruce en curva con conos" }).click();
  await page.getByLabel("Minutos de Cruce en curva con conos").fill("30");
  await page.getByLabel("Actividad libre").fill("Estiramientos y cierre");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByLabel("Fase de Estiramientos y cierre").selectOption({ label: "Vuelta a la calma" });
  await expect(page.getByText("Duración total: 48 min")).toBeVisible();
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await page.waitForURL(`**${school}/entrenamiento`);

  const plans = page.getByRole("list", { name: "Planes de sesión" });
  await expect(plans).toContainText("Técnica de curva");
  await expect(plans).toContainText("Plantilla");
  await plans.getByRole("button", { name: "Asignar a clases" }).click();
  await page.getByLabel("Repetir").selectOption({ label: "4 semanas (mismo día)" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByText("Plan asignado a 4 clases.")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Próximas clases con Técnica de curva" }).getByRole("listitem"),
  ).toHaveCount(4);

  // Duplicar la plantilla abre la copia para editarla.
  await plans.getByRole("button", { name: "Duplicar Técnica de curva" }).click();
  await page.waitForURL(/\/entrenamiento\/planes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Nombre del plan")).toHaveValue("Técnica de curva (copia)");

  // En la clase de hoy aparece el plan y se registra el post-sesión.
  await page.goto(`${school}/asistencia`);
  await page
    .getByRole("link", { name: /Todos los días/ })
    .first()
    .click();
  await page.waitForURL(/\/asistencia\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Plan del día").getByLabel("Minutos entrenados")).toHaveValue("120");
  const card = page.getByLabel("Plan del día");
  await expect(card).toContainText("Técnica de curva");
  await expect(card).toContainText("Movilidad articular");
  await card.getByRole("radio", { name: "Parcial" }).click();
  await card.getByLabel("Esfuerzo del grupo (RPE 0–10)").selectOption("7");
  await card.getByLabel("Notas de la sesión").fill("Faltó tiempo para la curva");
  await card.getByRole("button", { name: "Guardar registro" }).click();
  await expect(card.getByText("Registro de la sesión guardado.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Plan del día").getByLabel("Notas de la sesión")).toHaveValue(
    "Faltó tiempo para la curva",
  );
});

test("planificación del grupo: periodos de la temporada y carga sRPE", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await page.goto(`${school}/grupos/nuevo`);
  await page.locator('input[name="name"]').fill("Todos los días");
  const days = page.getByLabel("Día", { exact: true });
  while ((await days.count()) < 7) await page.getByRole("button", { name: "Agregar día" }).click();
  for (let i = 0; i < 7; i++) {
    await days.nth(i).selectOption(String(i));
    await page.getByLabel("Desde").nth(i).fill("06:00");
    await page.getByLabel("Hasta").nth(i).fill("08:00");
  }
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(`**${school}/grupos`);

  // Registro post-sesión de hoy con RPE: alimenta la carga.
  await page.goto(`${school}/asistencia`);
  await page
    .getByRole("link", { name: /Todos los días/ })
    .first()
    .click();
  await page.waitForURL(/\/asistencia\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const card = page.getByLabel("Plan del día");
  await card.getByLabel("Esfuerzo del grupo (RPE 0–10)").selectOption("6");
  await card.getByRole("button", { name: "Guardar registro" }).click();
  await expect(card.getByText("Registro de la sesión guardado.")).toBeVisible();

  await page.goto(`${school}/entrenamiento`);
  await page
    .getByRole("list", { name: "Planificación por grupo" })
    .getByRole("link", { name: "Todos los días" })
    .click();
  await page.waitForURL(/\/entrenamiento\/grupos\/[0-9a-f-]{36}$/);
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("form", { name: "Nuevo periodo" });
  await form.getByRole("combobox", { name: /^Tipo/ }).selectOption({ label: "Macrociclo" });
  await form.getByLabel("Nombre del periodo").fill("Temporada de pista");
  await form.getByLabel("Objetivo principal").fill("Llegar a la válida en forma");
  await form.getByRole("button", { name: "Agregar periodo" }).click();
  await expect(page.getByRole("list", { name: "Periodos" })).toContainText("Temporada de pista");
  await expect(page.getByLabel("Carga de entrenamiento")).not.toContainText(
    "Aún no hay registros post-sesión",
  );
  await expect(page.getByLabel("Carga de entrenamiento")).toContainText("720");
});
