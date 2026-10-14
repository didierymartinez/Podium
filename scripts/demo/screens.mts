/**
 * Capturas de la escuela de demostración (#76). Requiere el servidor con la base podium_demo y auth dev.
 * Uso: DEMO_URL=http://127.0.0.1:3200 pnpm tsx scripts/demo/screens.mts [filtro]
 */
import { chromium, type Browser, type Page } from "@playwright/test";

const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:3200";
const OUT = "docs/comercial/capturas";
const only = process.argv[2];

type Shot = { name: string; path: string; as: string; mobile?: boolean; full?: boolean; prepare?: (p: Page) => Promise<void> };
const S = "/patin-veloz";
const shots: Shot[] = [
  { name: "inicio", path: S, as: "directora@example.com" },
  { name: "alumnos", path: `${S}/alumnos`, as: "directora@example.com" },
  { name: "grupos", path: `${S}/grupos`, as: "directora@example.com" },
  { name: "asistencia", path: `${S}/asistencia`, as: "directora@example.com" },
  { name: "cobros", path: `${S}/cobros`, as: "directora@example.com" },
  { name: "alumno", path: `${S}/alumnos/${process.env.DEMO_ATHLETE}`, as: "directora@example.com" },
  { name: "avisos", path: `${S}/avisos`, as: "directora@example.com" },
  { name: "celular-inicio", path: S, as: "directora@example.com", mobile: true },
  { name: "celular-asistencia", path: `${S}/asistencia`, as: "profesor@example.com", mobile: true },
  {
    name: "clase",
    path: `${S}/asistencia`,
    as: "directora@example.com",
    prepare: async (p) => {
      await p.locator(`a[href^="${S}/asistencia/"]:not([href*="nueva"])`).first().click();
      await p.waitForURL(/asistencia\/[0-9a-f-]{36}/);
      await p.waitForLoadState("networkidle");
      await p.getByRole("button", { name: "Todos presentes" }).click();
      await p.getByRole("radio", { name: "Ausente" }).nth(3).click();
      await p.getByRole("radio", { name: "Tarde" }).nth(7).click();
      await p.getByRole("button", { name: "Todos presentes" }).evaluate((el) =>
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 220),
      );
      await p.waitForTimeout(1500);
    },
  },
  { name: "celular-familia", path: S, as: "familia@example.com", mobile: true },
  { name: "celular-mis-pagos", path: `${S}/mis-pagos`, as: "familia@example.com", mobile: true },
  { name: "celular-mis-hijos", path: `${S}/mis-hijos`, as: "familia@example.com", mobile: true },
];

async function session(browser: Browser, email: string, mobile: boolean) {
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  );
  const res = await context.request.post(`${BASE}/api/auth/session`, { data: { provider: "dev", email } });
  if (!res.ok()) throw new Error(`login ${email}: ${res.status()} ${await res.text()}`);
  return context;
}

const browser = await chromium.launch();
for (const shot of shots) {
  if (only && !shot.name.includes(only)) continue;
  const context = await session(browser, shot.as, Boolean(shot.mobile));
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(`${BASE}${shot.path}`);
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
  await shot.prepare?.(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: Boolean(shot.full) });
  console.log("✓", shot.name, page.url());
  await context.close();
}
await browser.close();
