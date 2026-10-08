import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { serverEnv } from "@/env";
import { formatDayTitle } from "@/lib/dates";
import { checkInView, validCheckInToken } from "@/modules/attendance/check-in";
import { getSchoolContext } from "../../data";
import { CheckInForm } from "./check-in-form";

export const metadata: Metadata = { title: "Check-in" };

/** Página que abre el QR de la clase (DEP-25). */
export default async function CheckInPage({
  params,
  searchParams,
}: PageProps<"/[slug]/check-in/[sessionId]">) {
  const { slug, sessionId } = await params;
  const token = (await searchParams).t;
  const { school, user } = await getSchoolContext(slug);
  const valid =
    /^[0-9a-f-]{36}$/i.test(sessionId) &&
    typeof token === "string" &&
    validCheckInToken(serverEnv().SESSION_SECRET, sessionId, token);
  const view = valid
    ? await asPortalUser(user.id, () => checkInView(db, school.id, sessionId, school.timezone, new Date()))
    : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Check-in" subtitle={school.name} />
      <Card className="space-y-4">
        {!view || !view.ok ? (
          <p className="text-sm text-ink-soft">
            {view && !view.ok && view.error === "canceled"
              ? "Esta clase fue cancelada."
              : "Este código no corresponde a una clase. Escanea el QR que muestra el profesor."}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <QrCode className="size-8 text-brand" />
              <div>
                <p className="font-semibold">{view.session.groupName}</p>
                <p className="text-sm capitalize text-ink-soft">
                  {formatDayTitle(view.session.date)} · {view.session.startTime} – {view.session.endTime}
                </p>
              </div>
            </div>
            {view.athletes.length === 0 ? (
              <p className="text-sm text-ink-soft">No tienes alumnos en esta clase.</p>
            ) : view.window === "early" ? (
              <p className="text-sm text-ink-soft">El check-in abre 30 minutos antes de la clase.</p>
            ) : view.window === "closed" ? (
              <p className="text-sm text-ink-soft">La clase ya terminó.</p>
            ) : (
              <CheckInForm
                slug={slug}
                sessionId={sessionId}
                token={token as string}
                athletes={view.athletes}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
