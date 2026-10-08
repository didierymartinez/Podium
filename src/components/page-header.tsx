import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./ui";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function NoAccess() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold">Sin acceso</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Esta sección es para el propietario, administradores y coordinadores de la escuela.
      </p>
    </Card>
  );
}
