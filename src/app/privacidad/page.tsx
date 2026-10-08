import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Política de tratamiento de datos personales" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Card className="space-y-3">
        <h1 className="text-2xl font-bold">Política de tratamiento de datos personales</h1>
        <p className="text-sm text-ink-soft">
          Borrador — versión 2026-10. Este documento debe ser redactado y validado por un abogado antes del
          lanzamiento (Ley 1581 de 2012 y decretos reglamentarios).
        </p>
        <Link href="/" className="text-sm text-brand">
          Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
