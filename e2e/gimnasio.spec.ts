import { expect, test } from "@playwright/test";
import { acceptInviteAsNewUser, generateInviteLink, signUp } from "./helpers";

test("Podium Gym: planes, socio, venta, ingreso en recepción y con el QR del gimnasio", async ({
  page,
  browser,
}) => {
  await signUp(page);
  await page.goto("/nueva-escuela");
  await page.locator('input[name="name"]').fill(`Club E2E Gym ${Date.now().toString(36)}`);
  await page.locator('input[name="city"]').fill("Bogotá");
  await page.locator('select[name="type"]').selectOption("GYM");
  await page.locator('select[name="estimatedStudents"]').selectOption("31-80");
  await expect(page.getByText("✓ Disponible")).toBeVisible();
  await page.getByRole("button", { name: /Crear escuela/ }).click();
  await page.waitForURL(/\/club-e2e-[a-z0-9-]+$/);
  const school = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "Membresías" }).first().click();
  await page.waitForLoadState("networkidle");
  const plan = page.getByRole("form", { name: "Nuevo plan" });
  await plan.getByLabel("Nombre del plan").fill("Ticketera 2");
  await plan.getByRole("combobox", { name: /^Tipo de plan/ }).selectOption("VISITS");
  await plan.getByLabel("Visitas").fill("2");
  await plan.getByLabel("Precio").fill("50000");
  await plan.getByRole("button", { name: "Crear plan" }).click();
  await expect(page.getByRole("list", { name: "Planes de membresía" })).toContainText(
    "Ticketera 2 · 2 visitas en 30 días",
  );

  const member = page.getByRole("form", { name: "Nuevo socio" });
  await member.getByLabel("Nombres").fill("Carlos");
  await member.getByLabel("Apellidos").fill("Mejía");
  await member.getByLabel("Nacimiento").fill("1990-02-01");
  await member.getByLabel("Celular").fill(`310${Math.floor(1e6 + Math.random() * 9e6)}`);
  await member.getByRole("button", { name: "Crear socio" }).click();
  await expect(member.getByText("Socio creado.", { exact: false })).toBeVisible();

  // Venta y ingreso en recepción.
  const socios = page.getByRole("list", { name: "Socios" });
  await expect(socios).toContainText("Sin membresía vigente");
  await socios.getByRole("button", { name: "Vender membresía a Carlos Mejía" }).click();
  await expect(socios.getByText(/Membresía del \d{4}-\d{2}-\d{2} al/)).toBeVisible();
  const reception = page.getByLabel("Ingreso en recepción");
  await reception.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(reception.getByText(/Ingreso registrado · Ticketera 2 · quedan 1 visitas/)).toBeVisible();
  const selfLink = new URL((await page.getByLabel("Link de ingreso").getAttribute("href"))!);
  await expect(page.getByRole("img", { name: "Código QR del gimnasio" })).toBeVisible();

  // El socio con cuenta escanea el QR: ya había ingresado hoy, no se descuenta otra visita.
  await page.goto(`${school}/alumnos`);
  await page
    .getByRole("link", { name: /Carlos Mejía/ })
    .first()
    .click();
  const link = await generateInviteLink(page);
  const memberCtx = await browser.newContext();
  const carlos = await memberCtx.newPage();
  await acceptInviteAsNewUser(carlos, link, "Carlos Mejía");
  await carlos.goto(selfLink.pathname + selfLink.search);
  await carlos.waitForLoadState("networkidle");
  await carlos.getByRole("button", { name: "Registrar ingreso de Carlos Mejía" }).click();
  await expect(carlos.getByText(/Ya había ingresado hoy · Ticketera 2 · quedan 1 visitas/)).toBeVisible();
  await carlos.goto(`${school}/mis-hijos`);
  await expect(carlos.getByLabel("Membresía de Carlos")).toContainText("quedan 1 visitas");
});
