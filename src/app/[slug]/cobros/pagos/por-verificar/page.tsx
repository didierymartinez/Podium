import { FileText } from "lucide-react";
import type { Metadata } from "next";
import { Card, Chip } from "@/components/ui";
import { db } from "@/db/client";
import { formatCOP } from "@/lib/money";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { listTransferReports } from "@/modules/billing/transfer-reports";
import { fileHref } from "@/modules/files/files";
import { getSchoolContext } from "../../../data";
import { ReviewButtons } from "./review-buttons";

export const metadata: Metadata = { title: "Pagos por verificar" };

const STATUS = {
  PENDING: { label: "Por verificar", tone: "sun" },
  APPROVED: { label: "Aprobado", tone: "mint" },
  REJECTED: { label: "Rechazado", tone: "danger" },
} as const;

/** Transferencias y consignaciones reportadas por las familias (ADM-34). */
export default async function TransferReportsPage({
  params,
}: PageProps<"/[slug]/cobros/pagos/por-verificar">) {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  const reports = await listTransferReports(db, school.id);
  const pending = reports.filter((r) => r.report.status === "PENDING");
  const reviewed = reports.filter((r) => r.report.status !== "PENDING").slice(0, 30);
  const row = ({ report: r, guardianName }: (typeof reports)[number], review: boolean) => (
    <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {guardianName} · {formatCOP(r.amount)}
        </p>
        <p className="text-sm text-ink-soft">
          {METHOD_LABELS[r.method]} del {r.paidOn}
          {r.reference ? ` · Ref. ${r.reference}` : ""}
          {r.rejectReason ? ` · Motivo: ${r.rejectReason}` : ""}
        </p>
      </div>
      <a
        href={fileHref(slug, r.proofFileId)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
      >
        <FileText className="size-4" /> Soporte
      </a>
      {review ? (
        <ReviewButtons slug={slug} reportId={r.id} />
      ) : (
        <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
      )}
    </li>
  );
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Por verificar ({pending.length})</h2>
        <ul className="divide-y divide-line" aria-label="Pagos por verificar">
          {pending.map((r) => row(r, true))}
          {pending.length === 0 && (
            <li className="py-3 text-sm text-ink-soft">No hay pagos por verificar.</li>
          )}
        </ul>
      </Card>
      {reviewed.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Revisados</h2>
          <ul className="divide-y divide-line">{reviewed.map((r) => row(r, false))}</ul>
        </Card>
      )}
    </div>
  );
}
