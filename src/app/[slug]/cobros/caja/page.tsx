import { Download } from "lucide-react";
import type { Metadata } from "next";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { MANUAL_METHODS, cashDraft, listClosings } from "@/modules/billing/cash";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { getSchoolContext } from "../../data";
import { CloseCashForm } from "./close-form";

export const metadata: Metadata = { title: "Cierre de caja" };

/** Cierre de caja diario (ADM-50): lo que recibió cada persona hoy, por medio de pago. */
export default async function CashPage({ params }: PageProps<"/[slug]/cobros/caja">) {
  const { slug } = await params;
  const { school, user } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const [draft, closings] = await Promise.all([
    cashDraft(db, school.id, user.id, today, school.timezone),
    listClosings(db, school.id),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <SectionTitle
          action={draft.closing ? <Chip tone="mint">Cerrada</Chip> : <Chip tone="sun">Abierta</Chip>}
        >
          Mi caja de hoy
        </SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Recibido hoy por medio">
          {MANUAL_METHODS.map((m) => (
            <div key={m} className="rounded-2xl bg-canvas p-3">
              <p className="text-xs text-ink-soft">{METHOD_LABELS[m]}</p>
              <p className="font-semibold tabular-nums">{formatCOP(draft.expected[m])}</p>
            </div>
          ))}
        </div>
        <ul className="mb-3 divide-y divide-line text-sm" aria-label="Pagos registrados hoy">
          {draft.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">
                {p.code} · {p.guardianName}
              </span>
              <span className="text-ink-soft">{METHOD_LABELS[p.method]}</span>
              <span className="font-semibold tabular-nums">{formatCOP(p.amount)}</span>
            </li>
          ))}
          {draft.payments.length === 0 && <li className="py-2 text-ink-soft">Hoy no registraste pagos.</li>}
        </ul>
        {draft.closing ? (
          <p className="text-sm">
            Contaste {formatCOP(draft.closing.countedCash)} en efectivo · diferencia{" "}
            <strong className={draft.closing.difference < 0 ? "text-danger" : undefined}>
              {formatCOP(draft.closing.difference)}
            </strong>
            {draft.closing.notes ? ` · ${draft.closing.notes}` : ""}
          </p>
        ) : (
          <CloseCashForm slug={slug} expectedCash={draft.expected.CASH} />
        )}
      </Card>
      <Card>
        <SectionTitle>Cierres</SectionTitle>
        <ul className="divide-y divide-line text-sm" aria-label="Cierres de caja">
          {closings.map(({ closing: c, userName }) => {
            const total = Object.values(c.expected).reduce((s, v) => s + v, 0);
            return (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">
                  {c.date} · {userName}
                  <span className="block text-xs text-ink-soft">
                    Recibido {formatCOP(total)}
                    {c.difference !== 0 ? ` · diferencia ${formatCOP(c.difference)}` : " · sin diferencia"}
                  </span>
                </span>
                <a
                  href={`/${slug}/cobros/caja/${c.id}/excel`}
                  className="text-brand"
                  aria-label={`Excel del cierre del ${c.date}`}
                  download
                >
                  <Download className="size-4" />
                </a>
              </li>
            );
          })}
          {closings.length === 0 && <li className="py-2 text-ink-soft">Aún no hay cierres.</li>}
        </ul>
      </Card>
    </div>
  );
}
