import { expect, test } from "@playwright/test";

test("el chequeo de salud confirma configuración y base de datos", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, config: { ok: true }, database: { ok: true, migrated: true } });
});
