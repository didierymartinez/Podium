import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { listUserSchools } from "@/modules/schools/queries";
import { ROLE_LABELS } from "@/modules/schools/labels";

export const metadata: Metadata = { title: "Mis escuelas" };

export default async function SchoolsPage() {
  const user = await requireVerifiedUser();
  const schools = await listUserSchools(db, user.id);

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Mis escuelas</h1>
          {schools.length > 0 && (
            <Link href="/nueva-escuela" className="text-sm font-semibold text-brand">
              + Crear otra escuela
            </Link>
          )}
        </div>

        {schools.length === 0 ? (
          <Card className="text-center">
            <h2 className="text-lg font-semibold">Aún no tienes escuelas</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
              Crea tu escuela en menos de un minuto y pruébala gratis durante 30 días. Si te invitaron a una
              escuela, abre el enlace de la invitación.
            </p>
            <Link
              href="/nueva-escuela"
              className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Crear mi escuela
            </Link>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {schools.map((school) => (
              <li key={school.id}>
                <Link href={`/${school.slug}`} className="block">
                  <Card className="transition-colors hover:border-brand">
                    <p className="font-semibold">{school.name}</p>
                    <p className="text-sm text-ink-soft">
                      {school.city} · {school.roles.map((r) => ROLE_LABELS[r]).join(", ")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
