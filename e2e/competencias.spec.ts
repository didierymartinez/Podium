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

test("competencias: convocatoria, autorización y cobro de la familia, resultados y medallero", async ({
  page,
  browser,
}) => {
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

  // Competencia que empieza hoy (para poder cargar resultados en la prueba).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  await page.goto(school);
  await page.getByRole("link", { name: "Competencias" }).first().click();
  await page.getByRole("link", { name: "Nueva competencia" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Festival de la liga");
  await page.getByRole("combobox", { name: /^Tipo/ }).selectOption({ label: "Festival" });
  await page.getByLabel("Desde", { exact: true }).fill(today);
  await page.getByLabel("Hasta", { exact: true }).fill(today);
  await page.getByLabel("Inscripciones hasta").fill(today);
  await page.getByRole("textbox", { name: /^Pruebas/ }).fill("500 m, 1.000 m");
  await page.getByRole("textbox", { name: /^Inscripción Se cobra/ }).fill("50000");
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await page.getByLabel("Servicio 1", { exact: true }).fill("Transporte");
  await page.getByLabel("Valor del servicio 1").fill("30000");
  await page.getByRole("button", { name: "Crear competencia" }).click();
  await page.waitForURL(/\/competencias\/[0-9a-f-]{36}$/);
  const competitionPage = new URL(page.url()).pathname;

  // Convocatoria con validaciones.
  const candidates = page.getByRole("list", { name: "Alumnos para convocar" });
  await expect(candidates).toContainText("Cumple requisitos");
  await candidates.getByRole("checkbox").first().check();
  await page.getByRole("checkbox", { name: "500 m" }).check();
  await page.getByRole("button", { name: "Convocar", exact: true }).click();
  await expect(page.getByText("1 convocados; las familias recibieron el aviso.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Convocados" })).toContainText("Convocado");

  // La familia acepta con autorización y transporte; se genera el cobro.
  await family.goto(`${school}/mis-hijos`);
  const invitation = family.getByLabel("Convocatoria de Sofía");
  await expect(invitation).toContainText("Festival de la liga");
  await invitation.getByRole("checkbox", { name: /Transporte/ }).check();
  await invitation.getByRole("button", { name: /Aceptar/ }).click();
  await expect(invitation.getByText("Para aceptar debes marcar la autorización.")).toBeVisible();
  await invitation.getByLabel("Acepto y autorizo").check();
  await expect(invitation.getByRole("button", { name: "Aceptar · $ 80.000" })).toBeVisible();
  await invitation.getByRole("button", { name: /Aceptar/ }).click();
  await expect(invitation.getByText(/quedó inscrito\(a\)/)).toBeVisible();
  await family.goto(`${school}/mis-pagos`);
  await expect(family.getByText("$ 80.000").first()).toBeVisible();

  // Resultados y medallero.
  await page.goto(competitionPage);
  const entries = page.getByRole("list", { name: "Convocados" });
  await expect(entries).toContainText("Inscrito");
  await expect(entries).toContainText("Servicios: Transporte");
  const result = page.getByRole("form", { name: "Resultado de Sofía Restrepo" });
  await result.getByLabel("Posición").fill("1");
  await result.getByLabel("Tiempo o puntos").fill("48,30");
  await result.getByLabel("Medalla").selectOption({ label: "Oro" });
  await result.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(entries).toContainText("500 m: 1.º 48,30");

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Inscritos para la liga" }).click();
  expect((await download).suggestedFilename()).toBe(`inscritos-${today}.xlsx`);

  await page.goto(`${school}/competencias`);
  await expect(page.getByLabel("Medallero")).toContainText("1 oro");
  await page.goto(sofiaPage);
  await expect(page.getByLabel("Historial competitivo")).toContainText("Festival de la liga");
  await family.goto(`${school}/mis-hijos`);
  await expect(family.getByLabel("Competencias de Sofía")).toContainText("Oro");
});
