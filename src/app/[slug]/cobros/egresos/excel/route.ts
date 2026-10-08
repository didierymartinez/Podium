import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { addMonths } from "@/lib/dates";
import { XLSX_MIME, writeWorkbook } from "@/lib/xlsx";
import { getCurrentUser } from "@/modules/auth/session";
import { listExpenses } from "@/modules/billing/expenses";
import { EXPENSE_CATEGORY_LABELS, METHOD_LABELS } from "@/modules/billing/labels";
import { canManagePeople } from "@/modules/schools/permissions";
import { getMemberSchool } from "@/modules/schools/queries";

/** Egresos de un mes en Excel (ADM-52). */
export async function GET(request: NextRequest, ctx: RouteContext<"/[slug]/cobros/egresos/excel">) {
  const { slug } = await ctx.params;
  const month = request.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response(null, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await getMemberSchool(db, slug, user.id);
  if (!member || !canManagePeople(member.roles)) return new Response(null, { status: 404 });
  const last = addMonths(`${month}-01`, 1);
  const rows = (await listExpenses(db, member.school.id, `${month}-01`, last)).filter(
    (e) => e.spentOn < last,
  );
  const book = writeWorkbook([
    {
      name: "Egresos",
      widths: [12, 22, 40, 14, 16],
      rows: [
        ["Fecha", "Categoría", "Descripción", "Valor", "Medio"],
        ...rows.map((e) => [
          e.spentOn,
          EXPENSE_CATEGORY_LABELS[e.category],
          e.description,
          e.amount,
          METHOD_LABELS[e.method],
        ]),
      ],
    },
  ]);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": `attachment; filename="egresos-${month}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
