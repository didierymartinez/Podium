/**
 * Genera los PDF comerciales (#76) desde docs/comercial/fuente/*.html con Chromium.
 * Uso: pnpm tsx scripts/demo/pdf.mts
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const dir = path.resolve("docs/comercial");
const docs = [
  ["cliente.html", "Podium-brochure-escuelas.pdf"],
  ["vendedor.html", "Podium-guia-comercial-vendedores.pdf"],
];
const only = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out] of docs) {
  if (only && !src.includes(only)) continue;
  await page.goto(`file://${dir}/fuente/${src}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.pdf({ path: `${dir}/${out}`, format: "Letter", printBackground: true, preferCSSPageSize: true });
  console.log("✓", out);
}
await browser.close();
