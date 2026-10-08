import { expect, test } from "@playwright/test";
import { createSchool, signUp } from "./helpers";

test("otro usuario no puede ver una escuela ajena", async ({ browser }) => {
  const owner = await browser.newPage();
  await signUp(owner);
  const school = await createSchool(owner);

  const intruder = await browser.newPage();
  await signUp(intruder, "Intruso Pérez");
  for (const path of [school, `${school}/alumnos`, `${school}/configuracion/cobros`]) {
    const response = await intruder.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
