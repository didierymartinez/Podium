import { expect, test } from "@playwright/test";
import {
  createCoach,
  createFeePlans,
  createGroup,
  createSchool,
  fillNewAthlete,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

// PNG de 1×1 y un PDF mínimo para las subidas.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("logo, foto, documentos del alumno, acudiente y certificaciones", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);

  // Logo de la escuela.
  await page.goto(`${school}/configuracion`);
  await page
    .locator('input[data-upload="Subir logo"]')
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "Cambiar logo" })).toBeVisible();
  const logo = page.getByRole("img", { name: /Logo de/ });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  // Tipo de documento propio.
  await page.goto(`${school}/configuracion/documentos`);
  await page.getByRole("button", { name: "Nuevo documento" }).click();
  await page.locator('input[name="name"]').fill("Póliza de accidentes");
  await page.locator('input[name="validityMonths"]').fill("12");
  await page.getByRole("button", { name: "Crear documento" }).click();
  await expect(page.getByText("Póliza de accidentes")).toBeVisible();

  await createFeePlans(page, school, [["Iniciación", "120000"]]);
  await createGroup(page, school, "Iniciación tarde", 10, "Iniciación · $ 120.000");
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2015-03-14",
    guardianPhone: randomPhone(),
    group: "Iniciación tarde",
  });
  await saveAthlete(page);
  const athletePage = new URL(page.url()).pathname;

  // Foto del alumno.
  await page
    .locator('input[data-upload="archivo"]')
    .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("button", { name: "Quitar foto" })).toBeVisible();

  // Documentos: certificado médico con soporte y autorización de imagen.
  const docs = page.getByRole("list", { name: "Documentos del alumno" });
  await expect(docs.getByText("Pendiente")).toHaveCount(3);
  await page.getByRole("button", { name: "Registrar Certificado médico" }).click();
  await page
    .locator(`input[data-upload="Adjuntar soporte"]`)
    .setInputFiles({ name: "certificado.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText("certificado.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Guardar documento" }).click();
  await expect(docs.getByText("Recibido")).toBeVisible();
  await expect(docs.getByRole("link", { name: "Ver soporte" })).toBeVisible();
  await page.getByRole("radio", { name: "Autoriza", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Autoriza", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // El inicio avisa los documentos pendientes.
  await page.goto(school);
  const pending = page.getByRole("list", { name: "Documentos por revisar" });
  await expect(pending.getByText("Consentimiento informado")).toBeVisible();
  await expect(pending.getByText("Certificado médico")).toHaveCount(0);

  // Editar el acudiente desde la ficha del alumno.
  await page.goto(athletePage);
  await page.getByRole("link", { name: "Laura Gómez", exact: true }).click();
  await page.waitForURL(/\/acudientes\/[0-9a-f-]{36}$/);
  await page.locator('input[name="firstName"]').fill("Laura María");
  await page.locator('input[name="email"]').fill("laura@example.com");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Datos guardados")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Laura María Gómez" })).toBeVisible();

  // Certificación de un profesor que vence pronto.
  const coachPage = await createCoach(page, school, "Juan", "Pérez");
  await page.goto(coachPage);
  await page.getByRole("button", { name: "Agregar" }).click();
  await page.locator('input[name="name"]').last().fill("Primeros auxilios");
  const soon = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(Date.now() + 10 * 86_400_000),
  );
  await page.locator('input[name="expiresOn"]').fill(soon);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("list", { name: "Certificaciones" }).getByText("Por vencer")).toBeVisible();
  await page.goto(`${school}/profesores`);
  await expect(page.getByText("Certificación por vencer")).toBeVisible();
});
