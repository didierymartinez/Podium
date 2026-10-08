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

const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

test("la familia reporta una transferencia y la escuela la aprueba o rechaza", async ({ page, browser }) => {
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
  const link = await generateInviteLink(page);
  const familyCtx = await browser.newContext();
  const family = await familyCtx.newPage();
  await acceptInviteAsNewUser(family, link, "Laura Restrepo");

  async function report(amount: string, reference: string) {
    await family.goto(`${school}/mis-pagos`);
    await family.getByRole("button", { name: "Ya pagué por transferencia o consignación" }).click();
    const form = family.getByRole("form", { name: "Reportar pago" });
    await form.getByLabel("Valor pagado").fill(amount);
    await form.getByLabel("Referencia o número de aprobación").fill(reference);
    await form
      .locator('input[data-upload="Adjuntar soporte"]')
      .setInputFiles({ name: "soporte.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(form.getByText("soporte.pdf")).toBeVisible();
    await form.getByRole("button", { name: "Enviar reporte" }).click();
    await expect(family.getByText("Recibimos tu reporte. La escuela lo verificará pronto.")).toBeVisible();
  }
  await report("50000", "TRX-1");
  await report("20000", "TRX-2");
  await expect(
    family.getByRole("list", { name: "Pagos reportados" }).getByText("En verificación"),
  ).toHaveCount(2);

  await page.goto(`${school}/cobros`);
  await page.getByRole("link", { name: "Por verificar" }).click();
  const pending = page.getByRole("list", { name: "Pagos por verificar" });
  await expect(pending.getByRole("listitem")).toHaveCount(2);
  const first = pending.getByRole("listitem").filter({ hasText: "TRX-1" });
  await first.getByRole("button", { name: "Aprobar" }).click();
  await expect(pending.getByRole("listitem")).toHaveCount(1);
  const second = pending.getByRole("listitem").filter({ hasText: "TRX-2" });
  await second.getByRole("button", { name: "Rechazar…" }).click();
  await second.getByLabel("Motivo del rechazo").fill("No aparece en el banco");
  await second.getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(page.getByText("No hay pagos por verificar.")).toBeVisible();

  await family.goto(`${school}/mis-pagos`);
  const reports = family.getByRole("list", { name: "Pagos reportados" });
  await expect(reports.getByText("Aprobado")).toBeVisible();
  await expect(reports.getByText("Rechazado")).toBeVisible();
  await expect(family.getByRole("list", { name: "Pagos realizados" }).getByText("$ 50.000")).toBeVisible();
});
