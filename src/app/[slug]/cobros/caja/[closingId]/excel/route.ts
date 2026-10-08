import { db } from "@/db/client";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { getClosing } from "@/modules/billing/cash";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Excel de un cierre de caja: resumen por medio y pagos incluidos. */
export async function GET(_request: Request, ctx: RouteContext<"/[slug]/cobros/caja/[closingId]/excel">) {
  const { slug, closingId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(closingId)) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManagePeople(member.roles)) return new Response(null, { status: 404 });
  const detail = await getClosing(db, member.school.id, closingId);
  if (!detail) return new Response(null, { status: 404 });
  const c = detail.closing;
  const book = writeWorkbook([
    {
      name: "Cierre",
      rows: [
        ["Cierre de caja", `${c.date} · ${detail.userName}`],
        ...Object.entries(c.expected).map(([m, v]) => [
          METHOD_LABELS[m as keyof typeof METHOD_LABELS] ?? m,
          v,
        ]),
        ["Efectivo contado", c.countedCash],
        ["Diferencia", c.difference],
        ["Observación", c.notes ?? ""],
      ],
      widths: [24, 24],
    },
    {
      name: "Pagos",
      rows: [
        ["Recibo", "Pagó", "Medio", "Valor", "Estado"],
        ...detail.payments.map((p) => [
          p.code,
          p.guardianName,
          METHOD_LABELS[p.method],
          p.amount,
          p.status === "VOID" ? "Anulado" : "Confirmado",
        ]),
      ],
      widths: [12, 28, 16, 14, 12],
    },
  ]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="cierre-caja-${c.date}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
