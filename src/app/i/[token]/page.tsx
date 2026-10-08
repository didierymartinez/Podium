import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, Chip, Logo, buttonClass, initials } from "@/components/ui";
import { db } from "@/db/client";
import { getCurrentUser } from "@/modules/auth/session";
import { openInvitation } from "@/modules/invitations/invitations";
import { INVITATION_ROLE_LABELS, listNames } from "@/modules/invitations/message";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitación", robots: { index: false } };

const STATE_MESSAGES = {
  not_found: "Este link de invitación no existe o está incompleto. Revisa el mensaje que te enviaron.",
  expired: "Esta invitación venció. Pide a la escuela que te envíe un link nuevo.",
  accepted: "Esta invitación ya fue aceptada.",
  canceled:
    "Esta invitación fue reemplazada por una más reciente o cancelada. Usa el último link que te enviaron.",
} as const;

export default async function InvitationPage({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const [view, user] = await Promise.all([openInvitation(db, token), getCurrentUser()]);
  const next = `/i/${token}`;

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(47_107_255/0.14),transparent)] px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo className="text-xl" />
      </Link>
      <div className="w-full max-w-md">
        {view.state !== "valid" ? (
          <Card className="space-y-4 text-center">
            <h1 className="text-xl font-semibold">Invitación no disponible</h1>
            <p className="text-sm text-ink-soft">{STATE_MESSAGES[view.state]}</p>
            {view.state === "accepted" && user && (
              <Link href={`/${view.school.slug}`} className={buttonClass("primary", "w-full")}>
                Ir a {view.school.name}
              </Link>
            )}
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-white/70 bg-surface shadow-soft dark:border-line">
            <div className="h-20" style={{ background: view.school.brandColor }} />
            <div className="-mt-10 space-y-5 px-6 pb-6">
              <span
                className="grid size-16 place-items-center rounded-2xl text-xl font-bold text-white ring-4 ring-surface"
                style={{ background: view.school.brandColor }}
              >
                {initials(view.school.name)}
              </span>
              <div>
                <Chip tone="brand">{INVITATION_ROLE_LABELS[view.role]}</Chip>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  Hola {view.invitee.firstName}, {view.school.name} te invita a Podium
                </h1>
                <p className="mt-1 text-sm text-ink-soft">
                  {view.role === "GUARDIAN"
                    ? `Podrás ver las clases, la asistencia y los pagos de ${listNames(view.athleteNames)}.`
                    : view.role === "COACH"
                      ? view.athleteNames.length
                        ? `Verás tus grupos (${listNames(view.athleteNames)}) y podrás tomar asistencia.`
                        : "Verás tus grupos y podrás tomar asistencia."
                      : "Podrás ver tus clases y tu progreso."}
                </p>
              </div>

              {!user ? (
                <div className="space-y-3">
                  <Link
                    href={`/registro?next=${encodeURIComponent(next)}`}
                    className={buttonClass("primary", "w-full")}
                  >
                    Crear mi cuenta
                  </Link>
                  <Link
                    href={`/ingresar?next=${encodeURIComponent(next)}`}
                    className={buttonClass("secondary", "w-full")}
                  >
                    Ya tengo cuenta
                  </Link>
                </div>
              ) : !user.emailVerified ? (
                <Link
                  href={`/verificar-email?next=${encodeURIComponent(next)}`}
                  className={buttonClass("primary", "w-full")}
                >
                  Verificar mi email para continuar
                </Link>
              ) : (
                <>
                  <Alert tone="info">
                    Aceptarás con tu cuenta <strong>{user.email}</strong>.
                  </Alert>
                  <AcceptInvitationForm token={token} schoolName={view.school.name} />
                </>
              )}
              <p className="text-center text-xs text-ink-faint">
                El link vence el{" "}
                {view.expiresAt.toLocaleDateString("es-CO", {
                  day: "numeric",
                  month: "long",
                  timeZone: "America/Bogota",
                })}
                .
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
