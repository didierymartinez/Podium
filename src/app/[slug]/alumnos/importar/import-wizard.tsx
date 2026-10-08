"use client";

import { CheckCircle2, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Card, Chip, SectionTitle, Tile, buttonClass, inputClass } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import type { ImportResult } from "@/modules/imports/athletes";
import { commitImportAction, previewImportAction, type PreviewState } from "./actions";

export function ImportWizard({ slug }: { slug: string }) {
  const [state, dispatch, previewing] = useActionState(
    previewImportAction.bind(null, slug),
    {} as PreviewState,
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [committing, startCommit] = useTransition();
  const preview = result && !result.ok && result.preview ? result.preview : state.preview;
  const [onlyErrors, setOnlyErrors] = useState(false);

  if (result?.ok) {
    return (
      <Card className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto size-10 text-mint" />
        <h2 className="text-lg font-semibold">Importación lista</h2>
        <p className="text-sm text-ink-soft" role="status">
          {result.athletes} alumnos, {result.guardians} acudientes nuevos y {result.enrollments} matrículas.
          {result.balanceInvoices > 0 && ` ${result.balanceInvoices} cuentas de saldo anterior.`}
        </p>
        <Link href={`/${slug}/alumnos`} className={buttonClass("primary", "mx-auto h-10")}>
          Ver alumnos
        </Link>
      </Card>
    );
  }

  const rows = preview?.ok ? preview.rows.filter((r) => !onlyErrors || r.errors.length > 0) : [];
  return (
    <>
      <Card>
        <SectionTitle>2. Sube el archivo</SectionTitle>
        <form
          action={(form) => {
            setResult(null);
            dispatch(form);
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className={`${inputClass} max-w-sm py-2`}
            aria-label="Archivo de alumnos"
          />
          <Button type="submit" variant="secondary" disabled={previewing}>
            <Upload className="size-4" /> {previewing ? "Revisando…" : "Revisar archivo"}
          </Button>
        </form>
      </Card>

      {preview && !preview.ok && <Alert>{preview.error}</Alert>}
      {result && !result.ok && result.error && preview?.ok && <Alert>{result.error}</Alert>}

      {preview?.ok && (
        <Card>
          <SectionTitle
            action={
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={onlyErrors}
                  onChange={(e) => setOnlyErrors(e.target.checked)}
                />
                Solo filas con errores
              </label>
            }
          >
            3. Revisa y confirma
          </SectionTitle>
          <div className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Resumen de la importación">
            <Chip tone="mint">{preview.summary.valid} listos</Chip>
            {preview.summary.withErrors > 0 && (
              <Chip tone="danger">{preview.summary.withErrors} con errores</Chip>
            )}
            <Chip>{preview.summary.newGuardians} acudientes nuevos</Chip>
            {preview.summary.balance > 0 && (
              <Chip tone="sun">Saldos {formatCOP(preview.summary.balance)}</Chip>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr>
                  <th className="py-2 pr-3">Fila</th>
                  <th className="py-2 pr-3">Alumno</th>
                  <th className="py-2 pr-3">Acudiente</th>
                  <th className="py-2 pr-3">Grupo</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2">Revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? "bg-danger/5" : undefined}>
                    <td className="py-2 pr-3 tabular-nums text-ink-soft">{r.line}</td>
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3">{r.guardian ?? "—"}</td>
                    <td className="py-2 pr-3">{r.group ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.balance ? formatCOP(r.balance) : "—"}
                    </td>
                    <td className="py-2">
                      {r.errors.map((e) => (
                        <p key={e} className="text-danger">
                          {e}
                        </p>
                      ))}
                      {r.notes.map((n) => (
                        <p key={n} className="text-ink-soft">
                          {n}
                        </p>
                      ))}
                      {r.errors.length === 0 && r.notes.length === 0 && <span className="text-mint">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            {preview.summary.withErrors > 0 ? (
              <Tile className="text-sm text-ink-soft">
                Corrige las filas con errores en el archivo y vuelve a subirlo. No se importa nada hasta que
                todo esté bien.
              </Tile>
            ) : (
              <Button
                disabled={committing || !state.sheet}
                onClick={() =>
                  startCommit(async () => setResult(await commitImportAction(slug, state.sheet ?? [])))
                }
              >
                {committing ? "Importando…" : `Importar ${preview.summary.valid} alumnos`}
              </Button>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
