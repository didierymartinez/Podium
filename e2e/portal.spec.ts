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

test("aviso fijado, portal de la familia y mis datos", async ({ page, browser }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Iniciación", "120000"]]);
  await createGroup(page, school, "Iniciación tarde", 10, "Iniciación · $ 120.000");
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Iniciación tarde",
  });
  await saveAthlete(page);
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Gómez");

  // La escuela envía un aviso urgente y fijado a toda la escuela.
  await page.goto(`${school}/avisos/nuevo`);
  await page.locator('input[name="title"]').fill("Festival el sábado");
  await page.locator('textarea[name="body"]').fill("Hola {acudiente}, {alumnos} debe llegar a las 7 a. m.");
  await expect(page.getByLabel("Vista previa del aviso")).toContainText(
    "Hola Laura, Sofía y Tomás debe llegar a las 7 a. m.",
  );
  const pinUntil = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(Date.now() + 5 * 86_400_000),
  );
  await page.locator('input[name="pinnedUntil"]').fill(pinUntil);
  await page.locator('input[name="urgent"]').check();
  await page.getByRole("button", { name: "Enviar aviso" }).click();
  await page.waitForURL(/\/avisos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Enviado")).toBeVisible();
  const recipients = page.getByRole("list", { name: "Destinatarios" });
  await expect(recipients.getByText("Laura Gómez")).toBeVisible();
  await expect(recipients.getByText("En la app")).toBeVisible();
  await expect(recipients.getByText("Hola Laura, Sofía debe llegar a las 7 a. m.")).toBeVisible();

  // La familia lo ve fijado en su inicio, en avisos y en la campana.
  await family.goto(school);
  await expect(family.getByLabel("Aviso fijado")).toContainText("Festival el sábado");
  await expect(family.getByRole("link", { name: /Notificaciones \(\d+ sin leer\)/ })).toBeVisible();
  await expect(family.getByLabel("Próximas clases")).toBeVisible();
  await family.goto(`${school}/avisos`);
  await expect(family.getByText("Hola Laura, Sofía debe llegar a las 7 a. m.")).toBeVisible();

  // Mis hijos.
  await family.goto(`${school}/mis-hijos`);
  await expect(family.getByRole("heading", { name: "Sofía Restrepo" })).toBeVisible();
  await expect(family.getByRole("paragraph").filter({ hasText: "Iniciación tarde" })).toBeVisible();
  await expect(family.getByRole("list", { name: "Próximas clases de Sofía" })).toBeVisible();
  await expect(family.getByText("Certificado médico")).toBeVisible();

  // Mis datos: preferencias, uso de imagen y descarga de datos.
  await family.goto(`${school}/mis-datos`);
  await family.getByLabel("Avisos de la escuela por correo").uncheck();
  await family.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(family.getByText("Preferencias guardadas")).toBeVisible();
  await family.reload();
  await expect(family.getByLabel("Avisos de la escuela por correo")).not.toBeChecked();
  await family.getByRole("radio", { name: "Autorizo", exact: true }).click();
  await expect(family.getByRole("radio", { name: "Autorizo", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const exported = await family.evaluate(
    async (href) => {
      const res = await fetch(href);
      return res.json();
    },
    `/api/mis-datos?escuela=${school.slice(1)}`,
  );
  expect(exported.athletes.map((a: { firstName: string }) => a.firstName)).toEqual(["Sofía"]);
  expect(exported.athletes[0].imageConsent).toBe("GRANTED");
});
