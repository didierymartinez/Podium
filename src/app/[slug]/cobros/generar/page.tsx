import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Alert, Card, Chip, cn } from "@/components/ui";
import { db } from "@/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { periodLabel, previewMonth } from "@/modules/billing/invoices";
import { readBillingPolicy } from "@/modules/billing/policy";
import { getSchoolContext } from "../../data";
import { GenerateButton } from "./generate-button";

export const metadata: Metadata = { title: "Generar mensualidades" };

export default async function GenerateMonthPage({
  params,
  searchParams,
}: PageProps<"/[slug]/cobros/generar">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school } = await getSchoolContext(slug);
  const today = todayIn(school.timezone);
  const current = today.slice(0, 7);
  const next = addDays(`${current}-28`, 4).slice(0, 7);
  const period = sp.periodo === next ? next : current;
  const policy = readBillingPolicy(school.settings.billing);
  const { invoices, withoutPayer } = await previewMonth(db, school.id, period, policy);
  const total = invoices.reduce((s, d) => s + d.total, 0);
  const lines = invoices.reduce((s, d) => s + d.lines.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/cobros`, label: "Cobros" }}
        title="Generar mensualidades"
        subtitle="Revisa lo que se va a cobrar. Lo ya generado no se repite."
      />
      <nav className="flex gap-1.5" aria-label="Mes">
        {[current, next].map((p) => (
          <Link
            key={p}
            href={`/${slug}/cobros/generar?periodo=${p}`}
            aria-current={p === period ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold capitalize",
              p === period ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft",
            )}
          >
            {periodLabel(p)}
          </Link>
        ))}
      </nav>
      {withoutPayer.length > 0 && (
        <Alert>
          Sin responsable de pago (no se les cobrará):{" "}
          {withoutPayer.map((a, i) => (
            <span key={a.athleteId}>
              {i > 0 && ", "}
              <Link href={`/${slug}/alumnos/${a.athleteId}`} className="font-semibold underline">
                {a.name}
              </Link>
            </span>
          ))}
          .
        </Alert>
      )}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">
          Se generarán <strong>{invoices.length}</strong> {invoices.length === 1 ? "cuenta" : "cuentas"} (
          {lines} {lines === 1 ? "mensualidad" : "mensualidades"}) por <strong>{formatCOP(total)}</strong>.
        </p>
        <GenerateButton slug={slug} period={period} disabled={invoices.length === 0} />
      </Card>
      {invoices.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-line" aria-label="Vista previa">
            {invoices.map((d) => (
              <li key={d.guardianId} className="px-4 py-3 sm:px-5">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{d.guardianName}</span>
                  <span className="font-semibold tabular-nums">{formatCOP(d.total)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
                  {d.lines.map((l) => (
                    <li key={l.enrollmentId} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{l.description}</span>
                      <span className="shrink-0 tabular-nums">
                        {l.siblingDiscount > 0 && (
                          <Chip className="mr-1">−{formatCOP(l.siblingDiscount)} hermanos</Chip>
                        )}
                        {formatCOP(l.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
