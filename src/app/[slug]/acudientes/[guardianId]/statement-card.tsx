import { Download, HandCoins } from "lucide-react";
import Link from "next/link";
import { Card, Chip, SectionTitle, buttonClass } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { pdfHref } from "@/modules/billing/labels";
import type { Movement } from "@/modules/billing/statement";

/** Estado de cuenta del acudiente (ADM-40) con PDF, paz y salvo (ADM-46) y registro de pago. */
export function StatementCard({
  slug,
  guardianId,
  statement,
}: {
  slug: string;
  guardianId: string;
  statement: { movements: Movement[]; owed: number; credit: number };
}) {
  return (
    <Card>
      <SectionTitle
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={pdfHref(slug, "estado", guardianId)}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "h-9 px-3")}
            >
              <Download className="size-4" /> Estado de cuenta
            </a>
            {statement.owed === 0 && (
              <a
                href={pdfHref(slug, "paz-y-salvo", guardianId)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("secondary", "h-9 px-3")}
              >
                <Download className="size-4" /> Paz y salvo
              </a>
            )}
            <Link
              href={`/${slug}/cobros/pagos/nuevo?acudiente=${guardianId}`}
              className={buttonClass("primary", "h-9 px-3")}
            >
              <HandCoins className="size-4" /> Registrar pago
            </Link>
          </div>
        }
      >
        Estado de cuenta
      </SectionTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip tone={statement.owed > 0 ? "danger" : "mint"}>
          {statement.owed > 0 ? `Debe ${formatCOP(statement.owed)}` : "Al día"}
        </Chip>
        {statement.credit > 0 && <Chip tone="violet">Saldo a favor {formatCOP(statement.credit)}</Chip>}
      </div>
      {statement.movements.length === 0 ? (
        <p className="text-sm text-ink-soft">Sin movimientos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm" aria-label="Movimientos">
            <thead className="text-left text-ink-soft">
              <tr>
                <th className="py-2 font-semibold">Fecha</th>
                <th className="py-2 font-semibold">Movimiento</th>
                <th className="py-2 text-right font-semibold">Cargo</th>
                <th className="py-2 text-right font-semibold">Abono</th>
                <th className="py-2 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {statement.movements.map((m, i) => (
                <tr key={i}>
                  <td className="py-2 tabular-nums">{m.date}</td>
                  <td className="py-2">
                    <Link
                      href={
                        m.href?.paymentId
                          ? `/${slug}/cobros/pagos/${m.href.paymentId}`
                          : `/${slug}/cobros/cuentas/${m.href?.invoiceId}`
                      }
                      className="hover:text-brand"
                    >
                      {m.code} · {m.description}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{m.debit ? formatCOP(m.debit) : ""}</td>
                  <td className="py-2 text-right tabular-nums">{m.credit ? formatCOP(m.credit) : ""}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatCOP(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
