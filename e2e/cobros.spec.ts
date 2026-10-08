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

test("mensualidades, pagos, anulaciones, cartera y la familia ve sus cuentas", async ({ page, browser }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [["Competencia", "180000"]]);
  await createGroup(page, school, "Competencia", 10, "Competencia · $ 180.000");

  // Dos hermanos con la misma acudiente.
  const phone = randomPhone();
  await fillNewAthlete(page, school, {
    firstName: "Sofía",
    birthDate: "2014-02-01",
    guardianPhone: phone,
    group: "Competencia",
  });
  await saveAthlete(page);
  const sofiaPage = new URL(page.url()).pathname;
  await fillNewAthlete(page, school, {
    firstName: "Tomás",
    birthDate: "2016-06-01",
    guardianPhone: phone,
    useExistingGuardian: true,
    group: "Competencia",
  });
  await saveAthlete(page);

  // Vista previa y generación del mes.
  await page.goto(`${school}/cobros/generar`);
  await expect(page.getByText(/Se generarán 1 cuenta \(2 mensualidades\) por \$ 360\.000/)).toBeVisible();
  await page.getByRole("button", { name: "Generar cuentas" }).click();
  await expect(page.getByText("Se generaron 1 cuentas de cobro")).toBeVisible();
  await expect(page.getByText(/Se generarán 0 cuentas/)).toBeVisible();

  await page.goto(`${school}/cobros/cuentas`);
  await page.getByRole("link", { name: /CC-0001/ }).click();
  await expect(page.getByRole("heading", { name: "Cuenta CC-0001" })).toBeVisible();
  const invoicePage = new URL(page.url()).pathname;

  // El PDF responde (se pide desde la página para usar la cookie de sesión).
  const pdfHref = (await page.getByRole("link", { name: "PDF" }).getAttribute("href"))!;
  const pdf = await page.evaluate(async (href) => {
    const res = await fetch(href);
    return { status: res.status, type: res.headers.get("content-type") };
  }, pdfHref);
  expect(pdf).toEqual({ status: 200, type: "application/pdf" });

  // Abono parcial en efectivo.
  await page.getByRole("link", { name: "Registrar pago" }).click();
  await page.waitForURL(/\/cobros\/pagos\/nuevo/);
  await page.locator('input[name="amount"]').fill("100000");
  await expect(page.locator('input[name="amount"]')).toHaveValue("100.000");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("heading", { name: "Recibo RC-0001" })).toBeVisible();
  await page.goto(invoicePage);
  await expect(page.getByText("Abono parcial")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Saldo" }).last()).toContainText("$ 260.000");

  // Nota crédito y luego anular el pago: la cuenta queda pendiente sin el abono.
  await page.locator('input[name="amount"]').fill("10000");
  await page.getByPlaceholder("Beca parcial de octubre").fill("Descuento por uniforme");
  await page.getByRole("button", { name: "Registrar nota crédito" }).click();
  await expect(page.getByText("Nota crédito registrada")).toBeVisible();
  await page.getByRole("link", { name: /Pago RC-0001/ }).click();
  await page.getByPlaceholder("Transferencia rechazada").fill("Billete falso");
  await page.getByRole("button", { name: "Anular pago" }).click();
  await expect(page.getByText("Anulado: Billete falso")).toBeVisible();
  await page.goto(invoicePage);
  await expect(page.getByRole("listitem").filter({ hasText: "Saldo" }).last()).toContainText("$ 350.000");

  // Cobro único de uniforme a Sofía.
  await page.goto(`${school}/cobros/cobro-unico`);
  await page.getByRole("button", { name: "Uniforme" }).click();
  await page.locator('input[name="amount"]').fill("90000");
  await page.getByRole("checkbox", { name: "Sofía Restrepo" }).check();
  await page.getByRole("button", { name: "Cobrar a 1 alumno" }).click();
  await expect(page.getByRole("heading", { name: "Cuenta CC-0002" })).toBeVisible();
  await expect(page.getByText("Uniforme · Sofía")).toBeVisible();

  // Cartera, ficha del alumno y estado de cuenta.
  await page.goto(`${school}/cobros`);
  await expect(page.getByRole("list", { name: "Deudores" }).getByText("Laura Gómez")).toBeVisible();
  await page.goto(sofiaPage);
  await expect(page.getByText(/Saldo pendiente \$ 440\.000/)).toBeVisible();
  await page.getByRole("link", { name: "Laura Gómez", exact: true }).click();
  await expect(page.getByText("Debe $ 440.000")).toBeVisible();

  // La familia entra y ve lo que debe (sin pagos en línea conectados).
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Gómez");
  await family.goto(`${school}/mis-pagos`);
  await expect(
    family.getByRole("list", { name: "Cuentas por pagar" }).getByText("CC-0001", { exact: false }),
  ).toBeVisible();
  await expect(family.getByText("Paga por los medios que te indique la escuela")).toBeVisible();
  // No puede ver la administración de cobros ni cuentas ajenas por PDF.
  await family.goto(`${school}/cobros`);
  await expect(family.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
});
