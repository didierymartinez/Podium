import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { validCheckInToken } from "@/modules/attendance/check-in";
import { getMemberHome } from "@/modules/portal/member-home";
import { getSchoolContext } from "../data";
import { SelfCheckIn } from "./self-check-in";

export const metadata: Metadata = { title: "Ingreso" };

/** Página que abre el QR de recepción del gimnasio. */
export default async function GymEntryPage({ params, searchParams }: PageProps<"/[slug]/ingreso">) {
  const { slug } = await params;
  const { t } = await searchParams;
  const { school, user } = await getSchoolContext(slug);
  const valid = typeof t === "string" && validCheckInToken(serverEnv().SESSION_SECRET, `gym:${school.id}`, t);
  const home = valid ? await getMemberHome(db, school.id, user.id) : null;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="Ingreso" subtitle={school.name} />
      <Card>
        {!home ? (
          <p className="text-sm text-ink-soft">Escanea el código QR de la recepción del gimnasio.</p>
        ) : home.athletes.length === 0 ? (
          <p className="text-sm text-ink-soft">Tu cuenta no tiene una membresía en este gimnasio.</p>
        ) : (
          <SelfCheckIn
            slug={slug}
            token={t as string}
            people={home.athletes.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}` }))}
          />
        )}
      </Card>
    </div>
  );
}
