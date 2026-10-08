import Link from "next/link";
import { Alert, Card, buttonClass } from "@/components/ui";
import { ReactivateButton } from "./suscripcion/reactivate-button";

type Status = "TRIAL" | "ACTIVE" | "PAST_DUE" | "READ_ONLY" | "CANCELED";

/** Aviso del estado de la suscripción para quienes administran la escuela (#21). */
export function SubscriptionBanner({
  slug,
  status,
  isOwner,
}: {
  slug: string;
  status: Status;
  isOwner: boolean;
}) {
  const link = isOwner ? (
    <Link href={`/${slug}/suscripcion`} className="font-semibold underline">
      {status === "PAST_DUE" ? "Pagar ahora" : "Elegir plan"}
    </Link>
  ) : (
    <span>El propietario puede resolverlo desde Suscripción.</span>
  );
  if (status === "PAST_DUE")
    return (
      <Alert tone="info">
        No pudimos cobrar la suscripción de Podium. Tienes unos días de gracia antes de pasar a solo lectura.{" "}
        {link}
      </Alert>
    );
  if (status === "READ_ONLY")
    return (
      <Alert>
        La escuela está en <strong>solo lectura</strong>: puedes consultar y exportar, pero no crear ni
        editar. Los pagos de las familias siguen entrando. {link}
      </Alert>
    );
  return null;
}

/** Escuela cancelada o suspendida: no se muestra su contenido. */
export function SchoolBlocked({
  slug,
  kind,
  isOwner,
  reason,
}: {
  slug: string;
  kind: "canceled" | "suspended";
  isOwner: boolean;
  reason?: string | null;
}) {
  return (
    <Card className="mx-auto max-w-lg space-y-3 text-center">
      <h1 className="text-xl font-semibold">
        {kind === "canceled" ? "Esta escuela está cancelada" : "Esta escuela está suspendida"}
      </h1>
      <p className="text-sm text-ink-soft">
        {kind === "canceled"
          ? "Conservamos los datos 90 días después de la cancelación. El propietario puede reactivarla y elegir un plan."
          : `Podium suspendió la escuela${reason ? `: ${reason}` : ""}. Escríbenos para resolverlo.`}
      </p>
      {kind === "canceled" && isOwner && <ReactivateButton slug={slug} />}
      <Link href="/escuelas" className={buttonClass("secondary", "mx-auto h-10")}>
        Mis escuelas
      </Link>
    </Card>
  );
}
