import { expect, test } from "@playwright/test";
import { createFeePlans, createGroup, createSchool, signUp } from "./helpers";

test("pre-inscripción pública con clase de prueba", async ({ page, browser }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Mensual", "100000"]]);
  await createGroup(page, school, "Grupo A", 10, "Mensual · $ 100.000");
  const slug = school.replace(/^\//, "");

  // Sin activar, el link público no recibe nada.
  const visitorCtx = await browser.newContext();
  const visitor = await visitorCtx.newPage();
  await visitor.goto(`/inscripcion/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Pre-inscripción no disponible" })).toBeVisible();

  await page.goto(`${school}/configuracion`);
  await page.getByLabel("Recibir pre-inscripciones por el link público").check();
  await page.getByLabel("Mensaje de bienvenida (opcional)").fill("¡Ven a patinar con nosotros!");
  await page.getByRole("button", { name: "Guardar pre-inscripción" }).click();
  await expect(page.getByText("Pre-inscripción actualizada.")).toBeVisible();
  await expect(page.getByLabel("Link de pre-inscripción")).toContainText(`/inscripcion/${slug}`);

  await visitor.goto(`/inscripcion/${slug}`);
  await expect(visitor.getByText("¡Ven a patinar con nosotros!")).toBeVisible();
  await visitor.getByLabel("Nombres del alumno").fill("Emilia");
  await visitor.getByLabel("Apellidos del alumno").fill("Ríos");
  await visitor.getByLabel("Fecha de nacimiento").fill("2016-04-02");
  await visitor.getByLabel("Tus nombres").fill("Carolina");
  await visitor.getByLabel("Tus apellidos").fill("Ríos");
  await visitor.getByLabel("Celular (WhatsApp)").fill("300 555 1212");
  await visitor.getByRole("button", { name: "Pedir clase de prueba" }).click();
  await expect(visitor.getByText("Debes autorizar el tratamiento de datos")).toBeVisible();
  await visitor.getByRole("checkbox", { name: /Autorizo a la escuela/ }).check();
  await visitor.getByRole("button", { name: "Pedir clase de prueba" }).click();
  await expect(visitor.getByText("¡Listo! Te esperamos")).toBeVisible();

  // La escuela la ve como pre-inscrita en el grupo.
  await page.goto(`${school}/alumnos?estado=all`);
  await expect(page.getByText("Emilia Ríos")).toBeVisible();
});
