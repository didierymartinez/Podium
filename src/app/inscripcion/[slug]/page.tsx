import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Logo, initials } from "@/components/ui";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { publicEnv } from "@/lib/public-env";
import { publicSignupInfo } from "@/modules/signup/public-signup";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Pre-inscripción" };

/** Formulario público de pre-inscripción con clase de prueba (ADM-19). */
export default async function PublicSignupPage({ params }: PageProps<"/inscripcion/[slug]">) {
  const { slug } = await params;
  const [row] = await db.execute<{ id: string | null }>(sql`select school_id_by_slug(${slug}) as id`);
  const info = row?.id ? await publicSignupInfo(db, row.id, todayIn("America/Bogota")) : null;

  return (
    <main className="flex flex-1 flex-col items-center bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(47_107_255/0.14),transparent)] px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo className="text-xl" />
      </Link>
      <div className="w-full max-w-xl">
        {!info ? (
          <Card className="space-y-2 text-center">
            <h1 className="text-xl font-semibold">Pre-inscripción no disponible</h1>
            <p className="text-sm text-ink-soft">
              Esta escuela no está recibiendo pre-inscripciones por aquí. Escríbele directamente.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-white/70 bg-surface shadow-soft dark:border-line">
            <div className="h-20" style={{ background: info.brandColor }} />
            <div className="-mt-10 space-y-5 px-6 pb-6">
              <span
                className="grid size-16 place-items-center rounded-2xl text-xl font-bold text-white ring-4 ring-surface"
                style={{ background: info.brandColor }}
              >
                {initials(info.name)}
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Clase de prueba en {info.name}</h1>
                <p className="mt-1 text-sm text-ink-soft">
                  {info.intro || "Déjanos tus datos, elige el grupo y el día, y te esperamos en la pista."}
                  {info.city ? ` · ${info.city}` : ""}
                </p>
              </div>
              {info.groups.length === 0 ? (
                <p className="text-sm text-ink-soft">Por ahora no hay grupos con cupo. Vuelve pronto.</p>
              ) : (
                <SignupForm slug={slug} groups={info.groups} turnstileSiteKey={publicEnv.turnstileSiteKey} />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
