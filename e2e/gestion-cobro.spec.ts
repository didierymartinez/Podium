import { expect, test } from "@playwright/test";
import {
  createFeePlans,
  createGroup,
  createSchool,
  fillNewAthlete,
  randomPhone,
  saveAthlete,
  signUp,
} from "./helpers";

test("gestión de cobro: bitácora con compromiso y acuerdo de pago en cuotas", async ({ page }) => {
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

  await page.goto(`${school}/acudientes`);
  await page
    .getByRole("link", { name: /Laura Gómez/ })
    .first()
    .click();

  await page.getByLabel("¿Qué pasó?").fill("Dice que paga el viernes");
  await page.getByLabel("Compromiso (fecha)").fill("2099-01-15");
  await page.getByLabel("Valor comprometido").fill("50000");
  await page.getByRole("button", { name: "Registrar gestión" }).click();
  const log = page.getByRole("list", { name: "Bitácora de cobro" });
  await expect(log.getByText("Dice que paga el viernes")).toBeVisible();
  await expect(log.getByText("Compromiso abierto")).toBeVisible();

  await page.getByLabel("Valor del acuerdo").fill("90000");
  await page.getByLabel("Cuotas").fill("3");
  await page.getByRole("button", { name: "Crear acuerdo" }).click();
  const installments = page.getByRole("list", { name: "Cuotas del acuerdo" });
  await expect(installments.getByRole("listitem")).toHaveCount(3);
  await expect(installments.getByText("$ 30.000")).toHaveCount(3);
  await page.getByRole("button", { name: "Cancelar acuerdo" }).click();
  await expect(page.getByRole("button", { name: "Crear acuerdo" })).toBeVisible();
});
