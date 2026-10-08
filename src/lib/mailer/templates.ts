/** Plantilla base de correos con la marca de la escuela (o de Podium). HTML con estilos en línea. */
export type Brand = { name: string; color: string };
export const PODIUM_BRAND: Brand = { name: "Podium", color: "#2f6bff" };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailLayout(input: {
  brand: Brand;
  title: string;
  paragraphs: string[];
  cta?: { label: string; href: string } | null;
  footer?: string;
}) {
  const color = /^#[0-9a-f]{6}$/i.test(input.brand.color) ? input.brand.color : PODIUM_BRAND.color;
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escape(p)}</p>`)
    .join("");
  const cta = input.cta
    ? `<p style="margin:22px 0"><a href="${escape(input.cta.href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:15px">${escape(input.cta.label)}</a></p>`
    : "";
  const footer = escape(input.footer ?? `Enviado por ${input.brand.name} con Podium.`);
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6fb;font-family:Manrope,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:${color};height:6px"></td></tr>
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${color}">${escape(input.brand.name)}</p>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#111827">${escape(input.title)}</h1>${body}${cta}</td></tr>
<tr><td style="padding:16px 28px 26px;font-size:12px;color:#6b7280">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    input.title,
    "",
    ...input.paragraphs,
    ...(input.cta ? ["", `${input.cta.label}: ${input.cta.href}`] : []),
    "",
    input.footer ?? `Enviado por ${input.brand.name} con Podium.`,
  ].join("\n");
  return { html, text };
}
