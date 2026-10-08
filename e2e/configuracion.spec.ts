import { expect, test } from "@playwright/test";
import { createFeePlans, createSchool, signUp } from "./helpers";

test("perfil valida y normaliza el NIT", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await page.goto(`${school}/configuracion`);

  await page.locator('select[name="documentType"]').selectOption("NIT");
  await page.locator('input[name="documentNumber"]').fill("800197268-5");
  await page.locator('input[name="phone"]').fill("123");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("El NIT o su dígito de verificación no es válido")).toBeVisible();
  await expect(page.getByText("Escribe un celular colombiano válido")).toBeVisible();

  await page.locator('input[name="documentNumber"]').fill("800197268");
  await page.locator('input[name="phone"]').fill("3001234567");
  await page.getByRole("radio", { name: "#7c5cff" }).click();
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByText("Perfil guardado")).toBeVisible();
  await expect(page.locator('input[name="documentNumber"]')).toHaveValue("800197268-4");
  await expect(page.locator('input[name="phone"]')).toHaveValue("300 123 4567");
  await expect(page.locator('select[name="documentType"]')).toHaveValue("NIT");

  await page.reload();
  await expect(page.locator('input[name="documentNumber"]')).toHaveValue("800197268-4");
});

test("tarifas y política de cobro con simulación", async ({ page }) => {
  await signUp(page);
  const school = await createSchool(page);
  await createFeePlans(page, school, [
    ["Competencia 5 días", "180000"],
    ["Iniciación 3 días", "120000"],
  ]);

  await page.locator('select[name="siblingDiscountType"]').selectOption("percent");
  await page.locator('input[name="siblingDiscountValue"]').fill("10");
  await page.locator('select[name="earlyPaymentType"]').selectOption("percent");
  await page.locator('input[name="earlyPaymentValue"]').fill("5");
  await page.locator('select[name="earlyPaymentUntilDay"]').selectOption("5");
  await page.locator('select[name="lateFeeType"]').selectOption("fixed");
  await page.locator('input[name="lateFeeValue"]').fill("10000");
  await page.locator('input[name="enrollmentFee"]').fill("80000");

  // Ejemplo de docs/GESTION_ADMINISTRATIVA.md §6.2
  for (const amount of ["$ 273.600", "$ 288.000", "$ 298.000"]) {
    await expect(page.getByText(amount, { exact: true }).first()).toBeVisible();
  }

  await page.getByRole("button", { name: "Guardar política" }).click();
  await expect(page.getByText("Política de cobro guardada")).toBeVisible();
  // Los selectores conservan su valor tras guardar (bug corregido en #4).
  await expect(page.locator('select[name="lateFeeType"]')).toHaveValue("fixed");

  await page.reload();
  await expect(page.locator('select[name="siblingDiscountType"]')).toHaveValue("percent");
  await expect(page.locator('input[name="lateFeeValue"]')).toHaveValue("10.000");
  await expect(page.locator('input[name="enrollmentFee"]')).toHaveValue("80.000");

  await page.locator('select[name="earlyPaymentUntilDay"]').selectOption("12");
  await page.getByRole("button", { name: "Guardar política" }).click();
  await expect(
    page.getByText("El pronto pago debe terminar antes o el mismo día del vencimiento"),
  ).toBeVisible();
});
